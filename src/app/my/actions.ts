"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { sql } from "@/lib/db";
import { assertRole, destroySession } from "@/lib/auth/session";
import { cancelVisit } from "@/lib/services/visits";

/** A buyer may only touch visits on leads linked to their own account. */
async function ownVisit(visitId: string, userId: string) {
  const [v] = await sql`select v.id from visits v join leads l on l.id = v.lead_id where v.id = ${visitId} and l.buyer_user_id = ${userId}`;
  return !!v;
}

export async function cancelMyVisit(form: FormData) {
  const s = await assertRole("buyer");
  const id = z.string().uuid().parse(form.get("visitId"));
  if (!(await ownVisit(id, s.userId))) throw new Error("Visit not found");
  await cancelVisit(id, s.userId, "Cancelled by buyer");
  revalidatePath("/my");
}

export async function setMessages(form: FormData) {
  const s = await assertRole("buyer");
  const on = form.get("on") === "1";
  await sql.begin(async (tx) => {
    if (on) {
      await tx`update leads set opted_out_at = null, consent_at = now() where buyer_user_id = ${s.userId}`;
    } else {
      const leads = await tx<{ id: string }[]>`update leads set opted_out_at = now() where buyer_user_id = ${s.userId} returning id`;
      for (const l of leads) {
        await tx`update outbox set status = 'cancelled', status_note = 'Buyer opted out' where lead_id = ${l.id} and status = 'scheduled'`;
      }
    }
    await tx`insert into audit_log (actor_id, action, entity, detail) values (${s.userId}, ${on ? "opt_in" : "opt_out"}, 'buyer', '{}')`;
  });
  revalidatePath("/my");
}

export async function signOut() {
  await destroySession();
  redirect("/");
}
