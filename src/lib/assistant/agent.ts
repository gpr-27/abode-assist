import "server-only";
import { tool, type ModelMessage } from "ai";
import { after } from "next/server";
import { z } from "zod";
import { sql } from "../db";
import { BOOKING_ERRORS, pickSuggestions, type PartOfDay } from "../slots";
import { formatDateTime, istDateKey } from "../time";
import { normalizeIndianMobile } from "../phone";
import { bookVisit, loadSlots } from "../services/visits";
import { handoff, type HandoffReason } from "../services/handoff";
import { upsertLead } from "../services/leads";
import { runChain, AllProvidersFailed } from "./providers";
import { asksForDiscount, checkReply, detectLanguage, SAFE_REPLIES, wantsHuman, type Lang } from "./guardrails";
import { buildInstructions, factSheetText, type FactRow, type ProjectRow } from "./prompt";
import { COPY, LOCALE } from "./copy";
import type { Card, ChatAction, ChatMessage } from "./cards";
import { summarizeLead } from "./summary";

type ConvRow = {
  id: string; lead_id: string | null; project_id: string | null; language: Lang; handoff_at: Date | null;
  pending_slot_id: string | null; created_at: Date;
};

type LeadRow = { id: string; name: string; consent_at: Date | null; opted_out_at: Date | null; wants: string | null; budget: string | null; assigned_to: string | null };

export async function getOrCreateConversation(visitorKey: string, projectSlug: string | null, lang: Lang): Promise<ConvRow> {
  const [existing] = await sql<ConvRow[]>`
    select id, lead_id, project_id, language, handoff_at, pending_slot_id, created_at
      from conversations where visitor_key = ${visitorKey} order by updated_at desc limit 1`;
  const project = projectSlug ? (await sql<{ id: string }[]>`select id from projects where slug = ${projectSlug}`)[0] : undefined;
  if (existing) {
    if (project && existing.project_id !== project.id) {
      await sql`update conversations set project_id = ${project.id} where id = ${existing.id}`;
      existing.project_id = project.id;
    }
    return existing;
  }
  const [c] = await sql<ConvRow[]>`
    insert into conversations (visitor_key, project_id, language) values (${visitorKey}, ${project?.id ?? null}, ${lang})
    returning id, lead_id, project_id, language, handoff_at, pending_slot_id, created_at`;
  return c;
}

export async function loadHistory(conversationId: string): Promise<ChatMessage[]> {
  const rows = await sql<{ id: string; role: ChatMessage["role"]; content: string; cards: Card[]; meta: ChatMessage["meta"]; created_at: Date; author_name: string | null }[]>`
    select m.id, m.role, m.content, m.cards, m.meta, m.created_at, u.name as author_name
      from messages m left join users u on u.id = m.author_id
     where m.conversation_id = ${conversationId} order by m.created_at, m.id`;
  return rows.map((r) => ({
    id: r.id, role: r.role, content: r.content, cards: r.cards ?? [], createdAt: new Date(r.created_at).toISOString(),
    authorName: r.author_name, meta: r.role === "assistant" ? { provider: r.meta?.provider, model: r.meta?.model, fallback: r.meta?.fallback } : undefined,
  }));
}

async function save(conversationId: string, role: ChatMessage["role"], content: string, cards: Card[] = [], meta: Record<string, unknown> = {}): Promise<ChatMessage> {
  const [m] = await sql<{ id: string; created_at: Date }[]>`
    insert into messages (conversation_id, role, content, cards, meta)
    values (${conversationId}, ${role}, ${content}, ${sql.json(cards as never)}, ${sql.json(meta as never)}) returning id, created_at`;
  await sql`update conversations set updated_at = now() where id = ${conversationId}`;
  return { id: m.id, role, content, cards, createdAt: new Date(m.created_at).toISOString(), meta: meta as ChatMessage["meta"] };
}

async function flag(conversationId: string, reasons: string[]) {
  if (!reasons.length) return;
  await sql`update conversations set flagged = true, reviewed_at = null,
              flag_reasons = (select array(select distinct unnest(flag_reasons || ${reasons}::text[])))
            where id = ${conversationId}`;
}

async function context(conv: ConvRow) {
  const projects = await sql<ProjectRow[]>`select id, slug, name, rera_no, locality, address, map_url from projects order by name`;
  const facts = await sql<FactRow[]>`
    select p.slug as project, f.topic, f.answer from facts f left join projects p on p.id = f.project_id order by f.topic`;
  const lead = conv.lead_id
    ? (await sql<LeadRow[]>`select id, name, consent_at, opted_out_at, wants, budget, assigned_to from leads where id = ${conv.lead_id}`)[0] ?? null
    : null;
  const upcoming = lead
    ? (await sql<{ starts_at: Date; name: string }[]>`
        select s.starts_at, p.name from visits v join visit_slots s on s.id = v.slot_id join projects p on p.id = s.project_id
         where v.lead_id = ${lead.id} and v.status = 'booked' limit 1`)[0] ?? null
    : null;
  return { projects, facts, lead, upcoming };
}

function slotsCard(project: ProjectRow, slots: Awaited<ReturnType<typeof loadSlots>>, note?: string): Card {
  return { type: "slots", projectSlug: project.slug, projectName: project.name, note,
    slots: slots.map((s) => ({ id: s.id, startsAt: new Date(s.starts_at).toISOString(), left: s.left })) };
}

async function suggestSlots(project: ProjectRow, part: PartOfDay = "any", fromDate?: string) {
  let slots = await loadSlots(project.id, 14);
  if (fromDate) slots = slots.filter((s) => istDateKey(s.starts_at) >= fromDate);
  return pickSuggestions(slots, part, 6);
}

async function doHandoff(conv: ConvRow, lang: Lang, reason: HandoffReason, note?: string): Promise<{ text: string; card: Card | null }> {
  const r = await handoff(conv.id, reason, note);
  conv.handoff_at = conv.handoff_at ?? new Date();
  if (r.leadId) after(() => summarizeLead(conv.id).catch((e) => console.error("summary failed", e?.message)));
  if (!r.leadId) return { text: COPY[lang].handoffNoContact, card: { type: "contact_form", reason: "handoff" } };
  return { text: r.executive ? COPY[lang].handoffWithName(r.executive.name) : SAFE_REPLIES[lang].human, card: { type: "handoff", executiveName: r.executive?.name ?? null } };
}

/** Book from a button tap or a tool call. Returns the assistant line and cards. */
async function bookFor(conv: ConvRow, lang: Lang, slotId: string, projects: ProjectRow[], partySize?: number): Promise<{ text: string; cards: Card[]; booked: boolean }> {
  const [slot] = await sql<{ id: string; project_id: string; starts_at: Date }[]>`select id, project_id, starts_at from visit_slots where id = ${slotId}`;
  const project = slot ? projects.find((p) => p.id === slot.project_id) : undefined;
  if (!slot || !project) return { text: BOOKING_ERRORS.SLOT_NOT_FOUND, cards: [], booked: false };
  const when = formatDateTime(slot.starts_at, LOCALE[lang]);

  const lead = conv.lead_id ? (await sql<LeadRow[]>`select id, name, consent_at, opted_out_at, wants, budget, assigned_to from leads where id = ${conv.lead_id}`)[0] : null;
  if (!lead || !lead.consent_at) {
    await sql`update conversations set pending_slot_id = ${slotId}, project_id = ${project.id} where id = ${conv.id}`;
    conv.pending_slot_id = slotId;
    return { text: COPY[lang].needContact(when), cards: [{ type: "contact_form", reason: "booking", pendingSlot: when }], booked: false };
  }

  const res = await bookVisit({ leadId: lead.id, slotId, via: "assistant", partySize });
  if (!res.ok) {
    const alt = await suggestSlots(project);
    const msg = BOOKING_ERRORS[res.code] ?? "That time couldn't be booked.";
    return { text: COPY[lang].bookFailed(msg), cards: alt.length ? [slotsCard(project, alt)] : [], booked: false };
  }
  await sql`update conversations set pending_slot_id = null where id = ${conv.id}`;
  if (res.alreadyBooked) return { text: COPY[lang].alreadyBooked(when), cards: [], booked: false };
  const card: Card = {
    type: "booking", visitId: res.visitId, projectName: project.name, startsAt: new Date(res.startsAt).toISOString(),
    address: project.address, mapUrl: project.map_url, reraNo: project.rera_no,
    rescheduledFrom: res.rescheduledFrom ? new Date(res.rescheduledFrom).toISOString() : null,
  };
  return { text: res.rescheduledFrom ? COPY[lang].rescheduled(project.name, when) : COPY[lang].booked(project.name, when), cards: [card], booked: true };
}

/** Button taps: deterministic, no language model involved. */
export async function handleAction(conv: ConvRow, action: ChatAction, lang: Lang): Promise<ChatMessage[]> {
  const { projects } = await context(conv);
  const out: ChatMessage[] = [];

  if (action.type === "pick_project" || action.type === "more_slots") {
    const project = projects.find((p) => p.slug === action.projectSlug);
    if (!project) return [await save(conv.id, "assistant", COPY[lang].pickProject, [projectsCard(projects)], { action: action.type })];
    await sql`update conversations set project_id = ${project.id} where id = ${conv.id}`;
    conv.project_id = project.id;
    const part = action.type === "more_slots" ? action.part ?? "any" : "any";
    let slots = await suggestSlots(project, part);
    if (action.type === "more_slots" && action.after) {
      const after = action.after;
      slots = pickSuggestions((await loadSlots(project.id, 14)).filter((s) => new Date(s.starts_at).toISOString() > after), part, 6);
    }
    out.push(await save(conv.id, "buyer", action.type === "pick_project" ? `I'd like to visit ${project.name}` : "Show me more times", [], { action: action.type }));
    out.push(await save(conv.id, "assistant", slots.length ? COPY[lang].slotsIntro(project.name) : COPY[lang].noSlots, slots.length ? [slotsCard(project, slots)] : [], { action: action.type }));
    if (!slots.length) await doHandoff(conv, lang, "other", "No free slots in the next 14 days");
    return out;
  }

  if (action.type === "book") {
    const [slot] = await sql<{ starts_at: Date }[]>`select starts_at from visit_slots where id = ${action.slotId}`;
    out.push(await save(conv.id, "buyer", slot ? `Book ${formatDateTime(slot.starts_at, LOCALE[lang])}` : "Book this time", [], { action: "book" }));
    const r = await bookFor(conv, lang, action.slotId, projects);
    if (r.booked) {
      const h = await doHandoff(conv, lang, "serious_buyer", "Booked a site visit");
      if (h.card?.type === "handoff") r.cards.push(h.card);
    }
    out.push(await save(conv.id, "assistant", r.text, r.cards, { action: "book" }));
    return out;
  }

  if (action.type === "contact") {
    const phone = normalizeIndianMobile(action.phone);
    if (!phone || action.name.trim().length < 2) {
      return [await save(conv.id, "assistant", COPY[lang].contactInvalid, [{ type: "contact_form", reason: "retry" }], { action: "contact" })];
    }
    if (!action.consent) {
      return [await save(conv.id, "assistant", COPY[lang].consentRequired, [{ type: "contact_form", reason: "retry" }], { action: "contact" })];
    }
    const lead = await sql.begin(async (tx) => {
      const r = await upsertLead(tx, { name: action.name, phone, email: action.email || null, projectId: conv.project_id, language: lang, source: "chat", consent: true, note: "Shared details in web chat" });
      if (r.verdict !== "same") await tx`update leads set created_at = ${conv.created_at}, status = 'engaged' where id = ${r.leadId}`;
      // The chat answered the buyer the moment they wrote; that is the first response.
      await tx`update leads set first_response_at = coalesce(first_response_at,
                 (select min(created_at) from messages where conversation_id = ${conv.id} and role = 'assistant'), now())
               where id = ${r.leadId}`;
      await tx`update conversations set lead_id = ${r.leadId} where id = ${conv.id}`;
      return r;
    });
    conv.lead_id = lead.leadId;
    out.push(await save(conv.id, "buyer", `${action.name.trim()} · ${phone.replace(/^\+91(\d{5})(\d{5})$/, "+91 $1 $2")}`, [], { action: "contact", consent: true }));
    if (conv.pending_slot_id) {
      const r = await bookFor(conv, lang, conv.pending_slot_id, projects);
      if (r.booked) {
        const h = await doHandoff(conv, lang, "serious_buyer", "Booked a site visit");
        if (h.card?.type === "handoff") r.cards.push(h.card);
      }
      out.push(await save(conv.id, "assistant", `${COPY[lang].contactSaved} ${r.text}`, r.cards, { action: "contact" }));
    } else if (conv.handoff_at) {
      const h = await doHandoff(conv, lang, "buyer_request");
      out.push(await save(conv.id, "assistant", `${COPY[lang].contactSaved} ${h.text}`, h.card ? [h.card] : [], { action: "contact" }));
    } else {
      out.push(await save(conv.id, "assistant", COPY[lang].contactSaved, [], { action: "contact" }));
    }
    return out;
  }

  // human
  out.push(await save(conv.id, "buyer", "I'd like to talk to a person", [], { action: "human" }));
  const h = await doHandoff(conv, lang, "buyer_request");
  out.push(await save(conv.id, "assistant", h.text, h.card ? [h.card] : [], { action: "human" }));
  return out;
}

function projectsCard(projects: ProjectRow[]): Card {
  return { type: "projects", projects: projects.map((p) => ({ slug: p.slug, name: p.name, locality: p.locality })) };
}

const MAX_HISTORY = 24;

/** Free text: guard → model with tools → guard → save. */
export async function handleText(conv: ConvRow, text: string, uiLang: Lang): Promise<ChatMessage[]> {
  const lang = detectLanguage(text, uiLang);
  if (lang !== conv.language) await sql`update conversations set language = ${lang} where id = ${conv.id}`;
  const out: ChatMessage[] = [await save(conv.id, "buyer", text)];
  const ctx = await context(conv);

  // 1. A person, any time — no model call needed.
  if (wantsHuman(text)) {
    const h = await doHandoff(conv, lang, "buyer_request");
    out.push(await save(conv.id, "assistant", h.text, h.card ? [h.card] : [], { guard: ["human_request"] }));
    return out;
  }
  // 2. Discounts and negotiation never reach the model.
  if (asksForDiscount(text)) {
    await flag(conv.id, ["discount_request"]);
    const h = await doHandoff(conv, lang, "price_question", text.slice(0, 120));
    out.push(await save(conv.id, "assistant", `${SAFE_REPLIES[lang].discount}`, h.card ? [h.card] : [], { guard: ["discount_request"] }));
    return out;
  }

  // 3. The agent.
  const cards: Card[] = [];
  let sideEffect = false;
  let handoffReason: { reason: HandoffReason; note?: string } | null = null;
  let booked = false;
  const focus = ctx.projects.find((p) => p.id === conv.project_id) ?? null;
  const bySlug = (slug?: string | null) => ctx.projects.find((p) => p.slug === slug) ?? focus;

  const tools = {
    get_free_slots: tool({
      description: "List real open site-visit slots for a project. Always use this before offering any time.",
      inputSchema: z.object({
        project_slug: z.string().describe(`One of: ${ctx.projects.map((p) => p.slug).join(", ")}`),
        from_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().describe("Earliest date wanted, YYYY-MM-DD in IST"),
        part_of_day: z.enum(["morning", "afternoon", "evening", "any"]).optional(),
      }),
      execute: async ({ project_slug, from_date, part_of_day }) => {
        const project = bySlug(project_slug);
        if (!project) return { error: "Unknown project. Ask which project." };
        await sql`update conversations set project_id = ${project.id} where id = ${conv.id}`;
        conv.project_id = project.id;
        const slots = await suggestSlots(project, part_of_day ?? "any", from_date);
        const i = cards.findIndex((c) => c.type === "slots");
        if (i >= 0) cards.splice(i, 1);
        if (slots.length) cards.push(slotsCard(project, slots));
        return {
          project: project.name,
          slots: slots.map((s) => ({ slot_id: s.id, starts: formatDateTime(s.starts_at), places_left: s.left })),
          note: slots.length ? "The app shows these as buttons." : "No open slots match. Offer other days or a call from the team.",
        };
      },
    }),
    book_visit: tool({
      description: "Book or move the buyer's site visit to a slot_id returned by get_free_slots.",
      inputSchema: z.object({
        slot_id: z.string().uuid(),
        party_size: z.number().int().min(1).max(8).optional().describe("How many people are coming, if the buyer said"),
      }),
      execute: async ({ slot_id, party_size }) => {
        const r = await bookFor(conv, lang, slot_id, ctx.projects, party_size);
        for (const c of r.cards) {
          const i = cards.findIndex((x) => x.type === c.type);
          if (i >= 0) cards.splice(i, 1);
          cards.push(c);
        }
        if (r.booked) { sideEffect = true; booked = true; }
        const needsContact = r.cards.some((c) => c.type === "contact_form");
        return { status: r.booked ? "booked" : needsContact ? "needs_contact_details_form_shown" : "not_booked", message: r.text };
      },
    }),
    request_contact_details: tool({
      description: "Show the name, mobile and consent form. Use when a booking or a call-back needs contact details.",
      inputSchema: z.object({ reason: z.string().max(80) }),
      execute: async ({ reason }) => {
        if (ctx.lead?.consent_at) return { status: "already_have_contact_details" };
        if (!cards.some((c) => c.type === "contact_form")) cards.push({ type: "contact_form", reason });
        return { status: "form_shown" };
      },
    }),
    save_requirements: tool({
      description: "Record what the buyer wants. Only include fields the buyer actually said.",
      inputSchema: z.object({
        project_slug: z.string().optional(),
        wants: z.enum(["2 BHK", "3 BHK", "2 or 3 BHK"]).optional(),
        budget: z.string().max(60).optional().describe("In the buyer's words, e.g. 'up to 80 lakh'"),
        timeline: z.string().max(60).optional(),
      }),
      execute: async ({ project_slug, wants, budget, timeline }) => {
        const project = project_slug ? bySlug(project_slug) : null;
        if (project) { await sql`update conversations set project_id = ${project.id} where id = ${conv.id}`; conv.project_id = project.id; }
        if (conv.lead_id) {
          await sql`update leads set wants = coalesce(${wants ?? null}, wants), budget = coalesce(${budget ?? null}, budget),
                      timeline = coalesce(${timeline ?? null}, timeline), project_id = coalesce(${project?.id ?? null}, project_id)
                    where id = ${conv.lead_id}`;
          return { status: "saved" };
        }
        // No lead yet: the needs stay in the chat history and go into the handoff summary.
        return { status: "noted_in_chat" };
      },
    }),
    handoff_to_human: tool({
      description: "Pass the chat to a named sales executive with a summary.",
      inputSchema: z.object({
        reason: z.enum(["buyer_request", "missing_fact", "serious_buyer", "price_question", "other"]),
        note: z.string().max(140).optional(),
      }),
      execute: async ({ reason, note }) => {
        handoffReason = { reason, note };
        return { status: "handoff_queued", next: ctx.lead ? "Tell the buyer a named executive will contact them." : "Ask for contact details with request_contact_details." };
      },
    }),
  };

  const history = await sql<{ role: string; content: string }[]>`
    select role, content from messages where conversation_id = ${conv.id} and role in ('buyer', 'assistant', 'executive')
     order by created_at desc limit ${MAX_HISTORY}`;
  const messages: ModelMessage[] = history.reverse().map((m) =>
    m.role === "buyer" ? { role: "user", content: m.content } : { role: "assistant", content: m.role === "executive" ? `[Sales executive wrote] ${m.content}` : m.content });

  const instructions = buildInstructions({
    lang, projects: ctx.projects, facts: ctx.facts, nowIst: formatDateTime(new Date()),
    focusProject: focus ? `${focus.name} (${focus.slug})` : null,
    lead: { known: !!ctx.lead, hasConsent: !!ctx.lead?.consent_at, wants: ctx.lead?.wants, budget: ctx.lead?.budget,
            upcomingVisit: ctx.upcoming ? `${ctx.upcoming.name}, ${formatDateTime(ctx.upcoming.starts_at)}` : null },
    handedOff: !!conv.handoff_at,
  });

  let reply: string;
  let meta: Record<string, unknown> = {};
  try {
    const r = await runChain({
      instructions, messages, tools, maxSteps: 6,
      personalNames: ctx.lead ? [ctx.lead.name] : [],
      canFallThrough: () => !sideEffect, // never repeat a booking on another provider
    });
    reply = r.text;
    meta = { provider: r.provider, model: r.model, tools: r.steps.flatMap((s) => s.toolCalls.map((t) => t.toolName)), attempts: r.attempts.length };
    if (!reply) reply = cards.some((c) => c.type === "slots") ? COPY[lang].slotsIntro(focus?.name ?? "") : booked ? "" : SAFE_REPLIES[lang].blocked;
  } catch (err) {
    if (!(err instanceof AllProvidersFailed)) console.error("agent error", (err as Error).message);
    // Fallback: the booking path still works without the model.
    const project = focus;
    const slots = project ? await suggestSlots(project) : [];
    const fallbackCards: Card[] = project && slots.length ? [slotsCard(project, slots)] : [projectsCard(ctx.projects)];
    await flag(conv.id, ["assistant_unavailable"]);
    out.push(await save(conv.id, "assistant", SAFE_REPLIES[lang].unavailable, cards.length ? cards : fallbackCards, { fallback: true }));
    return out;
  }

  // 4. Guard the draft before the buyer sees it.
  const guard = checkReply(reply, factSheetText(ctx.projects, ctx.facts));
  if (!guard.ok) {
    console.warn("guardrail blocked reply", guard.reasons);
    await flag(conv.id, guard.reasons);
    meta = { ...meta, guard: guard.reasons, blocked: reply.slice(0, 500) };
    reply = SAFE_REPLIES[lang].blocked;
    handoffReason = handoffReason ?? { reason: "guardrail" as HandoffReason, note: guard.reasons.join(", ") };
  }
  if (handoffReason) {
    const hr = handoffReason as { reason: HandoffReason; note?: string };
    if (hr.reason === "missing_fact") await flag(conv.id, ["missing_fact"]);
    const h = await doHandoff(conv, lang, hr.reason, hr.note);
    if (h.card && !cards.some((c) => c.type === h.card!.type)) cards.push(h.card);
    if (!ctx.lead && !cards.some((c) => c.type === "contact_form")) cards.push({ type: "contact_form", reason: "handoff" });
  } else if (booked) {
    const h = await doHandoff(conv, lang, "serious_buyer", "Booked a site visit");
    if (h.card?.type === "handoff") cards.push(h.card);
  }
  out.push(await save(conv.id, "assistant", reply, cards, meta));
  return out;
}

export function greeting(lang: Lang, projects: ProjectRow[]): { content: string; cards: Card[] } {
  return { content: COPY[lang].greeting, cards: [projectsCard(projects)] };
}
