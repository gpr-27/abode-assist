import "server-only";
import { cookies } from "next/headers";
import { asLang } from "./i18n";

export async function currentLang() {
  return asLang((await cookies()).get("aa_lang")?.value);
}
