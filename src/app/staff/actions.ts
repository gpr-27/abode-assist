"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { sql } from "@/lib/db";
import { assertRole, destroySession, HttpError, type Session } from "@/lib/auth/session";
import { canAct } from "@/lib/staff/queries";
import { LeadInputError, mergeLeads, parseSource, SOURCES, upsertLead, type Source } from "@/lib/services/leads";
import { bookVisit, cancelVisit, markOutcome } from "@/lib/services/visits";
import { reassign } from "@/lib/services/handoff";
import { dispatchDue } from "@/lib/services/outbox";
import { summarizeLead } from "@/lib/assistant/summary";
import { mapPortalCsv, truthy } from "@/lib/csv";
import { BOOKING_ERRORS } from "@/lib/slots";
import { istInstant } from "@/lib/time";
import { VISIT_MINUTES } from "@/lib/slots";

export type ActionState = { ok?: string; error?: string; fieldErrors?: Record<string, string>; report?: ImportReport } | null;
export type ImportReport = { created: number; merged: number; possible: number; rejected: { row: number; reason: string }[]; total: number };

const uuid = z.string().uuid();

function fail(err: unknown): ActionState {
  if (err instanceof HttpError) return { error: err.message };
  if (err instanceof LeadInputError) return { error: err.message };
  if (err instanceof z.ZodError) return { error: err.issues[0]?.message ?? "Check the form and try again." };
  console.error("staff action failed", (err as Error)?.message);
  return { error: "Something went wrong on our side. Try again in a moment." };
}

async function leadForAction(session: Session, leadId: string) {
  const [lead] = await sql<{ id: string; assigned_to: string | null; status: string; opted_out_at: Date | null }[]>`
    select id, assigned_to, status, opted_out_at from leads where id = ${leadId}`;
  if (!lead) throw new HttpError(404, "This lead no longer exists.");
  if (!canAct(session, lead)) throw new HttpError(403, "This lead belongs to another executive. Ask the sales head to reassign it.");
  return lead;
}

const audit = (actorId: string, action: string, entity: string, entityId: string, detail: Record<string, unknown> = {}) =>
  sql`insert into audit_log (actor_id, action, entity, entity_id, detail) values (${actorId}, ${action}, ${entity}, ${entityId}, ${sql.json(detail as never)})`;

export async function signOut() {
  await destroySession();
  redirect("/login");
}

// ───────────── Leads ─────────────

const AddLead = z.object({
  name: z.string().trim().min(2, "Enter the buyer's name.").max(120),
  phone: z.string().trim().max(20).optional().default(""),
  email: z.string().trim().max(160).optional().default(""),
  project: z.string().optional().default(""),
  wants: z.enum(["", "2 BHK", "3 BHK", "2 or 3 BHK"]).default(""),
  source: z.enum(SOURCES as [Source, ...Source[]]),
  consent: z.string().optional(),
});

export async function addLead(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    await assertRole("executive", "head");
    const d = AddLead.parse(Object.fromEntries(fd));
    const [project] = d.project ? await sql<{ id: string }[]>`select id from projects where slug = ${d.project}` : [];
    const r = await sql.begin((tx) => upsertLead(tx, {
      name: d.name, phone: d.phone || null, email: d.email || null, projectId: project?.id ?? null, wants: d.wants || null,
      source: d.source, consent: d.consent === "on", note: "Added by staff",
    }));
    revalidatePath("/staff/leads");
    if (r.verdict === "same") return { ok: `Already in the list as ${r.code} (same ${r.matchedOn}). Added a new source touch instead of a duplicate.` };
    if (r.verdict === "possible") return { ok: `Added ${r.code}. It looks like an existing lead, so it's flagged for review.` };
    const why = r.acked ? " The WhatsApp acknowledgement went out."
      : d.consent !== "on" ? " No consent, so no message was sent; call the buyer."
      : " The acknowledgement wasn't sent; call the buyer.";
    return { ok: `Added ${r.code}.${why}` };
  } catch (e) { return fail(e); }
}

export async function importCsv(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    await assertRole("executive", "head");
    const file = fd.get("file");
    let text = String(fd.get("text") ?? "");
    if (file instanceof File && file.size > 0) {
      if (file.size > 1_000_000) return { error: "The file is larger than 1 MB. Split it and import the parts." };
      text = await file.text();
    }
    if (!text.trim()) return { error: "Choose a CSV file or paste rows first." };
    const defaultSource = parseSource(String(fd.get("source") ?? "portal")) ?? "portal";
    const { rows, errors } = mapPortalCsv(text);
    if (errors.length) return { error: errors.join(" ") };
    if (rows.length > 2000) return { error: "Import at most 2,000 rows at a time." };
    const projects = await sql<{ id: string; slug: string; name: string }[]>`select id, slug, name from projects`;
    const findProject = (v: string) => {
      const s = v.trim().toLowerCase();
      if (!s) return null;
      return projects.find((p) => p.slug === s || p.name.toLowerCase() === s || s.replace(/\s+/g, "-") === p.slug)?.id ?? null;
    };
    const report: ImportReport = { created: 0, merged: 0, possible: 0, rejected: [], total: rows.length };
    for (const [i, row] of rows.entries()) {
      try {
        const wants = /3/.test(row.wants) ? "3 BHK" : /2/.test(row.wants) ? "2 BHK" : null;
        const r = await sql.begin((tx) => upsertLead(tx, {
          name: row.name, phone: row.phone || null, email: row.email || null, projectId: findProject(row.project), wants,
          source: parseSource(row.source) ?? defaultSource, consent: truthy(row.consent), note: row.note ? `CSV: ${row.note.slice(0, 200)}` : "CSV import",
        }));
        if (r.verdict === "same") report.merged++;
        else if (r.verdict === "possible") { report.created++; report.possible++; }
        else report.created++;
      } catch (e) {
        report.rejected.push({ row: i + 2, reason: e instanceof LeadInputError ? e.message : "Could not be saved." });
      }
    }
    revalidatePath("/staff/leads");
    return { ok: `Imported ${report.total} rows.`, report };
  } catch (e) { return fail(e); }
}

export async function updateStatus(leadId: string, status: string): Promise<ActionState> {
  try {
    const s = await assertRole("executive", "head");
    uuid.parse(leadId);
    const st = z.enum(["new", "engaged", "handed_off", "visit_booked", "visited", "lost"]).parse(status);
    await leadForAction(s, leadId);
    await sql`update leads set status = ${st} where id = ${leadId}`;
    await audit(s.userId, "status", "lead", leadId, { status: st });
    revalidatePath(`/staff/leads/${leadId}`);
    return { ok: "Status updated." };
  } catch (e) { return fail(e); }
}

export async function takeLead(leadId: string): Promise<ActionState> {
  try {
    const s = await assertRole("executive", "head");
    uuid.parse(leadId);
    const [l] = await sql`update leads set assigned_to = ${s.userId} where id = ${leadId} and assigned_to is null returning id`;
    if (!l) return { error: "Someone else took this lead a moment ago." };
    await audit(s.userId, "assign", "lead", leadId, { to: s.userId, reason: "self" });
    revalidatePath(`/staff/leads/${leadId}`);
    return { ok: "This lead is now yours." };
  } catch (e) { return fail(e); }
}

export async function reassignLead(leadId: string, toUserId: string): Promise<ActionState> {
  try {
    const s = await assertRole("head");
    uuid.parse(leadId); uuid.parse(toUserId);
    const ok = await reassign(leadId, toUserId, s.userId);
    if (!ok) return { error: "That executive can't take leads right now." };
    revalidatePath(`/staff/leads/${leadId}`);
    return { ok: "Reassigned." };
  } catch (e) { return fail(e); }
}

export async function mergeLead(dupId: string, intoId: string): Promise<ActionState> {
  try {
    const s = await assertRole("head");
    uuid.parse(dupId); uuid.parse(intoId);
    await mergeLeads(dupId, intoId, s.userId);
    revalidatePath("/staff/leads");
  } catch (e) { return fail(e); }
  redirect(`/staff/leads/${intoId}`);
}

export async function notDuplicate(leadId: string): Promise<ActionState> {
  try {
    const s = await assertRole("executive", "head");
    uuid.parse(leadId);
    await leadForAction(s, leadId);
    await sql`update leads set duplicate_hint = null where id = ${leadId}`;
    await audit(s.userId, "not_duplicate", "lead", leadId);
    revalidatePath(`/staff/leads/${leadId}`);
    return { ok: "Marked as a different person." };
  } catch (e) { return fail(e); }
}

export async function refreshSummary(leadId: string): Promise<ActionState> {
  try {
    const s = await assertRole("executive", "head");
    uuid.parse(leadId);
    await leadForAction(s, leadId);
    const [c] = await sql<{ id: string }[]>`select id from conversations where lead_id = ${leadId} order by updated_at desc limit 1`;
    if (!c) return { error: "This lead has no chat yet, so there is nothing to summarise." };
    await summarizeLead(c.id);
    revalidatePath(`/staff/leads/${leadId}`);
    return { ok: "Summary refreshed." };
  } catch (e) { return fail(e); }
}

const Reply = z.object({ leadId: uuid, conversationId: uuid, text: z.string().trim().min(1, "Write a message first.").max(1000) });

export async function sendReply(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const s = await assertRole("executive", "head");
    const d = Reply.parse(Object.fromEntries(fd));
    const lead = await leadForAction(s, d.leadId);
    if (lead.opted_out_at) return { error: "This buyer opted out. Don't message them." };
    const [c] = await sql`select id from conversations where id = ${d.conversationId} and lead_id = ${d.leadId}`;
    if (!c) return { error: "That chat isn't linked to this lead." };
    await sql.begin(async (tx) => {
      await tx`insert into messages (conversation_id, role, content, author_id) values (${d.conversationId}, 'executive', ${d.text}, ${s.userId})`;
      await tx`update conversations set updated_at = now() where id = ${d.conversationId}`;
      await tx`update leads set first_response_at = coalesce(first_response_at, now()),
                 status = case when status = 'new' then 'engaged'::lead_status else status end where id = ${d.leadId}`;
    });
    revalidatePath(`/staff/leads/${d.leadId}`);
    return { ok: "Sent. The buyer sees it in their chat." };
  } catch (e) { return fail(e); }
}

export async function logCall(leadId: string): Promise<ActionState> {
  try {
    const s = await assertRole("executive", "head");
    uuid.parse(leadId);
    await leadForAction(s, leadId);
    await sql`update leads set first_response_at = coalesce(first_response_at, now()),
                status = case when status = 'new' then 'engaged'::lead_status else status end where id = ${leadId}`;
    await audit(s.userId, "call", "lead", leadId);
    revalidatePath(`/staff/leads/${leadId}`);
    revalidatePath("/staff/leads");
    return { ok: "Call logged." };
  } catch (e) { return fail(e); }
}

export async function bookForLead(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const s = await assertRole("executive", "head");
    const d = z.object({ leadId: uuid, slotId: z.string().uuid("Choose a time first.") }).parse(Object.fromEntries(fd));
    await leadForAction(s, d.leadId);
    const r = await bookVisit({ leadId: d.leadId, slotId: d.slotId, via: "executive", actorId: s.userId });
    if (!r.ok) {
      const extra = r.code === "NO_CONSENT" ? " Record the buyer's consent first (ask them on the call)." : "";
      return { error: `${BOOKING_ERRORS[r.code] ?? "That time couldn't be booked."}${extra}` };
    }
    revalidatePath(`/staff/leads/${d.leadId}`);
    revalidatePath("/staff/visits");
    return { ok: r.alreadyBooked ? "That visit was already booked." : r.rescheduledFrom ? "Visit moved. Reminders updated." : "Visit booked. Confirmation sent, reminders scheduled." };
  } catch (e) { return fail(e); }
}

export async function recordConsent(leadId: string): Promise<ActionState> {
  try {
    const s = await assertRole("executive", "head");
    uuid.parse(leadId);
    const lead = await leadForAction(s, leadId);
    if (lead.opted_out_at) return { error: "This buyer opted out. Consent can only come from the buyer again." };
    await sql`update leads set consent_at = coalesce(consent_at, now()) where id = ${leadId}`;
    await audit(s.userId, "consent_verbal", "lead", leadId);
    revalidatePath(`/staff/leads/${leadId}`);
    return { ok: "Consent recorded (given on a call)." };
  } catch (e) { return fail(e); }
}

export async function cancelLeadVisit(visitId: string, leadId: string): Promise<ActionState> {
  try {
    const s = await assertRole("executive", "head");
    uuid.parse(visitId); uuid.parse(leadId);
    await leadForAction(s, leadId);
    const ok = await cancelVisit(visitId, s.userId, "Cancelled by staff", leadId);
    revalidatePath(`/staff/leads/${leadId}`);
    revalidatePath("/staff/visits");
    return ok ? { ok: "Visit cancelled. Pending reminders were stopped." } : { error: "This visit is no longer booked." };
  } catch (e) { return fail(e); }
}

export async function markVisit(visitId: string, outcome: "visited" | "no_show"): Promise<ActionState> {
  try {
    const s = await assertRole("executive", "head");
    uuid.parse(visitId);
    z.enum(["visited", "no_show"]).parse(outcome);
    const [visit] = await sql<{ lead_id: string }[]>`select lead_id from visits where id = ${visitId}`;
    if (!visit) return { error: "This visit no longer exists." };
    await leadForAction(s, visit.lead_id); // an executive can only record outcomes for their own leads
    const ok = await markOutcome(visitId, outcome, s.userId);
    revalidatePath("/staff/visits");
    return ok ? { ok: outcome === "visited" ? "Marked as visited." : "Marked as no show." } : { error: "Only visits that have started can be marked." };
  } catch (e) { return fail(e); }
}

// ───────────── Review ─────────────

export async function markReviewed(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const s = await assertRole("head");
    const d = z.object({ conversationId: uuid, note: z.string().trim().max(500).optional().default("") }).parse(Object.fromEntries(fd));
    await sql`update conversations set reviewed_at = now(), reviewed_by = ${s.userId}, review_note = ${d.note || null} where id = ${d.conversationId}`;
    await audit(s.userId, "review", "conversation", d.conversationId, { note: d.note });
    revalidatePath("/staff/review");
    revalidatePath("/staff", "layout");
    return { ok: "Marked reviewed." };
  } catch (e) { return fail(e); }
}

// ───────────── Fact sheet ─────────────

const Fact = z.object({
  id: z.string().uuid().optional().or(z.literal("")),
  project: z.string().default(""),
  topic: z.string().trim().min(2, "Topic needs at least 2 characters.").max(80, "Keep the topic under 80 characters."),
  answer: z.string().trim().min(2, "Write the answer.").max(1200, "Keep the answer under 1,200 characters."),
});

export async function saveFact(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const s = await assertRole("head");
    const d = Fact.parse(Object.fromEntries(fd));
    const [project] = d.project ? await sql<{ id: string }[]>`select id from projects where slug = ${d.project}` : [];
    if (d.project && !project) return { error: "That project doesn't exist." };
    if (d.id) {
      const [f] = await sql`update facts set topic = ${d.topic}, answer = ${d.answer}, project_id = ${project?.id ?? null}, updated_by = ${s.userId}, updated_at = now()
                            where id = ${d.id} returning id`;
      if (!f) return { error: "This fact was deleted by someone else." };
      await audit(s.userId, "fact_update", "fact", d.id, { topic: d.topic });
    } else {
      const [f] = await sql<{ id: string }[]>`insert into facts (project_id, topic, answer, updated_by) values (${project?.id ?? null}, ${d.topic}, ${d.answer}, ${s.userId}) returning id`;
      await audit(s.userId, "fact_create", "fact", f.id, { topic: d.topic });
    }
    revalidatePath("/staff/facts");
    revalidatePath("/", "layout");
    return { ok: d.id ? "Saved. The assistant uses it from the next message." : "Added. The assistant uses it from the next message." };
  } catch (e) { return fail(e); }
}

export async function deleteFact(id: string): Promise<ActionState> {
  try {
    const s = await assertRole("head");
    uuid.parse(id);
    const [f] = await sql<{ topic: string }[]>`delete from facts where id = ${id} returning topic`;
    if (f) await audit(s.userId, "fact_delete", "fact", id, { topic: f.topic });
    revalidatePath("/staff/facts");
    revalidatePath("/", "layout");
    return { ok: "Deleted." };
  } catch (e) { return fail(e); }
}

// ───────────── Slots ─────────────

export async function toggleSlot(slotId: string): Promise<ActionState> {
  try {
    const s = await assertRole("head");
    uuid.parse(slotId);
    const [r] = await sql<{ active: boolean }[]>`update visit_slots set active = not active where id = ${slotId} and starts_at > now() returning active`;
    if (!r) return { error: "Past slots can't be changed." };
    await audit(s.userId, r.active ? "slot_open" : "slot_close", "slot", slotId);
    revalidatePath("/staff/slots");
    return { ok: r.active ? "Slot opened." : "Slot closed. Existing bookings stay; no new ones." };
  } catch (e) { return fail(e); }
}

export async function setCapacity(slotId: string, capacity: number): Promise<ActionState> {
  try {
    const s = await assertRole("head");
    uuid.parse(slotId);
    const cap = z.number().int().min(1, "Capacity must be at least 1.").max(20, "Capacity can be at most 20.").parse(capacity);
    return await sql.begin(async (tx) => {
      const [slot] = await tx<{ id: string }[]>`select id from visit_slots where id = ${slotId} and starts_at > now() for update`;
      if (!slot) return { error: "Past slots can't be changed." };
      const [{ held }] = await tx<{ held: number }[]>`select count(*)::int as held from visits where slot_id = ${slotId} and status = 'booked'`;
      if (cap < held) return { error: `${held} visitors are already booked in this slot. Capacity can't go below ${held}.` };
      await tx`update visit_slots set capacity = ${cap} where id = ${slotId}`;
      await tx`insert into audit_log (actor_id, action, entity, entity_id, detail) values (${s.userId}, 'slot_capacity', 'slot', ${slotId}, ${tx.json({ capacity: cap })})`;
      revalidatePath("/staff/slots");
      return { ok: `Capacity set to ${cap}.` };
    });
  } catch (e) { return fail(e); }
}

const AddSlots = z.object({
  project: z.string().min(1, "Choose a project."),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Choose a date."),
  from: z.coerce.number().int().min(6).max(21),
  to: z.coerce.number().int().min(7).max(22),
  capacity: z.coerce.number().int().min(1).max(20),
}).refine((d) => d.to > d.from, { message: "The end hour must be after the start hour." });

export async function addSlots(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const s = await assertRole("head");
    const d = AddSlots.parse(Object.fromEntries(fd));
    const [project] = await sql<{ id: string }[]>`select id from projects where slug = ${d.project}`;
    if (!project) return { error: "That project doesn't exist." };
    let added = 0;
    for (let h = d.from; h < d.to; h++) {
      const starts = istInstant(d.date, h);
      if (starts.getTime() <= Date.now()) continue;
      const r = await sql`insert into visit_slots (project_id, starts_at, ends_at, capacity)
                          values (${project.id}, ${starts}, ${new Date(starts.getTime() + VISIT_MINUTES * 60_000)}, ${d.capacity})
                          on conflict (project_id, starts_at) do nothing returning id`;
      added += r.length;
    }
    await audit(s.userId, "slots_add", "project", project.id, { date: d.date, from: d.from, to: d.to, added });
    revalidatePath("/staff/slots");
    return added ? { ok: `Added ${added} slot${added === 1 ? "" : "s"}.` } : { error: "No new slots: those times already exist or are in the past." };
  } catch (e) { return fail(e); }
}

// ───────────── Outbox ─────────────

export async function sendDueNow(): Promise<ActionState> {
  try {
    await assertRole("executive", "head");
    const r = await dispatchDue();
    revalidatePath("/staff/messages");
    return { ok: r.sent || r.skipped ? `Sent ${r.sent}, skipped ${r.skipped} (opted out).` : "Nothing was due." };
  } catch (e) { return fail(e); }
}
