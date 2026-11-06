"use server";
import { redirect } from "next/navigation";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { sql } from "@/lib/db";
import { createSession } from "@/lib/auth/session";

export type LoginState = { error?: string; email?: string } | null;

const Login = z.object({ email: z.string().trim().toLowerCase().email().max(160), password: z.string().min(1).max(200) });
const GENERIC = "Email or password is incorrect.";
// Compared against for unknown e-mails, so they take as long as wrong passwords.
let dummyHash: string | null = null;
const dummy = () => (dummyHash ??= bcrypt.hashSync("not-a-real-password", 10));

export async function staffLogin(_: LoginState, fd: FormData): Promise<LoginState> {
  const parsed = Login.safeParse({ email: fd.get("email"), password: fd.get("password") });
  if (!parsed.success) return { error: GENERIC, email: String(fd.get("email") ?? "") };
  const { email, password } = parsed.data;

  const [{ fails }] = await sql<{ fails: number }[]>`
    select count(*)::int as fails from audit_log
     where action = 'login_failed' and entity = 'user' and entity_id = ${email} and created_at > now() - interval '15 minutes'`;
  if (fails >= 5) return { error: "Too many attempts. Wait 15 minutes and try again.", email };

  const [u] = await sql<{ id: string; name: string; role: "buyer" | "executive" | "head"; password_hash: string | null; active: boolean }[]>`
    select id, name, role, password_hash, active from users where email = ${email}`;
  const ok = await bcrypt.compare(password, u?.password_hash ?? dummy());
  if (!u || !ok || !u.active) {
    await sql`insert into audit_log (action, entity, entity_id) values ('login_failed', 'user', ${email})`;
    return { error: GENERIC, email };
  }
  if (u.role === "buyer") return { error: "This sign-in is for the sales team. Buyers sign in with their mobile number at /login/buyer.", email };

  await createSession({ userId: u.id, role: u.role, name: u.name });
  await sql`insert into audit_log (actor_id, action, entity, entity_id) values (${u.id}, 'login', 'user', ${u.id})`;
  redirect("/staff/leads");
}
