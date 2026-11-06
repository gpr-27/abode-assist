import "server-only";
import { z } from "zod";
import { sql } from "../db";
import { runChain } from "./providers";

const SummarySchema = z.object({
  summary: z.string().min(5).max(600),
  wants: z.string().max(40).nullable(),
  budget: z.string().max(60).nullable(),
  timeline: z.string().max(60).nullable(),
  intent: z.enum(["hot", "warm", "cold"]),
  open_questions: z.array(z.string().max(160)).max(5),
});
export type LeadSummary = z.infer<typeof SummarySchema> & { generatedBy: string };

/** Pull the first JSON object out of a model reply (models sometimes wrap it in prose or fences). */
export function parseSummaryJson(text: string): z.infer<typeof SummarySchema> | null {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    const parsed = SummarySchema.safeParse(JSON.parse(text.slice(start, end + 1)));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

/** Rule-based summary used when every model is down; it never invents anything. */
export function ruleSummary(lead: { wants: string | null; budget: string | null; timeline: string | null }, buyerLines: string[], hasVisit: boolean): z.infer<typeof SummarySchema> {
  const asked = buyerLines.filter((l) => l.includes("?")).slice(-3);
  return {
    summary: `Buyer${lead.wants ? ` looking for ${lead.wants}` : ""}${lead.budget ? `, budget ${lead.budget}` : ""}${hasVisit ? ", has a site visit booked" : ""}. Last message: "${(buyerLines.at(-1) ?? "").slice(0, 140)}"`,
    wants: lead.wants, budget: lead.budget, timeline: lead.timeline,
    intent: hasVisit ? "hot" : lead.budget ? "warm" : "cold",
    open_questions: asked,
  };
}

/** Writes the handoff summary onto the lead. Runs after the reply is sent, so it never slows the buyer down. */
export async function summarizeLead(conversationId: string): Promise<void> {
  const [c] = await sql<{ lead_id: string | null }[]>`select lead_id from conversations where id = ${conversationId}`;
  if (!c?.lead_id) return;
  const [lead] = await sql<{ id: string; name: string; wants: string | null; budget: string | null; timeline: string | null }[]>`
    select id, name, wants, budget, timeline from leads where id = ${c.lead_id}`;
  const msgs = await sql<{ role: string; content: string }[]>`
    select role, content from messages where conversation_id = ${conversationId} and role in ('buyer','assistant')
     order by created_at desc limit 30`;
  msgs.reverse();
  const [visit] = await sql`select 1 from visits where lead_id = ${lead.id} and status = 'booked'`;
  const transcript = msgs.map((m) => `${m.role === "buyer" ? "Buyer" : "Assistant"}: ${m.content}`).join("\n");

  let result: LeadSummary;
  try {
    const r = await runChain({
      instructions:
        'You write handoff notes for a real-estate sales executive. Use only what the buyer said in the transcript. Do not guess. Reply with JSON only: {"summary": string (2-3 sentences, English), "wants": string|null, "budget": string|null, "timeline": string|null, "intent": "hot"|"warm"|"cold", "open_questions": string[] (questions the assistant could not answer)}',
      messages: [{ role: "user", content: `Transcript:\n${transcript}\n\nVisit booked: ${visit ? "yes" : "no"}` }],
      personalNames: [lead.name],
      maxSteps: 1,
    });
    const parsed = parseSummaryJson(r.text);
    if (!parsed) throw new Error("summary was not valid JSON");
    result = { ...parsed, generatedBy: `${r.provider} · ${r.model}` };
  } catch {
    result = { ...ruleSummary(lead, msgs.filter((m) => m.role === "buyer").map((m) => m.content), !!visit), generatedBy: "rules (AI unavailable)" };
  }
  await sql`update leads set summary = ${JSON.stringify(result)},
              wants = coalesce(wants, ${result.wants}), budget = coalesce(budget, ${result.budget}), timeline = coalesce(timeline, ${result.timeline})
            where id = ${lead.id}`;
}
