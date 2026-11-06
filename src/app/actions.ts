"use server";
import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { asLang } from "@/lib/i18n";

export async function setLanguage(lang: string) {
  (await cookies()).set("aa_lang", asLang(lang), { path: "/", maxAge: 60 * 60 * 24 * 365, sameSite: "lax" });
  revalidatePath("/", "layout");
}
