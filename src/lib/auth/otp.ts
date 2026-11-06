import "server-only";
import { createHash, randomInt, timingSafeEqual } from "node:crypto";
import { sql } from "../db";

const TTL_MIN = 5;
const MAX_ATTEMPTS = 5;
const MAX_PER_HOUR = 5;

const hash = (phone: string, code: string) =>
  createHash("sha256").update(`${process.env.SESSION_SECRET}:${phone}:${code}`).digest("hex");

/** SMS is mocked: the caller shows the code on screen in demo mode instead of sending it. */
export async function issueOtp(phone: string): Promise<{ code: string } | { error: string }> {
  const [{ n }] = await sql<{ n: number }[]>`
    select count(*)::int as n from otp_codes where phone = ${phone} and created_at > now() - interval '1 hour'`;
  if (n >= MAX_PER_HOUR) return { error: "Too many codes requested. Try again in an hour." };
  const code = String(randomInt(100000, 1000000));
  await sql`insert into otp_codes (phone, code_hash, expires_at)
            values (${phone}, ${hash(phone, code)}, now() + ${`${TTL_MIN} minutes`}::interval)`;
  return { code };
}

export async function verifyOtp(phone: string, code: string): Promise<boolean> {
  const [row] = await sql<{ id: string; code_hash: string; attempts: number }[]>`
    select id, code_hash, attempts from otp_codes
     where phone = ${phone} and used_at is null and expires_at > now()
     order by created_at desc limit 1`;
  if (!row || row.attempts >= MAX_ATTEMPTS) return false;
  const a = Buffer.from(row.code_hash);
  const b = Buffer.from(hash(phone, code));
  const ok = a.length === b.length && timingSafeEqual(a, b);
  if (ok) await sql`update otp_codes set used_at = now() where id = ${row.id}`;
  else await sql`update otp_codes set attempts = attempts + 1 where id = ${row.id}`;
  return ok;
}
