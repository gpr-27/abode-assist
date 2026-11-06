import "server-only";
import { sql } from "../db";
import { chooseExecutive, type Candidate } from "../assign";
import { queueHandoffIntro } from "./outbox";

export type HandoffReason = "buyer_request" | "missing_fact" | "serious_buyer" | "price_question" | "guardrail" | "assistant_unavailable" | "other";

export const HANDOFF_LABEL: Record<HandoffReason, string> = {
  buyer_request: "Buyer asked for a person",
  missing_fact: "Question not in fact sheet",
  serious_buyer: "Serious buyer",
  price_question: "Price or discount question",
  guardrail: "Reply blocked by guardrail",
  assistant_unavailable: "Assistant unavailable",
  other: "Other",
};

/**
 * Hand a conversation's lead to a named executive.
 * Keeps an existing assignee; otherwise picks the least-loaded executive on that project.
 * Returns the executive, or null when the chat has no lead yet (contact details still needed).
 */
export async function handoff(conversationId: string, reason: HandoffReason, note?: string): Promise<{ executive: { id: string; name: string } | null; leadId: string | null }> {
  return sql.begin(async (tx) => {
    const [c] = await tx<{ id: string; lead_id: string | null; project_id: string | null }[]>`
      select id, lead_id, project_id from conversations where id = ${conversationId} for update`;
    if (!c) return { executive: null, leadId: null };
    await tx`update conversations set handoff_at = coalesce(handoff_at, now()),
               handoff_reason = coalesce(handoff_reason, ${reason}) where id = ${c.id}`;
    if (!c.lead_id) return { executive: null, leadId: null };

    const [lead] = await tx<{ id: string; assigned_to: string | null; project_id: string | null; status: string }[]>`
      select id, assigned_to, project_id, status from leads where id = ${c.lead_id} for update`;
    let exec: { id: string; name: string } | null = null;
    if (lead.assigned_to) {
      [exec] = await tx<{ id: string; name: string }[]>`select id, name from users where id = ${lead.assigned_to}`;
    } else {
      const projectId = lead.project_id ?? c.project_id;
      const cands = await tx<Candidate[]>`
        select u.id, u.name,
               (select count(*)::int from leads l where l.assigned_to = u.id and l.status in ('engaged','handed_off','visit_booked')) as "openLeads",
               (select max(created_at) from audit_log a where a.action = 'assign' and a.detail->>'to' = u.id::text) as "lastAssignedAt"
          from users u
         where u.role = 'executive' and u.active
           and (${projectId}::uuid is null or exists (select 1 from project_executives pe where pe.user_id = u.id and pe.project_id = ${projectId}))`;
      const pick = chooseExecutive(cands);
      if (pick) {
        exec = { id: pick.id, name: pick.name };
        await tx`update leads set assigned_to = ${pick.id} where id = ${lead.id}`;
        await tx`insert into audit_log (action, entity, entity_id, detail)
                 values ('assign', 'lead', ${lead.id}, ${tx.json({ to: pick.id, reason, note: note ?? null })})`;
      }
    }
    if (["new", "engaged"].includes(lead.status)) await tx`update leads set status = 'handed_off' where id = ${lead.id}`;
    await tx`insert into messages (conversation_id, role, content, meta)
             values (${c.id}, 'system', ${`Handed to ${exec?.name ?? "the sales team"} · ${HANDOFF_LABEL[reason]}${note ? ` · ${note}` : ""}`},
                     ${tx.json({ kind: "handoff", reason })})`;
    if (exec && !lead.assigned_to) await queueHandoffIntro(tx, lead.id);
    return { executive: exec, leadId: lead.id };
  });
}

export async function reassign(leadId: string, toUserId: string, actorId: string) {
  return sql.begin(async (tx) => {
    const [u] = await tx<{ id: string }[]>`select id from users where id = ${toUserId} and role = 'executive' and active`;
    if (!u) return false;
    const [l] = await tx`update leads set assigned_to = ${toUserId} where id = ${leadId} returning id`;
    if (!l) return false;
    await tx`insert into audit_log (actor_id, action, entity, entity_id, detail)
             values (${actorId}, 'assign', 'lead', ${leadId}, ${tx.json({ to: toUserId, reason: "manual" })})`;
    return true;
  });
}
