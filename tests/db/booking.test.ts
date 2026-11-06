/**
 * Integration tests against the real Postgres (Supabase). The hard requirement: no double booking.
 * Runs only when DATABASE_URL is set. Everything is created in an isolated test project and removed afterwards.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomInt } from "node:crypto";

const HAS_DB = !!process.env.DATABASE_URL;

describe.skipIf(!HAS_DB)("site-visit booking (database)", async () => {
  const { sql } = await import("@/lib/db");
  const { bookVisit, cancelVisit } = await import("@/lib/services/visits");
  const { upsertLead, LeadInputError } = await import("@/lib/services/leads");

  const run = String(randomInt(1000, 9999));
  const RERA = `PR/GJ/TEST/${run}`;
  let projectId = "";
  const slot: Record<string, string> = {};
  const leadIds: string[] = [];
  let n = 0;
  const phone = () => `+9170${run}${String(n++).padStart(4, "0")}`;
  const DAY = 86400_000;
  const H = 3600_000;
  // Round to the minute so slot starts are clean.
  const at = (ms: number) => new Date(Math.floor((Date.now() + ms) / 60_000) * 60_000);

  async function makeSlot(key: string, startsIn: number, capacity: number, active = true) {
    const starts = at(startsIn);
    const [s] = await sql<{ id: string }[]>`
      insert into visit_slots (project_id, starts_at, ends_at, capacity, active)
      values (${projectId}, ${starts}, ${new Date(starts.getTime() + 45 * 60_000)}, ${capacity}, ${active}) returning id`;
    slot[key] = s.id;
  }

  async function makeLead(o: { consent?: boolean; optedOut?: boolean; name?: string } = {}) {
    const [l] = await sql<{ id: string }[]>`
      insert into leads (name, phone, project_id, consent_at, opted_out_at)
      values (${o.name ?? `Test Buyer ${run}-${n}`}, ${phone()}, ${projectId},
              ${o.consent === false ? null : new Date()}, ${o.optedOut ? new Date() : null}) returning id`;
    leadIds.push(l.id);
    return l.id;
  }

  const bookedIn = async (slotId: string) =>
    (await sql<{ n: number }[]>`select count(*)::int as n from visits where slot_id = ${slotId} and status = 'booked'`)[0].n;

  beforeAll(async () => {
    const [p] = await sql<{ id: string }[]>`
      insert into projects (slug, name, rera_no, locality, address, map_url)
      values (${`test-${run}`}, ${`TEST fixture ${run}`}, ${RERA}, 'Test locality', 'Test address', 'https://maps.test/?q=1') returning id`;
    projectId = p.id;
    await makeSlot("cap1", 3 * DAY, 1);
    await makeSlot("cap2", 3 * DAY + H, 2);
    await makeSlot("a", 4 * DAY, 3);
    await makeSlot("b", 4 * DAY + H, 3);
    await makeSlot("idem", 5 * DAY, 2);
    await makeSlot("inactive", 5 * DAY + H, 2, false);
    await makeSlot("soon", 30 * 60_000, 2);
    await makeSlot("msgs", 6 * DAY, 2);
    await makeSlot("full", 6 * DAY + H, 1);
  });

  afterAll(async () => {
    try {
      const slotIds = Object.values(slot);
      if (slotIds.length) await sql`delete from visits where slot_id in ${sql(slotIds)}`;
      const ids = (await sql<{ id: string }[]>`select id from leads where project_id = ${projectId} or phone like ${`+9170${run}%`}`).map((r) => r.id);
      if (ids.length) {
        await sql`update leads set duplicate_hint = null where duplicate_hint in ${sql(ids)}`;
        await sql`delete from leads where id in ${sql(ids)}`;
      }
      if (slotIds.length) await sql`delete from visit_slots where id in ${sql(slotIds)}`;
      if (projectId) await sql`delete from projects where id = ${projectId}`;
    } finally {
      await sql.end({ timeout: 5 });
    }
  });

  it("10 buyers racing for the last place: exactly one wins", async () => {
    const leads = await Promise.all(Array.from({ length: 10 }, () => makeLead()));
    const results = await Promise.all(leads.map((leadId) => bookVisit({ leadId, slotId: slot.cap1, via: "assistant" })));
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    const failures = results.filter((r) => !r.ok);
    expect(failures).toHaveLength(9);
    expect(failures.every((r) => !r.ok && r.code === "SLOT_FULL")).toBe(true);
    expect(await bookedIn(slot.cap1)).toBe(1);
  });

  it("capacity 2 with 6 racers: exactly two win", async () => {
    const leads = await Promise.all(Array.from({ length: 6 }, () => makeLead()));
    const results = await Promise.all(leads.map((leadId) => bookVisit({ leadId, slotId: slot.cap2, via: "buyer" })));
    expect(results.filter((r) => r.ok)).toHaveLength(2);
    expect(await bookedIn(slot.cap2)).toBe(2);
  });

  it("one buyer booking two slots at once ends with exactly one upcoming visit", async () => {
    const leadId = await makeLead();
    const results = await Promise.all([
      bookVisit({ leadId, slotId: slot.a, via: "assistant" }),
      bookVisit({ leadId, slotId: slot.b, via: "assistant" }),
    ]);
    expect(results.every((r) => r.ok)).toBe(true);
    const active = await sql`select slot_id from visits where lead_id = ${leadId} and status = 'booked'`;
    expect(active).toHaveLength(1);
    const cancelled = await sql`select 1 from visits where lead_id = ${leadId} and status = 'cancelled'`;
    expect(cancelled).toHaveLength(1);
    // The later transaction is reported as a reschedule.
    expect(results.some((r) => r.ok && r.rescheduledFrom !== null)).toBe(true);
  });

  it("re-booking the same slot is a no-op", async () => {
    const leadId = await makeLead();
    const first = await bookVisit({ leadId, slotId: slot.idem, via: "buyer" });
    const again = await bookVisit({ leadId, slotId: slot.idem, via: "buyer" });
    expect(first.ok && !first.alreadyBooked).toBe(true);
    expect(again.ok && again.alreadyBooked).toBe(true);
    expect(again.ok && first.ok && again.visitId).toBe(first.ok ? first.visitId : null);
    expect((await sql`select 1 from visits where lead_id = ${leadId}`).length).toBe(1);
  });

  it("refuses bookings without consent, after opt-out, on inactive slots and at short notice", async () => {
    const noConsent = await makeLead({ consent: false });
    const optedOut = await makeLead({ optedOut: true });
    const ok = await makeLead();
    expect(await bookVisit({ leadId: noConsent, slotId: slot.idem, via: "assistant" })).toEqual({ ok: false, code: "NO_CONSENT" });
    expect(await bookVisit({ leadId: optedOut, slotId: slot.idem, via: "assistant" })).toEqual({ ok: false, code: "OPTED_OUT" });
    expect(await bookVisit({ leadId: ok, slotId: slot.inactive, via: "assistant" })).toEqual({ ok: false, code: "SLOT_INACTIVE" });
    expect(await bookVisit({ leadId: ok, slotId: slot.soon, via: "assistant" })).toEqual({ ok: false, code: "TOO_SOON" });
    expect(await bookVisit({ leadId: ok, slotId: "00000000-0000-0000-0000-000000000000", via: "assistant" })).toEqual({ ok: false, code: "SLOT_NOT_FOUND" });
    expect((await sql`select 1 from visits where lead_id in (${noConsent}, ${optedOut}, ${ok})`).length).toBe(0);
  });

  it("queues the confirmation and both reminders, and cancels reminders with the visit", async () => {
    const leadId = await makeLead();
    const r = await bookVisit({ leadId, slotId: slot.msgs, via: "assistant" });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const rows = await sql<{ kind: string; status: string; send_at: Date; body: string }[]>`
      select kind, status, send_at, body from outbox where visit_id = ${r.visitId} order by kind`;
    const by = Object.fromEntries(rows.map((x) => [x.kind, x]));
    expect(Object.keys(by).sort()).toEqual(["confirmation", "reminder_1d", "reminder_2h"]);
    expect(by.confirmation.status).toBe("sent");
    expect(by.reminder_1d.status).toBe("scheduled");
    expect(by.reminder_2h.status).toBe("scheduled");
    const starts = new Date(r.startsAt).getTime();
    expect(new Date(by.reminder_1d.send_at).getTime()).toBe(starts - DAY);
    expect(new Date(by.reminder_2h.send_at).getTime()).toBe(starts - 2 * H);
    for (const x of rows) expect(x.body).toContain(RERA);
    const [{ status }] = await sql<{ status: string }[]>`select status from leads where id = ${leadId}`;
    expect(status).toBe("visit_booked");

    expect(await cancelVisit(r.visitId, null, "Buyer cancelled")).toBe(true);
    const after = await sql<{ kind: string; status: string }[]>`select kind, status from outbox where visit_id = ${r.visitId}`;
    expect(after.filter((x) => x.kind !== "confirmation").every((x) => x.status === "cancelled")).toBe(true);
    expect(await cancelVisit(r.visitId, null, "again")).toBe(false); // already cancelled
  });

  it("the database itself rejects an overbooking that bypasses the app", async () => {
    const a = await makeLead();
    const b = await makeLead();
    await sql`insert into visits (lead_id, slot_id, booked_via) values (${a}, ${slot.full}, 'executive')`;
    await expect(sql`insert into visits (lead_id, slot_id, booked_via) values (${b}, ${slot.full}, 'executive')`).rejects.toThrow(/SLOT_FULL/);
    // A second active booking for the same lead is also impossible.
    await expect(sql`insert into visits (lead_id, slot_id, booked_via) values (${a}, ${slot.b}, 'executive')`).rejects.toThrow(/visits_one_active_per_lead|duplicate key/);
    expect(await bookedIn(slot.full)).toBe(1);
  });

  it("dedupes leads: same phone in another format merges, a similar name is flagged", async () => {
    const p = phone();
    const local = p.replace("+91", "0"); // 0-prefixed form of the same number
    const name = `Zorawar Testbuyer${run}`;
    const first = await sql.begin((tx) => upsertLead(tx, { name, phone: p, projectId, source: "portal", consent: true }));
    expect(first.verdict).toBe("new");
    expect(first.acked).toBe(true);
    const again = await sql.begin((tx) => upsertLead(tx, { name, phone: local, projectId, source: "social", consent: true }));
    expect(again).toMatchObject({ verdict: "same", matchedOn: "phone", leadId: first.leadId });
    expect((await sql`select 1 from leads where phone = ${p}`).length).toBe(1);
    const touches = await sql<{ source: string }[]>`select source from lead_touches where lead_id = ${first.leadId} order by created_at`;
    expect(touches.map((t) => t.source)).toEqual(["portal", "social"]);
    const [{ first_response_at }] = await sql<{ first_response_at: Date | null }[]>`select first_response_at from leads where id = ${first.leadId}`;
    expect(first_response_at).not.toBeNull(); // the opt-in acknowledgement counts as the first response

    const similar = await sql.begin((tx) => upsertLead(tx, { name: `Zorawar Testbuyerr${run}`, phone: phone(), projectId, source: "website", consent: false }));
    expect(similar.verdict).toBe("possible");
    expect(similar.acked).toBe(false); // no consent, no message
    const [{ duplicate_hint }] = await sql<{ duplicate_hint: string | null }[]>`select duplicate_hint from leads where id = ${similar.leadId}`;
    expect(duplicate_hint).toBe(first.leadId);

    await expect(sql.begin((tx) => upsertLead(tx, { name: "No Contact", phone: "12345", projectId, source: "portal", consent: true }))).rejects.toBeInstanceOf(LeadInputError);
  });
});
