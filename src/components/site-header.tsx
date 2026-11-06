import Link from "next/link";
import { LangSwitch } from "./lang-switch";
import { T } from "@/lib/i18n";
import type { Lang } from "@/lib/assistant/guardrails";

export function SiteHeader({ lang, signedIn }: { lang: Lang; signedIn: boolean }) {
  const t = T[lang];
  return (
    <header className="mx-auto flex w-full max-w-6xl items-center justify-between gap-3 px-4 sm:px-8 py-5">
      <Link href="/" className="display text-xl tracking-tight">{t.brand}</Link>
      <nav className="flex items-center gap-2 sm:gap-4 text-sm">
        <Link href={signedIn ? "/my" : "/login/buyer"} className="hidden sm:inline text-stone hover:text-ink">{t.myVisits}</Link>
        <LangSwitch current={lang} />
      </nav>
    </header>
  );
}

export function SiteFooter({ lang, projects }: { lang: Lang; projects: { name: string; rera_no: string }[] }) {
  const t = T[lang];
  return (
    <footer className="mt-auto border-t border-line">
      <div className="mx-auto grid max-w-6xl gap-6 px-4 sm:px-8 py-10 text-sm text-stone sm:grid-cols-[1.4fr_1fr]">
        <div className="space-y-3 max-w-xl">
          <p>{t.priceNote}</p>
          <p>{t.privacy}</p>
        </div>
        <div className="space-y-2 sm:text-right">
          {projects.map((p) => (
            <p key={p.name}><span className="text-ink">{p.name}</span> — {t.rera} {p.rera_no}</p>
          ))}
          <p className="pt-2 flex gap-4 sm:justify-end">
            <Link href="/my" className="hover:text-ink">{t.myVisits}</Link>
            <Link href="/login" className="hover:text-ink">{t.staff}</Link>
          </p>
        </div>
      </div>
    </footer>
  );
}
