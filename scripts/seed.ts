/**
 * Seeds realistic demo data. Every person, phone number and RERA number here is synthetic.
 * Usage: pnpm db:seed   (wipes and refills the app schema's tables)
 */
import postgres from "postgres";
import bcrypt from "bcryptjs";
import { config } from "dotenv";
import { planReminders, renderMessage, TEMPLATES } from "../src/lib/reminders";
import { addDaysKey, istDateKey, istInstant } from "../src/lib/time";

config({ path: ".env.local" });
const url = process.env.DIRECT_DATABASE_URL ?? process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL is required");
const sql = postgres(url, { max: 1, onnotice: () => {} });

// Deterministic randomness so every reviewer sees the same data.
let seed = 20261107;
const rnd = () => ((seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296);
const pick = <T,>(xs: T[]) => xs[Math.floor(rnd() * xs.length)];
const weighted = <T,>(pairs: [T, number][]) => {
  const total = pairs.reduce((s, [, w]) => s + w, 0);
  let r = rnd() * total;
  for (const [v, w] of pairs) if ((r -= w) <= 0) return v;
  return pairs[0][0];
};

const APP_URL = process.env.APP_URL ?? "http://localhost:3000";
const DEMO_PASSWORD = process.env.DEMO_PASSWORD ?? "Demo@1234";
const NOW = new Date();
const TODAY = istDateKey(NOW);

const FIRST = ["Hardik", "Nidhi", "Kavita", "Jignesh", "Parth", "Dhruv", "Krupa", "Bhavik", "Hetal", "Mitesh", "Pooja", "Rahul", "Sneha", "Chirag", "Foram", "Manan", "Riddhi", "Tushar", "Ankita", "Nirav", "Darshan", "Komal", "Yash", "Vaishali", "Keyur", "Hiral", "Sagar", "Megha", "Ronak", "Disha", "Amit", "Priyanka", "Vivek", "Jinal", "Harsh", "Khushbu", "Aakash", "Shruti", "Mayur", "Rina"];
const LAST = ["Patel", "Shah", "Joshi", "Mehta", "Desai", "Trivedi", "Bhatt", "Parikh", "Pandya", "Thakkar", "Modi", "Vyas", "Soni", "Rathod", "Chauhan", "Gandhi", "Dave", "Raval", "Sheth", "Amin", "Agarwal", "Sharma", "Jain", "Iyer"];

async function main() {
  await sql.begin(async (tx) => {
    await tx.unsafe(`truncate audit_log, outbox, visits, visit_slots, messages, conversations, source_spend, lead_touches, leads,
                     project_executives, facts, projects, otp_codes, users restart identity cascade`);
    await tx.unsafe(`alter sequence lead_code_seq restart with 58230`);

    // ── Users ──────────────────────────────────────────────
    const hash = await bcrypt.hash(DEMO_PASSWORD, 10);
    const [head] = await tx`insert into users (role, name, email, password_hash) values ('head', 'Rupal Desai', 'head@abode.demo', ${hash}) returning id`;
    const execs = await tx<{ id: string; name: string; email: string }[]>`
      insert into users (role, name, email, password_hash) values
        ('executive', 'Priya Shah', 'priya@abode.demo', ${hash}),
        ('executive', 'Karan Mehta', 'karan@abode.demo', ${hash}),
        ('executive', 'Neha Trivedi', 'neha@abode.demo', ${hash}),
        ('executive', 'Arjun Rathod', 'arjun@abode.demo', ${hash})
      returning id, name, email`;
    const ex = Object.fromEntries(execs.map((e) => [e.email.split("@")[0], e.id])) as Record<string, string>;
    const [buyer] = await tx`insert into users (role, name, phone) values ('buyer', 'Hardik Patel', '+919876558210') returning id`;

    // ── Projects & fact sheet ──────────────────────────────
    const [p1] = await tx`insert into projects (slug, name, rera_no, locality, address, map_url, hero_note) values
      ('project-1', 'Project 1', 'PR/GJ/AHMEDABAD/DASKROI/AUDA/DEMO-P1/2025', 'Shela, Ahmedabad',
       'Site office, Shela–Bopal Road, Shela, Ahmedabad 380058', 'https://maps.google.com/?q=23.0040,72.4660',
       '2 and 3 BHK residences. 240 homes across four towers.') returning id`;
    const [p2] = await tx`insert into projects (slug, name, rera_no, locality, address, map_url, hero_note) values
      ('project-2', 'Project 2', 'PR/GJ/AHMEDABAD/GANDHINAGAR/AUDA/DEMO-P2/2025', 'Gota, Ahmedabad',
       'Site office, off S.G. Highway, Gota, Ahmedabad 382481', 'https://maps.google.com/?q=23.1020,72.5410',
       '2 and 3 BHK homes. 180 homes across three towers.') returning id`;

    await tx`insert into project_executives (project_id, user_id) values
      (${p1.id}, ${ex.priya}), (${p1.id}, ${ex.karan}), (${p1.id}, ${ex.arjun}),
      (${p2.id}, ${ex.neha}), (${p2.id}, ${ex.arjun})`;

    const facts: [string | null, string, string][] = [
      [null, "Site visit hours", "Site offices are open every day, 10:00 am to 6:00 pm. Visits take about 45 minutes, including a sample flat walkthrough."],
      [null, "What to bring", "Nothing is needed for a visit. For booking a home later, the sales team will explain the documents."],
      [null, "Home loans", "The sales team can introduce buyers to lending banks. Loan terms are decided by the bank, not by us."],
      [null, "Pricing", "Prices shown are indicative ranges. The final price for a specific flat, floor and facing is confirmed only by the sales team."],
      [null, "Parking", "Every home comes with one covered car parking space. A second space depends on availability; the sales team confirms it."],
      [p1.id, "Configurations", "2 BHK (approx. 1,150 sq ft super built-up, 720 sq ft carpet) and 3 BHK (approx. 1,620 sq ft super built-up, 1,010 sq ft carpet)."],
      [p1.id, "Indicative price range", "2 BHK from ₹68 lakh; 3 BHK from ₹92 lakh up to ₹1.2 crore depending on floor and facing."],
      [p1.id, "Towers and homes", "Four towers of 14 floors, 240 homes in total."],
      [p1.id, "Possession", "Possession as per RERA registration: December 2027."],
      [p1.id, "Amenities", "Clubhouse, swimming pool, gym, children's play area, landscaped garden, jogging track, multipurpose hall, 24×7 security with CCTV."],
      [p1.id, "Sample flat", "A furnished 3 BHK sample flat is ready to view at the site office."],
      [p2.id, "Configurations", "2 BHK (approx. 1,080 sq ft super built-up, 680 sq ft carpet) and 3 BHK (approx. 1,480 sq ft super built-up, 930 sq ft carpet)."],
      [p2.id, "Indicative price range", "2 BHK from ₹65 lakh; 3 BHK from ₹85 lakh up to ₹98 lakh depending on floor and facing."],
      [p2.id, "Towers and homes", "Three towers of 12 floors, 180 homes in total."],
      [p2.id, "Possession", "Possession as per RERA registration: June 2027."],
      [p2.id, "Amenities", "Clubhouse, gym, indoor games room, children's play area, garden, rooftop sitting area, 24×7 security with CCTV."],
      [p2.id, "Sample flat", "A furnished 2 BHK sample flat is ready to view at the site office."],
    ];
    for (const [pid, topic, answer] of facts) {
      await tx`insert into facts (project_id, topic, answer, updated_by) values (${pid}, ${topic}, ${answer}, ${head.id})`;
    }

    // ── Visit slots: 10 days back to 21 days ahead, 10:00–17:00 hourly, 2 visitors per slot ──
    const slotIds: Record<string, Record<string, { id: string; starts: Date }>> = { [p1.id]: {}, [p2.id]: {} };
    for (let d = -10; d <= 21; d++) {
      const day = addDaysKey(TODAY, d);
      for (const pid of [p1.id, p2.id]) {
        for (let h = 10; h <= 17; h++) {
          const starts = istInstant(day, h);
          const [s] = await tx`insert into visit_slots (project_id, starts_at, ends_at, capacity)
                               values (${pid}, ${starts}, ${new Date(starts.getTime() + 45 * 60_000)}, 2) returning id`;
          slotIds[pid][`${day} ${h}`] = { id: s.id, starts };
        }
      }
    }
    // One slot switched off by the sales head (e.g. a team meeting) to show inactive slots are never offered.
    await tx`update visit_slots set active = false where id = ${slotIds[p1.id][`${addDaysKey(TODAY, 2)} 15`].id}`;

    // Spend per source (scaled 1:20 from the brief's ₹30 lakh/month — see TDD assumptions).
    const spend: [string, number, number][] = [["portal", 70000, 18000], ["social", 50000, 13000], ["hoarding", 15000, 4000], ["website", 15000, 4000]];
    for (const [src, oct, nov] of spend) {
      await tx`insert into source_spend (source, month, amount_inr) values (${src}, '2026-10-01', ${oct}), (${src}, '2026-11-01', ${nov})`;
    }

    // ── Leads ──────────────────────────────────────────────
    await tx.unsafe(`alter table visits disable trigger visits_capacity`); // history includes past bookings

    type LeadSeed = {
      code?: string; name: string; phone: string; source: string; extraSources?: string[]; project: string; wants: string;
      createdAt: Date; consent: boolean; responseMin: number | null; assigned: string | null; status: string;
      visit?: { slot: { id: string; starts: Date }; status: "booked" | "visited" | "no_show" | "cancelled" }; budget?: string; language?: string;
    };
    const leads: LeadSeed[] = [];
    const used = new Set<string>();
    const phoneFor = (n: number) => `+9198${String(76500000 + n).padStart(8, "0")}`;

    // The three rows from the brief, as given.
    const slotAt = (pid: string, day: string, h: number) => slotIds[pid][`${day} ${h}`];
    leads.push({ code: "LD-58210", name: "Hardik Patel", phone: "+919876558210", source: "portal", project: p1.id, wants: "3 BHK",
      createdAt: istInstant("2026-10-29", 21, 40), consent: true, responseMin: 1, assigned: ex.priya, status: "visit_booked", budget: "₹1–1.2 crore",
      visit: { slot: slotAt(p1.id, "2026-11-01", 11) ?? (await adHocSlot(tx, p1.id, istInstant("2026-11-01", 11))), status: "booked" } });
    leads.push({ code: "LD-58211", name: "Nidhi Shah", phone: "+919876558211", source: "social", project: p2.id, wants: "2 BHK",
      createdAt: istInstant("2026-11-05", 19, 5), consent: true, responseMin: 0, assigned: ex.neha, status: "handed_off", budget: "around ₹70 lakh", language: "gu" });
    leads.push({ code: "LD-58224", name: "Kavita Joshi", phone: "+919876558224", source: "hoarding", project: p2.id, wants: "2 BHK",
      createdAt: istInstant("2026-10-24", 12, 30), consent: true, responseMin: 6, assigned: ex.neha, status: "visited", language: "hi",
      visit: { slot: slotAt(p2.id, "2026-10-28", 16) ?? (await adHocSlot(tx, p2.id, istInstant("2026-10-28", 16))), status: "visited" } });
    ["Hardik Patel", "Nidhi Shah", "Kavita Joshi"].forEach((n) => used.add(n));

    const start = istInstant("2026-10-01", 0).getTime();
    const end = NOW.getTime() - 20 * 60_000;
    for (let i = 0; i < 176; i++) {
      let name: string;
      do { name = `${pick(FIRST)} ${pick(LAST)}`; } while (used.has(name));
      used.add(name);
      const createdAt = new Date(start + rnd() * (end - start));
      const nov = createdAt >= istInstant("2026-11-01", 0);
      const source = weighted<string>([["portal", 45], ["social", 30], ["website", 10], ["hoarding", 10], ["chat", nov ? 12 : 4]]);
      const project = rnd() < 0.55 ? p1.id : p2.id;
      const wants = rnd() < 0.55 ? "2 BHK" : "3 BHK";
      // Hoarding calls and some portal leads arrive without WhatsApp opt-in: a person must call them.
      const consent = source === "chat" || source === "website" ? true : source === "hoarding" ? rnd() < 0.35 : rnd() < 0.82;
      const ageH = (NOW.getTime() - createdAt.getTime()) / 3600_000;
      let responseMin: number | null;
      if (consent) responseMin = source === "chat" ? 0 : rnd() * 1.8;
      else {
        const r = rnd();
        responseMin = r < 0.55 ? 20 + rnd() * 160 : r < 0.85 ? 240 + rnd() * 1200 : r < 0.93 ? 1500 + rnd() * 1800 : null;
        if (responseMin !== null && responseMin / 60 > ageH) responseMin = null;
      }
      const reachedOk = responseMin !== null;
      const engaged = reachedOk && rnd() < 0.62;
      const pool = project === p1.id ? [ex.priya, ex.karan, ex.arjun] : [ex.neha, ex.arjun];
      const assigned = engaged || !consent ? pick(pool) : null;
      let status = !reachedOk ? "new" : engaged ? "handed_off" : "engaged";
      let visit: LeadSeed["visit"];
      const vr = rnd();
      if (engaged && vr < 0.30) {
        // Visit 1–6 days after the enquiry, at 10–17h.
        const vDay = addDaysKey(istDateKey(createdAt), 1 + Math.floor(rnd() * 6));
        const slot = slotIds[project][`${vDay} ${10 + Math.floor(rnd() * 8)}`];
        if (slot) {
          const past = slot.starts.getTime() < NOW.getTime();
          const vs = past ? (rnd() < 0.72 ? "visited" : "no_show") : "booked";
          visit = { slot, status: vs as "visited" | "no_show" | "booked" };
          status = vs === "visited" ? "visited" : vs === "booked" ? "visit_booked" : "handed_off";
        }
      }
      if (!visit && engaged && rnd() < 0.08) status = "lost";
      leads.push({
        name, phone: phoneFor(i), source, project, wants, createdAt, consent, responseMin, assigned, status, visit,
        budget: engaged ? pick(["up to ₹70 lakh", "₹70–80 lakh", "₹80–95 lakh", "around ₹1 crore", "₹1–1.2 crore"]) : undefined,
        language: weighted([["en", 55], ["gu", 30], ["hi", 15]]),
        extraSources: rnd() < 0.08 ? [pick(["portal", "social", "website"])] : undefined,
      });
    }

    const leadIds: Record<string, string> = {};
    for (const l of leads) {
      const first = l.responseMin === null ? null : new Date(l.createdAt.getTime() + l.responseMin * 60_000);
      const [row] = await tx`
        insert into leads (code, name, phone, project_id, wants, budget, language, status, assigned_to, consent_at, first_response_at, created_at, buyer_user_id)
        values (coalesce(${l.code ?? null}::text, 'LD-' || nextval('lead_code_seq')), ${l.name}, ${l.phone}, ${l.project}, ${l.wants}, ${l.budget ?? null}, ${l.language ?? "en"}, ${l.status},
                ${l.assigned}, ${l.consent ? l.createdAt : null}, ${first}, ${l.createdAt}, ${l.code === "LD-58210" ? buyer.id : null})
        returning id, code`;
      leadIds[l.name] = row.id;
      await tx`insert into lead_touches (lead_id, source, created_at) values (${row.id}, ${l.source}, ${l.createdAt})`;
      for (const s of l.extraSources ?? []) {
        await tx`insert into lead_touches (lead_id, source, note, created_at)
                 values (${row.id}, ${s}, 'Repeat enquiry (matched on phone)', ${new Date(l.createdAt.getTime() + 3 * 86400_000)})`;
      }
      if (l.consent && l.source !== "chat") {
        await tx`insert into outbox (lead_id, kind, template, body, send_at, status, sent_at, created_at)
                 values (${row.id}, 'ack', ${TEMPLATES.ack}, ${`Hi ${l.name.split(" ")[0]}, thank you for your interest. You can ask us anything or book a site visit here, any time.`},
                         ${first ?? l.createdAt}, 'sent', ${first ?? l.createdAt}, ${l.createdAt})`;
      }
      if (l.visit) {
        const [v] = await tx`insert into visits (lead_id, slot_id, status, booked_via, created_at)
                             values (${row.id}, ${l.visit.slot.id}, ${l.visit.status}, ${l.source === "chat" ? "assistant" : "executive"}, ${l.createdAt}) returning id`;
        const proj = l.project === p1.id ? { name: "Project 1", rera: "PR/GJ/AHMEDABAD/DASKROI/AUDA/DEMO-P1/2025", addr: "Site office, Shela–Bopal Road, Shela, Ahmedabad 380058", map: "https://maps.google.com/?q=23.0040,72.4660" }
                                         : { name: "Project 2", rera: "PR/GJ/AHMEDABAD/GANDHINAGAR/AUDA/DEMO-P2/2025", addr: "Site office, off S.G. Highway, Gota, Ahmedabad 382481", map: "https://maps.google.com/?q=23.1020,72.5410" };
        const [lt] = await tx<{ optout_token: string }[]>`select optout_token from leads where id = ${row.id}`;
        const ctx = { buyerName: l.name, projectName: proj.name, reraNo: proj.rera, address: proj.addr, mapUrl: proj.map, startsAt: l.visit.slot.starts,
                      executiveName: execs.find((e) => e.id === l.assigned)?.name ?? null, optoutUrl: `${APP_URL}/optout/${lt.optout_token}` };
        const bookedAt = new Date(Math.min(l.createdAt.getTime() + 30 * 60_000, l.visit.slot.starts.getTime() - 3 * 3600_000));
        await tx`insert into outbox (lead_id, visit_id, kind, template, body, send_at, status, sent_at)
                 values (${row.id}, ${v.id}, 'confirmation', ${TEMPLATES.confirmation}, ${renderMessage("confirmation", ctx)}, ${bookedAt}, 'sent', ${bookedAt})`;
        for (const p of planReminders(l.visit.slot.starts, bookedAt, false)) {
          const due = p.send_at.getTime() <= NOW.getTime();
          await tx`insert into outbox (lead_id, visit_id, kind, template, body, send_at, status, sent_at, status_note)
                   values (${row.id}, ${v.id}, ${p.kind}, ${TEMPLATES[p.kind]}, ${renderMessage(p.kind, ctx)}, ${p.send_at},
                           ${p.status === "skipped" ? "skipped" : due ? "sent" : "scheduled"}, ${p.status !== "skipped" && due ? p.send_at : null}, ${p.note ?? null})`;
        }
      }
      if (l.assigned) {
        await tx`insert into audit_log (action, entity, entity_id, detail, created_at)
                 values ('assign', 'lead', ${row.id}, ${tx.json({ to: l.assigned, reason: "seed" })}, ${first ?? l.createdAt})`;
      }
    }
    await tx.unsafe(`alter table visits enable trigger visits_capacity`);

    // A possible duplicate for the lead desk to review: same person, new number, slightly different spelling.
    const [dupTarget] = await tx<{ id: string }[]>`select id from leads where code = 'LD-58211'`;
    await tx`insert into leads (name, phone, project_id, wants, status, consent_at, first_response_at, duplicate_hint, created_at, language)
             values ('Nidhi Shaah', '+919898012211', ${p2.id}, '2 BHK', 'engaged', now() - interval '20 hours', now() - interval '20 hours' + interval '50 seconds',
                     ${dupTarget.id}, now() - interval '20 hours', 'gu')`;
    const [dupRow] = await tx<{ id: string }[]>`select id from leads where phone = '+919898012211'`;
    await tx`insert into lead_touches (lead_id, source, created_at) values (${dupRow.id}, 'portal', now() - interval '20 hours')`;

    // ── Conversations ─────────────────────────────────────
    const conv = async (leadName: string, projectId: string, lang: string, lines: [string, string, object[]?][], opts: { flagged?: string[]; handoff?: string; minutesAgo: number }) => {
      const leadId = leadIds[leadName] ?? null;
      const startAt = new Date(NOW.getTime() - opts.minutesAgo * 60_000);
      const [c] = await tx`insert into conversations (lead_id, visitor_key, project_id, language, flagged, flag_reasons, handoff_at, handoff_reason, created_at, updated_at)
                           values (${leadId}, ${"seed-" + leadName.replace(/\s/g, "-").toLowerCase()}, ${projectId}, ${lang},
                                   ${!!opts.flagged?.length}, ${opts.flagged ?? []}, ${opts.handoff ? new Date(startAt.getTime() + lines.length * 40_000) : null},
                                   ${opts.handoff ?? null}, ${startAt}, ${new Date(startAt.getTime() + lines.length * 40_000)}) returning id`;
      let t = startAt.getTime();
      for (const [role, content, cards] of lines) {
        t += 25_000 + Math.floor(rnd() * 30_000);
        await tx`insert into messages (conversation_id, role, content, cards, meta, created_at)
                 values (${c.id}, ${role}, ${content}, ${tx.json((cards ?? []) as never)}, ${tx.json(role === "assistant" ? { provider: "anthropic", model: "claude-sonnet-5-5" } : {})}, ${new Date(t)})`;
      }
      return c.id;
    };

    await conv("Nidhi Shah", p2.id, "gu", [
      ["buyer", "Project 2 ma 2 BHK nu carpet area ketlu che?"],
      ["assistant", "Project 2 ma 2 BHK no carpet area aashare 680 sq ft che (super built-up aashare 1,080 sq ft). Shu tame site visit book karva mangso?"],
      ["buyer", "Price shu che? Koi discount male?"],
      ["assistant", "કિંમત, ઑફર અને ડિસ્કાઉન્ટ ફક્ત અમારી સેલ્સ ટીમ જ જણાવે છે, તેથી હું અહીં કહી શકતો નથી. મેં એક એક્ઝિક્યુટિવને તમારો સંપર્ક કરવા કહ્યું છે."],
      ["system", "Handed to Neha Trivedi · Price or discount question"],
    ], { flagged: ["discount_request"], handoff: "price_question", minutesAgo: 36 * 60 });

    await conv("Hardik Patel", p1.id, "en", [
      ["buyer", "Hi, looking for a 3 BHK in Project 1. Is the sample flat ready?"],
      ["assistant", "Yes, a furnished 3 BHK sample flat is ready to view at the Project 1 site office in Shela. 3 BHK homes are about 1,010 sq ft carpet. Would you like to see it in person?"],
      ["buyer", "Yes, Sunday 11 am works"],
      ["assistant", "Your visit to Project 1 is booked for Sun, 1 Nov, 11:00 am. We'll send a reminder a day before and two hours before."],
      ["system", "Handed to Priya Shah · Serious buyer · Booked a site visit"],
    ], { handoff: "serious_buyer", minutesAgo: 8 * 24 * 60 });

    const someChatLead = leads.find((l) => l.source === "chat" && l.status !== "new" && !l.visit)!;
    await conv(someChatLead.name, someChatLead.project, "en", [
      ["buyer", "Which schools are near the project?"],
      ["assistant", "I want to be accurate with you, so I'll have one of our sales team confirm that detail personally. Is there anything else I can help with meanwhile, like booking a site visit?"],
      ["system", "Handed to the sales team · Question not in fact sheet · Nearby schools"],
    ], { flagged: ["missing_fact"], handoff: "missing_fact", minutesAgo: 5 * 60 });

    await tx`insert into audit_log (actor_id, action, entity, detail) values (${head.id}, 'seed', 'database', ${tx.json({ at: NOW.toISOString() })})`;
  });

  const [{ leads }] = await sql`select count(*)::int as leads from leads`;
  const [{ visits }] = await sql`select count(*)::int as visits from visits`;
  const [{ slots }] = await sql`select count(*)::int as slots from visit_slots`;
  console.log(`seeded: ${leads} leads, ${visits} visits, ${slots} slots. Demo password: ${DEMO_PASSWORD}`);
  await sql.end();
}

async function adHocSlot(tx: postgres.TransactionSql, projectId: string, starts: Date) {
  const [s] = await tx`insert into visit_slots (project_id, starts_at, ends_at, capacity) values (${projectId}, ${starts}, ${new Date(starts.getTime() + 45 * 60_000)}, 2)
                       on conflict (project_id, starts_at) do update set capacity = excluded.capacity returning id`;
  return { id: s.id as string, starts };
}

main().catch(async (e) => { console.error(e); await sql.end(); process.exit(1); });
