import Link from "next/link";
import { Jaali } from "@/components/ui";
import { currentLang } from "@/lib/lang";
import { getFacts, getProjects } from "@/lib/queries";
import { T } from "@/lib/i18n";
import { LOCALE } from "@/lib/assistant/copy";

export default async function Home() {
  const lang = await currentLang();
  const t = T[lang];
  const [projects, facts] = await Promise.all([getProjects(), getFacts(null)]);
  const fact = (projectId: string, topic: string) => facts.find((f) => f.project_id === projectId && f.topic === topic)?.answer ?? null;
  const places = new Intl.ListFormat(LOCALE[lang], { type: "conjunction" }).format([...new Set(projects.map((p) => p.locality.split(",")[0]))]);
  const details = projects.map((p) => ({
    ...p,
    price: fact(p.id, "Indicative price range"),
    config: fact(p.id, "Configurations"),
    possession: fact(p.id, "Possession"),
  }));

  return (
    <>
      <section className="mx-auto grid max-w-6xl items-center gap-10 px-4 sm:px-8 pt-6 pb-16 sm:pt-14 sm:pb-24 md:grid-cols-[1.25fr_1fr]">
        <div className="rise">
          <h1 className="display text-[2.4rem] leading-[1.08] sm:text-6xl sm:leading-[1.04] max-w-[16ch]">{t.heroTitle}</h1>
          <p className="mt-6 max-w-[52ch] text-lg text-stone leading-relaxed">{t.heroSub(places)}</p>
          <div className="mt-9 flex flex-wrap gap-3">
            <Link href="/chat" className="btn btn-primary">{t.startChat}</Link>
            <Link href="/chat?intent=visit" className="btn btn-ghost">{t.bookVisit}</Link>
          </div>
        </div>
        <Jaali className="hidden md:block w-full max-w-[380px] justify-self-end text-indigo/70" />
      </section>

      <section className="mx-auto max-w-6xl px-4 sm:px-8 pb-20">
        <div className="grid gap-px overflow-hidden rounded-3xl border border-line bg-line md:grid-cols-2">
          {details.map((p) => (
            <article key={p.slug} className="flex flex-col bg-white p-7 sm:p-10">
              <p className="text-sm text-stone">{p.locality}</p>
              <h2 className="display mt-1 text-4xl">{p.name}</h2>
              <p className="mt-3 text-stone">{p.hero_note}</p>
              <dl className="mt-8 grid grid-cols-1 gap-5 text-sm sm:grid-cols-2">
                <div><dt className="text-stone">{t.homes}</dt><dd className="mt-1">{p.config?.replace(/\s*\(.*?\)/g, "").replace(/\.$/, "")}</dd></div>
                <div><dt className="text-stone">{t.possession}</dt><dd className="mt-1">{p.possession?.replace(/^Possession as per RERA registration:\s*/, "").replace(/\.$/, "")}</dd></div>
                <div className="sm:col-span-2"><dt className="text-stone">{t.from}</dt><dd className="display mt-1 text-xl">{p.price}</dd></div>
              </dl>
              <p className="mt-8 text-xs text-stone">{t.rera} {p.rera_no}</p>
              <div className="mt-6 flex flex-wrap gap-3">
                <Link href={`/projects/${p.slug}`} className="btn btn-ghost btn-sm">{t.viewProject}</Link>
                <Link href={`/chat?project=${p.slug}&intent=visit`} className="btn btn-primary btn-sm">{t.bookVisit}</Link>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 sm:px-8 pb-24">
        <h2 className="display text-3xl">{t.howTitle}</h2>
        <ol className="mt-8 grid gap-8 sm:grid-cols-3">
          {t.how.map(([title, body], i) => (
            <li key={title} className="border-t border-ink pt-4">
              <p className="num text-sm text-stone">{i + 1}</p>
              <p className="mt-2 font-medium">{title}</p>
              <p className="mt-2 text-sm text-stone leading-relaxed">{body}</p>
            </li>
          ))}
        </ol>
      </section>
    </>
  );
}
