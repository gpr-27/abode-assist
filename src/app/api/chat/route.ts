import { cookies } from "next/headers";
import { after } from "next/server";
import { randomBytes } from "node:crypto";
import { z } from "zod";
import { sql } from "@/lib/db";
import { asLang } from "@/lib/i18n";
import { getOrCreateConversation, greeting, handleAction, handleText, loadHistory } from "@/lib/assistant/agent";
import { getProjects } from "@/lib/queries";
import { dispatchDue } from "@/lib/services/outbox";
import { getSession } from "@/lib/auth/session";

export const maxDuration = 60;

const VISITOR = "aa_visitor";

async function visitorKey(): Promise<{ key: string; isNew: boolean }> {
  const jar = await cookies();
  const existing = jar.get(VISITOR)?.value;
  if (existing && /^[a-f0-9]{32}$/.test(existing)) return { key: existing, isNew: false };
  const key = randomBytes(16).toString("hex");
  jar.set(VISITOR, key, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 60 * 60 * 24 * 180 });
  return { key, isNew: true };
}

const slug = z.string().regex(/^[a-z0-9-]{1,40}$/);

export async function GET(req: Request) {
  const url = new URL(req.url);
  const lang = asLang(url.searchParams.get("lang"));
  const project = slug.safeParse(url.searchParams.get("project")).data ?? null;
  const since = url.searchParams.get("since");
  const { key } = await visitorKey();
  const conv = await getOrCreateConversation(key, project, lang);

  let messages = await loadHistory(conv.id);
  if (messages.length === 0) {
    const g = greeting(lang, await getProjects());
    await sql`insert into messages (conversation_id, role, content, cards) values (${conv.id}, 'assistant', ${g.content}, ${sql.json(g.cards as never)})`;
    messages = await loadHistory(conv.id);
  }
  if (since) messages = messages.filter((m) => m.createdAt > since);
  return Response.json({ conversationId: conv.id, messages, handedOff: !!conv.handoff_at });
}

const ActionSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("book"), slotId: z.string().uuid() }),
  z.object({
    type: z.literal("contact"),
    name: z.string().trim().min(1).max(120),
    phone: z.string().trim().min(6).max(20),
    email: z.union([z.string().trim().email().max(160), z.literal("")]).optional(),
    consent: z.boolean(),
  }),
  z.object({ type: z.literal("more_slots"), projectSlug: slug, part: z.enum(["morning", "afternoon", "evening", "any"]).optional(), after: z.string().datetime().optional() }),
  z.object({ type: z.literal("human") }),
  z.object({ type: z.literal("pick_project"), projectSlug: slug }),
]);

const Body = z.object({
  lang: z.enum(["en", "hi", "gu"]).default("en"),
  project: slug.nullish(),
  text: z.string().trim().min(1).max(1000).optional(),
  action: ActionSchema.optional(),
}).refine((b) => !!b.text !== !!b.action, { message: "Send either text or an action." });

const RATE_PER_MINUTE = 12;
// A global ceiling, so a client that drops its cookie to dodge the per-visitor limit cannot run up the AI bill.
const GLOBAL_PER_MINUTE = 90;

export async function POST(req: Request) {
  let body: z.infer<typeof Body>;
  try {
    const parsed = Body.safeParse(await req.json());
    if (!parsed.success) return Response.json({ error: parsed.error.issues[0]?.message ?? "Invalid request" }, { status: 400 });
    body = parsed.data;
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { key } = await visitorKey();
  const conv = await getOrCreateConversation(key, body.project ?? null, body.lang);

  const [{ n }] = await sql<{ n: number }[]>`
    select count(*)::int as n from messages where conversation_id = ${conv.id} and role = 'buyer' and created_at > now() - interval '1 minute'`;
  if (n >= RATE_PER_MINUTE) return Response.json({ error: "You're sending messages quickly. Please wait a moment." }, { status: 429 });
  const [{ total }] = await sql<{ total: number }[]>`select count(*)::int as total from messages where role = 'buyer' and created_at > now() - interval '1 minute'`;
  if (total >= GLOBAL_PER_MINUTE) return Response.json({ error: "We're very busy right now. Please try again in a minute, or call the site office." }, { status: 429 });

  // A buyer who has signed in with a one-time code has proved they own that number.
  const session = await getSession();
  const verifiedPhone = session?.role === "buyer" ? (await sql<{ phone: string | null }[]>`select phone from users where id = ${session.userId}`)[0]?.phone ?? null : null;

  try {
    const messages = body.action ? await handleAction(conv, body.action, body.lang, verifiedPhone) : await handleText(conv, body.text!, body.lang);
    // Free plans only allow a daily cron, so any activity also sends reminders that have come due.
    after(() => dispatchDue().catch((e) => console.error("dispatch failed", e?.message)));
    return Response.json({ messages });
  } catch (err) {
    console.error("chat POST failed", (err as Error).message);
    return Response.json({ error: "Something went wrong on our side. Please try again." }, { status: 500 });
  }
}
