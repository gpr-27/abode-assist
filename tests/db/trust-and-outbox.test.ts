/**
 * Integration tests for the identity, ownership and messaging rules. Uses an isolated fixture project and cleans up.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomInt } from "node:crypto";

const HAS_DB = !!process.env.DATABASE_URL;

describe.skipIf(!HAS_DB)("identity, ownership and messages (database)", async () => {
  const { sql } = await import("@/lib/db");
  const { bookVisit, cancelVisit, markOutcome } = await import("@/lib/services/visits");
  const { upsertLead } = await import("@/lib/services/leads");
  const { dispatchDue } = await import("@/lib/services/outbox");

  const run = String(randomInt(1000, 9999));
  let projectId = "";
  let n = 0;
  const phone = () => `+9171${run}${String(n++).padStart(4, "0")}`;
  const H = 3600_000;
  const DAY = 24 * H;
  const at = (ms: number) => new Date(Math.floor((Date.now() + ms) / 60_000) * 60_000);
  const slots: string[] = [];

  async function makeSlot(startsIn: number, capacity = 2) {
    const starts = at(startsIn);
    const [s] = await sql<{ id: string }[]>`
      insert into visit_slots (project_id, starts_at, ends_at, capacity) values (${projectId}, ${starts}, ${new Date(starts.getTime() + 45 * 60_000)}, ${capacity}) returning id`;
    slots.push(s.id);
    return s.id;
  }
  async function makeLead(o: { consent?: boolean; language?: string; name?: string; phone?: string } = {}) {
    const [l] = await sql<{ id: string }[]>`
      insert into leads (name, phone, project_id, language, consent_at)
      values (${o.name ?? `Fixture ${run}-${n}`}, ${o.phone ?? phone()}, ${projectId}, ${o.language ?? "en"}, ${o.consent === false ? null : new Date()}) returning id`;
    return l.id;
  }

  beforeAll(async () => {
    const [p] = await sql<{ id: string }[]>`
      insert into projects (slug, name, rera_no, locality, address, map_url)
      values (${`test-t-${run}`}, ${`TEST fixture ${run}`}, ${`PR/GJ/TEST/${run}`}, 'Test locality', 'Test address', 'https://maps.test/?q=1') returning id`;
    projectId = p.id;
  });

  afterAll(async () => {
    try {
      if (slots.length) await sql`delete from visits where slot_id in ${sql(slots)}`;
      const ids = (await sql<{ id: string }[]>`select id from leads where project_id = ${projectId} or phone like ${`+9171${run}%`}`).map((r) => r.id);
      if (ids.length) {
        await sql`update leads set duplicate_hint = null where duplicate_hint in ${sql(ids)}`;
        await sql`delete from leads where id in ${sql(ids)}`;
      }
      if (slots.length) await sql`delete from visit_slots where id in ${sql(slots)}`;
      if (projectId) await sql`delete from projects where id = ${projectId}`;
    } finally {
      await sql.end({ timeout: 5 });
    }
  });

  describe("an anonymous chat visitor cannot take over someone else's lead", () => {
    const input = (ph: string) => ({ name: "Mallory", phone: ph, projectId, source: "chat" as const, consent: true });

    it("typing another person's number records a touch but changes nothing and links nothing", async () => {
      const victimPhone = phone();
      const victim = await makeLead({ consent: false, phone: victimPhone, name: "Victim Person" });
      const r = await sql.begin((tx) => upsertLead(tx, input(victimPhone), { trusted: false, ownLeadId: null, verifiedPhone: null }));
      expect(r.verdict).toBe("same");
      expect(r.unverified).toBe(true);
      expect(r.leadId).toBe(victim);
      const [l] = await sql<{ consent_at: Date | null; name: string }[]>`select consent_at, name from leads where id = ${victim}`;
      expect(l.consent_at).toBeNull(); // consent was NOT forged on the victim's behalf
      expect(l.name).toBe("Victim Person");
      const [t] = await sql<{ n: number }[]>`select count(*)::int as n from lead_touches where lead_id = ${victim} and note like '%not verified%'`;
      expect(t.n).toBe(1);
    });

    it("the same visitor re-submitting for the lead their own chat created is allowed", async () => {
      const own = await makeLead({ consent: false, name: "Own Lead" });
      const [{ phone: ph }] = await sql<{ phone: string }[]>`select phone from leads where id = ${own}`;
      const r = await sql.begin((tx) => upsertLead(tx, input(ph), { trusted: false, ownLeadId: own, verifiedPhone: null }));
      expect(r.unverified).toBeUndefined();
      const [l] = await sql<{ consent_at: Date | null }[]>`select consent_at from leads where id = ${own}`;
      expect(l.consent_at).not.toBeNull();
    });

    it("a buyer who signed in with a one-time code for that number is allowed", async () => {
      const ph = phone();
      const lead = await makeLead({ consent: false, phone: ph });
      const r = await sql.begin((tx) => upsertLead(tx, input(ph), { trusted: false, ownLeadId: null, verifiedPhone: ph }));
      expect(r.unverified).toBeUndefined();
      const [l] = await sql<{ consent_at: Date | null }[]>`select consent_at from leads where id = ${lead}`;
      expect(l.consent_at).not.toBeNull();
    });

    it("staff and imports stay trusted by default", async () => {
      const ph = phone();
      const lead = await makeLead({ consent: false, phone: ph });
      const r = await sql.begin((tx) => upsertLead(tx, { ...input(ph), source: "portal" }));
      expect(r.leadId).toBe(lead);
      expect(r.unverified).toBeUndefined();
    });
  });

  describe("visits belong to leads", () => {
    it("cancelling with the wrong lead id does nothing; with the right one it works", async () => {
      const slot = await makeSlot(2 * DAY);
      const a = await makeLead();
      const b = await makeLead();
      const booked = await bookVisit({ leadId: a, slotId: slot, via: "executive" });
      expect(booked.ok).toBe(true);
      const visitId = booked.ok ? booked.visitId : "";
      expect(await cancelVisit(visitId, null, "test", b)).toBe(false);
      const [still] = await sql<{ status: string }[]>`select status from visits where id = ${visitId}`;
      expect(still.status).toBe("booked");
      expect(await cancelVisit(visitId, null, "test", a)).toBe(true);
    });

    it("correcting an outcome keeps the lead's status in step", async () => {
      const slot = await makeSlot(3 * H);
      const lead = await makeLead();
      const booked = await bookVisit({ leadId: lead, slotId: slot, via: "executive" });
      const visitId = booked.ok ? booked.visitId : "";
      const actor = (await sql<{ id: string }[]>`select id from users limit 1`)[0].id;
      expect(await markOutcome(visitId, "visited", actor)).toBe(true);
      expect((await sql<{ status: string }[]>`select status from leads where id = ${lead}`)[0].status).toBe("visited");
      expect(await markOutcome(visitId, "no_show", actor)).toBe(true);
      expect((await sql<{ status: string }[]>`select status from leads where id = ${lead}`)[0].status).not.toBe("visited");
    });
  });

  describe("messages", () => {
    it("are written in the buyer's language and keep the RERA number and a stop link", async () => {
      const slot = await makeSlot(5 * DAY);
      const lead = await makeLead({ language: "gu" });
      await bookVisit({ leadId: lead, slotId: slot, via: "assistant" });
      const rows = await sql<{ kind: string; body: string }[]>`select kind, body from outbox where lead_id = ${lead} and kind in ('confirmation','reminder_1d','reminder_2h')`;
      expect(rows.length).toBe(3);
      for (const r of rows) {
        expect(r.body).toMatch(/[઀-૿]/); // Gujarati script
        expect(r.body).toContain(`PR/GJ/TEST/${run}`);
        expect(r.body).toMatch(/\/optout\//);
      }
    });

    it("a reminder that only comes due after the visit has started is skipped, not sent", async () => {
      const slot = await makeSlot(5 * H); // the 2-hour reminder starts out scheduled (3 hours from now)
      const lead = await makeLead();
      const booked = await bookVisit({ leadId: lead, slotId: slot, via: "assistant" });
      expect(booked.ok).toBe(true);
      const [before] = await sql<{ status: string }[]>`select status from outbox where lead_id = ${lead} and kind = 'reminder_2h'`;
      expect(before.status).toBe('scheduled');
      // Time passes: the visit has started and the 2-hour reminder was never dispatched.
      await sql`update visit_slots set starts_at = now() - interval '10 minutes', ends_at = now() + interval '35 minutes' where id = ${slot}`;
      await sql`update outbox set send_at = now() - interval '2 hours' where lead_id = ${lead} and kind = 'reminder_2h'`;
      await dispatchDue();
      const [r] = await sql<{ status: string; status_note: string | null }[]>`select status, status_note from outbox where lead_id = ${lead} and kind = 'reminder_2h'`;
      expect(r.status).toBe("skipped");
      expect(r.status_note).toMatch(/already started/);
    });
  });
});
