import "server-only";
import { sql, type Tx } from "../db";
import { classifyDuplicate, type DedupeVerdict } from "../dedupe";
import { normalizeEmail, normalizeIndianMobile } from "../phone";
import { queueAck } from "./outbox";

export type Source = "portal" | "social" | "website" | "hoarding" | "chat";
export const SOURCES: Source[] = ["portal", "social", "website", "hoarding", "chat"];
export const SOURCE_LABEL: Record<Source, string> = {
  portal: "Property portal", social: "Social media ad", website: "Website", hoarding: "Hoarding call", chat: "Web chat",
};

export function parseSource(v: string | null | undefined): Source | null {
  const s = (v ?? "").toLowerCase();
  if (/portal|99acres|magicbricks|housing|nobroker/.test(s)) return "portal";
  if (/social|facebook|instagram|meta|ad\b|ads\b/.test(s)) return "social";
  if (/hoarding|billboard|call/.test(s)) return "hoarding";
  if (/web\s*chat|chat/.test(s)) return "chat";
  if (/web|site|form/.test(s)) return "website";
  return null;
}

export type LeadInput = {
  name: string;
  phone?: string | null;
  email?: string | null;
  projectId?: string | null;
  wants?: string | null;
  budget?: string | null;
  language?: "en" | "hi" | "gu";
  source: Source;
  consent: boolean;
  note?: string | null;
  buyerUserId?: string | null;
};

export type UpsertResult = { leadId: string; code: string; verdict: DedupeVerdict["kind"]; matchedOn?: string; acked: boolean };

export class LeadInputError extends Error {}

/**
 * One lead list from every source:
 * - same phone or e-mail → the existing lead gets a new source touch (no second row; unique indexes enforce it)
 * - similar name, different contact → a new lead flagged as a possible duplicate for a person to merge
 * - otherwise a new lead; if the buyer consented, the opt-in acknowledgement goes out at once.
 */
export async function upsertLead(tx: Tx, input: LeadInput): Promise<UpsertResult> {
  const phone = normalizeIndianMobile(input.phone);
  const email = normalizeEmail(input.email);
  const name = input.name.trim().replace(/\s+/g, " ").slice(0, 120);
  if (!name) throw new LeadInputError("Name is required.");
  if (!phone && !email) throw new LeadInputError("A valid Indian mobile number or e-mail is required.");

  const exact = await tx<{ id: string; name: string; phone: string | null; email: string | null }[]>`
    select id, name, phone, email from leads
     where (${phone}::text is not null and phone = ${phone}) or (${email}::text is not null and email = ${email})
     for update`;
  const fuzzy = exact.length ? [] : await tx<{ id: string; name: string; phone: string | null; email: string | null }[]>`
    select id, name, phone, email from leads
     where similarity(name, ${name}) > 0.45
       and (${input.projectId ?? null}::uuid is null or project_id is null or project_id = ${input.projectId ?? null})
     order by similarity(name, ${name}) desc limit 10`;

  const verdict = classifyDuplicate({ name, phone, email }, [...exact, ...fuzzy]);

  if (verdict.kind === "same") {
    const [l] = await tx<{ id: string; code: string }[]>`
      update leads set
        phone = coalesce(phone, ${phone}),
        email = coalesce(email, ${email}),
        project_id = coalesce(project_id, ${input.projectId ?? null}),
        wants = coalesce(${input.wants ?? null}, wants),
        budget = coalesce(${input.budget ?? null}, budget),
        buyer_user_id = coalesce(buyer_user_id, ${input.buyerUserId ?? null}),
        consent_at = case when ${input.consent} and opted_out_at is null then coalesce(consent_at, now()) else consent_at end
      where id = ${verdict.leadId} returning id, code`;
    await tx`insert into lead_touches (lead_id, source, note) values (${l.id}, ${input.source}, ${input.note ?? `Repeat enquiry (matched on ${verdict.matchedOn})`})`;
    return { leadId: l.id, code: l.code, verdict: "same", matchedOn: verdict.matchedOn, acked: false };
  }

  const [l] = await tx<{ id: string; code: string }[]>`
    insert into leads (name, phone, email, project_id, wants, budget, language, consent_at, duplicate_hint, buyer_user_id)
    values (${name}, ${phone}, ${email}, ${input.projectId ?? null}, ${input.wants ?? null}, ${input.budget ?? null},
            ${input.language ?? "en"}, ${input.consent ? new Date() : null},
            ${verdict.kind === "possible" ? verdict.leadId : null}, ${input.buyerUserId ?? null})
    returning id, code`;
  await tx`insert into lead_touches (lead_id, source, note) values (${l.id}, ${input.source}, ${input.note ?? null})`;
  const acked = input.source === "chat" ? false : await queueAck(tx, l.id, input.projectId ?? null);
  return { leadId: l.id, code: l.code, verdict: verdict.kind, acked };
}

/** Merge a flagged possible duplicate into the original lead. Touches, chats and visits move over. */
export async function mergeLeads(dupId: string, intoId: string, actorId: string) {
  if (dupId === intoId) throw new LeadInputError("Cannot merge a lead into itself.");
  return sql.begin(async (tx) => {
    const rows = await tx<{ id: string; phone: string | null; email: string | null }[]>`
      select id, phone, email from leads where id in (${dupId}, ${intoId}) for update`;
    if (rows.length !== 2) throw new LeadInputError("Lead not found.");
    const dup = rows.find((r) => r.id === dupId)!;
    const active = await tx`select 1 from visits where lead_id in (${dupId}, ${intoId}) and status = 'booked'`;
    if (active.length > 1) throw new LeadInputError("Both leads have an upcoming visit. Cancel one first.");
    await tx`update lead_touches set lead_id = ${intoId} where lead_id = ${dupId}`;
    await tx`update conversations set lead_id = ${intoId} where lead_id = ${dupId}`;
    await tx`update visits set lead_id = ${intoId} where lead_id = ${dupId}`;
    await tx`update outbox set lead_id = ${intoId} where lead_id = ${dupId}`;
    await tx`update leads set duplicate_hint = null where duplicate_hint = ${dupId}`;
    await tx`delete from leads where id = ${dupId}`;
    await tx`update leads set
               phone = coalesce(phone, ${dup.phone}), email = coalesce(email, ${dup.email}), duplicate_hint = null
             where id = ${intoId}`;
    await tx`insert into audit_log (actor_id, action, entity, entity_id, detail)
             values (${actorId}, 'merge', 'lead', ${intoId}, ${tx.json({ merged: dupId })})`;
  });
}
