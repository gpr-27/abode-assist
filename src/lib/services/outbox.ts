import "server-only";
import { sql, type Tx } from "../db";
import { planReminders, renderMessage, TEMPLATES } from "../reminders";

export function appUrl() {
  return process.env.APP_URL ?? (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : "http://localhost:3000");
}

type MsgCtxRow = {
  lead_id: string; buyer_name: string; optout_token: string; opted_out_at: Date | null; consent_at: Date | null;
  project_name: string; rera_no: string; address: string; map_url: string; executive_name: string | null;
};

async function ctxForLead(tx: Tx, leadId: string, projectId: string | null) {
  // No project yet (e.g. a hoarding call): the message names the developer and lists every RERA number.
  const [r] = await tx<MsgCtxRow[]>`
    select l.id as lead_id, l.name as buyer_name, l.optout_token, l.opted_out_at, l.consent_at,
           coalesce(p.name, 'Company A Homes') as project_name,
           coalesce(p.rera_no, (select string_agg(name || ': ' || rera_no, '; ' order by name) from projects)) as rera_no,
           coalesce(p.address, 'our site offices in Shela and Gota') as address,
           coalesce(p.map_url, '') as map_url, u.name as executive_name
      from leads l
      left join projects p on p.id = coalesce(${projectId}::uuid, l.project_id)
      left join users u on u.id = l.assigned_to
     where l.id = ${leadId}`;
  return r;
}

const ctx = (r: MsgCtxRow, startsAt: Date) => ({
  buyerName: r.buyer_name, projectName: r.project_name, reraNo: r.rera_no, address: r.address, mapUrl: r.map_url,
  executiveName: r.executive_name, startsAt, optoutUrl: `${appUrl()}/optout/${r.optout_token}`,
});

/** Opt-in acknowledgement for a new lead. Counts as the first response. No consent → nothing is sent. */
export async function queueAck(tx: Tx, leadId: string, projectId: string | null): Promise<boolean> {
  const r = await ctxForLead(tx, leadId, projectId);
  if (!r || !r.consent_at || r.opted_out_at) return false;
  await tx`insert into outbox (lead_id, kind, template, body, send_at, status, sent_at)
           values (${leadId}, 'ack', ${TEMPLATES.ack}, ${renderMessage("ack", ctx(r, new Date()))}, now(), 'sent', now())`;
  await tx`update leads set first_response_at = coalesce(first_response_at, now()) where id = ${leadId}`;
  return true;
}

/** Confirmation now + reminders 1 day and 2 hours before. */
export async function queueVisitMessages(tx: Tx, leadId: string, visitId: string, projectId: string, startsAt: Date) {
  const r = await ctxForLead(tx, leadId, projectId);
  if (!r) return;
  const optedOut = !!r.opted_out_at;
  const c = ctx(r, startsAt);
  await tx`insert into outbox (lead_id, visit_id, kind, template, body, send_at, status, sent_at, status_note)
           values (${leadId}, ${visitId}, 'confirmation', ${TEMPLATES.confirmation}, ${renderMessage("confirmation", c)}, now(),
                   ${optedOut ? "skipped" : "sent"}, ${optedOut ? null : new Date()}, ${optedOut ? "Buyer opted out" : null})`;
  for (const p of planReminders(startsAt, new Date(), optedOut)) {
    await tx`insert into outbox (lead_id, visit_id, kind, template, body, send_at, status, status_note)
             values (${leadId}, ${visitId}, ${p.kind}, ${TEMPLATES[p.kind]}, ${renderMessage(p.kind, c)}, ${p.send_at}, ${p.status}, ${p.note ?? null})`;
  }
}

export async function cancelVisitMessages(tx: Tx, visitId: string, note: string) {
  await tx`update outbox set status = 'cancelled', status_note = ${note}
            where visit_id = ${visitId} and status = 'scheduled'`;
}

export async function queueHandoffIntro(tx: Tx, leadId: string) {
  const r = await ctxForLead(tx, leadId, null);
  if (!r || !r.consent_at || r.opted_out_at || !r.executive_name) return;
  await tx`insert into outbox (lead_id, kind, template, body, send_at, status, sent_at)
           values (${leadId}, 'handoff', ${TEMPLATES.handoff}, ${renderMessage("handoff", ctx(r, new Date()))}, now(), 'sent', now())`;
}

/**
 * The mock WhatsApp/SMS gateway: everything due is marked sent.
 * Re-checks opt-out at send time, so a buyer who opts out after booking gets nothing more.
 */
export async function dispatchDue() {
  return sql.begin(async (tx) => {
    const skipped = await tx`
      update outbox o set status = 'skipped', status_note = 'Buyer opted out'
        from leads l
       where l.id = o.lead_id and o.status = 'scheduled' and o.send_at <= now() and l.opted_out_at is not null
      returning o.id`;
    const sent = await tx`
      update outbox set status = 'sent', sent_at = now()
       where status = 'scheduled' and send_at <= now()
      returning id`;
    return { sent: sent.length, skipped: skipped.length };
  });
}

export async function optOut(token: string) {
  return sql.begin(async (tx) => {
    const [l] = await tx<{ id: string; name: string }[]>`
      update leads set opted_out_at = coalesce(opted_out_at, now()) where optout_token = ${token} returning id, name`;
    if (!l) return null;
    await tx`update outbox set status = 'cancelled', status_note = 'Buyer opted out'
              where lead_id = ${l.id} and status = 'scheduled'`;
    await tx`insert into audit_log (action, entity, entity_id) values ('opt_out', 'lead', ${l.id})`;
    return l;
  });
}
