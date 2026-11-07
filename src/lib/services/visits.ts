import "server-only";
import { sql, dbErrorCode, type Tx } from "../db";
import { freeSlots, MIN_LEAD_MINUTES, type FreeSlot, type SlotRow } from "../slots";
import { cancelVisitMessages, queueVisitMessages } from "./outbox";

export async function loadSlots(projectId: string, days = 14, db: typeof sql | Tx = sql): Promise<FreeSlot[]> {
  const rows = await db<SlotRow[]>`
    select s.id, s.project_id, s.starts_at, s.ends_at, s.capacity, s.active,
           (select count(*)::int from visits v where v.slot_id = s.id and v.status = 'booked') as held
      from visit_slots s
     where s.project_id = ${projectId}
       and s.starts_at > now() and s.starts_at < now() + ${`${days} days`}::interval
     order by s.starts_at`;
  return freeSlots(rows, new Date());
}

export type BookingOk = { ok: true; visitId: string; slotId: string; startsAt: Date; rescheduledFrom: Date | null; alreadyBooked: boolean };
export type BookingErr = { ok: false; code: string };

/**
 * Book (or move) a lead's site visit.
 * The capacity trigger locks the slot row, so two buyers racing for the last place cannot both win;
 * the partial unique index keeps one upcoming visit per lead. Re-booking the same slot is a no-op.
 */
export async function bookVisit(p: { leadId: string; slotId: string; via: "assistant" | "executive" | "buyer"; actorId?: string | null; partySize?: number }): Promise<BookingOk | BookingErr> {
  try {
    return await sql.begin(async (tx) => {
      const [lead] = await tx<{ id: string; consent_at: Date | null; opted_out_at: Date | null; project_id: string | null }[]>`
        select id, consent_at, opted_out_at, project_id from leads where id = ${p.leadId} for update`;
      if (!lead) return { ok: false, code: "LEAD_NOT_FOUND" } as const;
      if (!lead.consent_at) return { ok: false, code: "NO_CONSENT" } as const;
      if (lead.opted_out_at) return { ok: false, code: "OPTED_OUT" } as const;

      const [slot] = await tx<{ id: string; project_id: string; starts_at: Date; active: boolean }[]>`
        select id, project_id, starts_at, active from visit_slots where id = ${p.slotId}`;
      if (!slot) return { ok: false, code: "SLOT_NOT_FOUND" } as const;
      if (new Date(slot.starts_at).getTime() < Date.now() + MIN_LEAD_MINUTES * 60_000) return { ok: false, code: "TOO_SOON" } as const;

      const [current] = await tx<{ id: string; slot_id: string; starts_at: Date }[]>`
        select v.id, v.slot_id, s.starts_at from visits v join visit_slots s on s.id = v.slot_id
         where v.lead_id = ${p.leadId} and v.status = 'booked' for update of v`;
      if (current && current.slot_id === p.slotId) {
        return { ok: true, visitId: current.id, slotId: p.slotId, startsAt: slot.starts_at, rescheduledFrom: null, alreadyBooked: true } as const;
      }
      if (current) {
        await tx`update visits set status = 'cancelled', updated_at = now() where id = ${current.id}`;
        await cancelVisitMessages(tx, current.id, "Rescheduled");
      }

      const [v] = await tx<{ id: string }[]>`
        insert into visits (lead_id, slot_id, booked_via, party_size)
        values (${p.leadId}, ${p.slotId}, ${p.via}, ${p.partySize ?? 1}) returning id`;
      await tx`update leads set status = 'visit_booked', project_id = coalesce(project_id, ${slot.project_id})
               where id = ${p.leadId} and status not in ('visited')`;
      await queueVisitMessages(tx, p.leadId, v.id, slot.project_id, new Date(slot.starts_at));
      await tx`insert into audit_log (actor_id, action, entity, entity_id, detail)
               values (${p.actorId ?? null}, ${current ? "reschedule" : "book"}, 'visit', ${v.id},
                       ${tx.json({ slot: p.slotId, via: p.via, from: current?.slot_id ?? null })})`;
      return { ok: true, visitId: v.id, slotId: p.slotId, startsAt: slot.starts_at, rescheduledFrom: current?.starts_at ?? null, alreadyBooked: false } as const;
    });
  } catch (err) {
    const code = dbErrorCode(err);
    if (code === "UNIQUE:visits_one_active_per_lead") return { ok: false, code: "ALREADY_BOOKED" };
    if (code) return { ok: false, code };
    throw err;
  }
}

export async function cancelVisit(visitId: string, actorId: string | null, reason: string, onlyForLeadId?: string) {
  return sql.begin(async (tx) => {
    // When a lead is named, the visit must belong to it: a caller cannot cancel someone else's visit.
    const [v] = await tx<{ id: string; lead_id: string }[]>`
      update visits set status = 'cancelled', updated_at = now()
       where id = ${visitId} and status = 'booked' and (${onlyForLeadId ?? null}::uuid is null or lead_id = ${onlyForLeadId ?? null})
      returning id, lead_id`;
    if (!v) return false;
    await cancelVisitMessages(tx, v.id, reason);
    await tx`update leads set status = (case when assigned_to is null then 'engaged' else 'handed_off' end)::lead_status
              where id = ${v.lead_id} and status = 'visit_booked'`;
    await tx`insert into audit_log (actor_id, action, entity, entity_id, detail)
             values (${actorId}, 'cancel', 'visit', ${v.id}, ${tx.json({ reason })})`;
    return true;
  });
}

/** Check-in at the site office: who actually came. Only past or same-day visits can be marked. */
export async function markOutcome(visitId: string, outcome: "visited" | "no_show", actorId: string) {
  return sql.begin(async (tx) => {
    const [v] = await tx<{ id: string; lead_id: string }[]>`
      update visits v set status = ${outcome}, updated_at = now()
        from visit_slots s
       where v.id = ${visitId} and s.id = v.slot_id and v.status in ('booked', 'visited', 'no_show')
         and s.starts_at < now() + interval '12 hours'
      returning v.id, v.lead_id`;
    if (!v) return false;
    await tx`update outbox set status = 'cancelled', status_note = 'Visit already happened'
              where visit_id = ${v.id} and status = 'scheduled'`;
    // Keep the lead's status in step with its visits, including when an outcome is corrected.
    const [anyVisited] = await tx`select 1 from visits where lead_id = ${v.lead_id} and status = 'visited' limit 1`;
    if (anyVisited) await tx`update leads set status = 'visited' where id = ${v.lead_id} and status in ('new','engaged','handed_off','visit_booked','visited')`;
    else await tx`update leads set status = (case when assigned_to is null then 'engaged' else 'handed_off' end)::lead_status where id = ${v.lead_id} and status = 'visited'`;
    await tx`insert into audit_log (actor_id, action, entity, entity_id, detail)
             values (${actorId}, 'outcome', 'visit', ${v.id}, ${tx.json({ outcome })})`;
    return true;
  });
}
