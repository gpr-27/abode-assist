import { timingSafeEqual } from "node:crypto";
import { dispatchDue } from "@/lib/services/outbox";

/**
 * Sends due reminders (mock gateway). Vercel Cron calls this with `Authorization: Bearer $CRON_SECRET`.
 * Hobby plans only allow a daily cron, so staff pages also dispatch due messages when opened.
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  const given = req.headers.get("authorization") ?? "";
  const expected = `Bearer ${secret ?? ""}`;
  const ok = !!secret && given.length === expected.length && timingSafeEqual(Buffer.from(given), Buffer.from(expected));
  if (!ok) return Response.json({ error: "unauthorized" }, { status: 401 });
  const r = await dispatchDue();
  return Response.json({ ok: true, ...r, at: new Date().toISOString() });
}
