import "server-only";
import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { sql } from "../db";

export type Role = "buyer" | "executive" | "head";
export type Session = { userId: string; role: Role; name: string };

const COOKIE = "aa_session";
const MAX_AGE = 60 * 60 * 24 * 7;

function key() {
  const s = process.env.SESSION_SECRET;
  if (!s || s.length < 32) throw new Error("SESSION_SECRET must be at least 32 characters");
  return new TextEncoder().encode(s);
}

export async function createSession(s: Session) {
  const token = await new SignJWT({ role: s.role, name: s.name })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(s.userId)
    .setIssuedAt()
    .setExpirationTime(`${MAX_AGE}s`)
    .sign(key());
  (await cookies()).set(COOKIE, token, {
    httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: MAX_AGE,
  });
}

export async function destroySession() {
  (await cookies()).delete(COOKIE);
}

/** Verifies the signature and re-checks the user is still active, so a deactivated account loses access at once. */
export async function getSession(): Promise<Session | null> {
  const token = (await cookies()).get(COOKIE)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, key(), { algorithms: ["HS256"] });
    if (!payload.sub) return null;
    const [u] = await sql<{ id: string; role: Role; name: string }[]>`
      select id, role, name from users where id = ${payload.sub} and active`;
    return u ? { userId: u.id, role: u.role, name: u.name } : null;
  } catch {
    return null;
  }
}

export const isStaff = (s: Session | null): s is Session => !!s && (s.role === "executive" || s.role === "head");

/** For pages: redirect to sign-in if the role is wrong. */
export async function requireRole(...roles: Role[]): Promise<Session> {
  const s = await getSession();
  if (!s) redirect(roles.includes("buyer") ? "/login/buyer" : "/login");
  if (!roles.includes(s.role)) redirect(s.role === "buyer" ? "/my" : "/staff/leads");
  return s;
}

export class HttpError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

/** For server actions and route handlers: throw instead of redirecting. */
export async function assertRole(...roles: Role[]): Promise<Session> {
  const s = await getSession();
  if (!s) throw new HttpError(401, "Please sign in.");
  if (!roles.includes(s.role)) throw new HttpError(403, "You don't have access to this.");
  return s;
}
