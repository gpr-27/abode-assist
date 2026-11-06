"use server";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { z } from "zod";
import { sql } from "@/lib/db";
import { normalizeIndianMobile } from "@/lib/phone";
import { issueOtp, verifyOtp } from "@/lib/auth/otp";
import { createSession } from "@/lib/auth/session";

export type OtpState = { step: "phone" | "code"; phone?: string; demoCode?: string; error?: string };

/** SMS is mocked. In demo mode the code is shown on screen; set DEMO_SHOW_OTP=false once a real SMS gateway is wired. */
const showCode = () => process.env.DEMO_SHOW_OTP !== "false";

export async function requestCode(_: OtpState, form: FormData): Promise<OtpState> {
  const phone = normalizeIndianMobile(String(form.get("phone") ?? ""));
  if (!phone) return { step: "phone", error: "Enter a 10-digit Indian mobile number." };
  const r = await issueOtp(phone);
  if ("error" in r) return { step: "phone", error: r.error };
  return { step: "code", phone, demoCode: showCode() ? r.code : undefined };
}

export async function verifyCode(prev: OtpState, form: FormData): Promise<OtpState> {
  const phone = normalizeIndianMobile(String(form.get("phone") ?? ""));
  const code = z.string().regex(/^\d{6}$/).safeParse(String(form.get("code") ?? "").trim());
  if (!phone) return { step: "phone", error: "Start again with your mobile number." };
  if (!code.success) return { ...prev, step: "code", phone, error: "Enter the 6-digit code." };
  if (!(await verifyOtp(phone, code.data))) return { ...prev, step: "code", phone, error: "That code is wrong or has expired. Request a new one." };

  const user = await sql.begin(async (tx) => {
    const [lead] = await tx<{ name: string }[]>`select name from leads where phone = ${phone} limit 1`;
    const [u] = await tx<{ id: string; name: string; role: string }[]>`
      insert into users (role, name, phone) values ('buyer', ${lead?.name ?? "Home buyer"}, ${phone})
      on conflict (phone) do update set phone = excluded.phone returning id, name, role`;
    if (u.role !== "buyer") return null;
    await tx`update leads set buyer_user_id = ${u.id} where phone = ${phone} and buyer_user_id is null`;
    // Attach the chat from this browser to the buyer, so "My visits" and the chat agree.
    const visitor = (await cookies()).get("aa_visitor")?.value;
    if (visitor) {
      await tx`update conversations c set lead_id = l.id from leads l
                where c.visitor_key = ${visitor} and c.lead_id is null and l.phone = ${phone}`;
    }
    return u;
  });
  if (!user) return { step: "phone", error: "This number belongs to a staff account. Use staff sign in." };
  await createSession({ userId: user.id, role: "buyer", name: user.name });
  redirect("/my");
}
