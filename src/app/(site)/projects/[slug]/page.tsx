import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { currentLang } from "@/lib/lang";
import { getFacts, getProject } from "@/lib/queries";
import { loadSlots } from "@/lib/services/visits";
import { pickSuggestions } from "@/lib/slots";
import { formatShortDay, formatTime } from "@/lib/time";
import { LOCALE } from "@/lib/assistant/copy";
import { T } from "@/lib/i18n";
import { Jaali } from "@/components/ui";

export async function generateMetadata({ params }: PageProps<"/projects/[slug]">): Promise<Metadata> {
  const p = await getProject((await params).slug);
  if (!p) notFound(); // runs before streaming starts, so the response is a real 404
  return { title: `${p.name}, ${p.locality}`, description: p.hero_note };
}

export default async function ProjectPage({ params }: PageProps<"/projects/[slug]">) {
  const { slug } = await params;
  const [lang, project] = await Promise.all([currentLang(), getProject(slug)]);
  if (!project) notFound();
  const t = T[lang];
  const [facts, slots] = await Promise.all([getFacts(project.id), loadSlots(project.id, 14)]);
  const own = facts.filter((f) => f.project_id === project.id);
  const general = facts.filter((f) => !f.project_id);
  const next = pickSuggestions(slots, "any", 6);

  return (
    <div className="mx-auto max-w-6xl px-4 sm:px-8 pb-24">
      <nav className="text-sm text-stone pt-2"><Link href="/" className="hover:text-ink">{t.brand}</Link> / {project.name}</nav>
      <section className="grid gap-10 pt-8 pb-14 md:grid-cols-[1.3fr_1fr] md:items-end">
        <div>
          <p className="text-stone">{project.locality}</p>
          <h1 className="display mt-2 text-5xl sm:text-7xl leading-none">{project.name}</h1>
          <p className="mt-5 max-w-[50ch] text-lg text-stone">{project.hero_note}</p>
          <p className="mt-6 text-sm text-stone">{t.rera} <span className="text-ink">{project.rera_no}</span></p>
        </div>
        <Jaali className="hidden md:block h-56 justify-self-end text-indigo/60" />
      </section>

      <div className="grid grid-cols-1 gap-12 md:grid-cols-[1.4fr_1fr] [&>*]:min-w-0">
        <section aria-labelledby="facts">
          <h2 id="facts" className="display text-2xl">{t.facts}</h2>
          <dl className="mt-6 divide-y divide-line border-y border-line">
            {[...own, ...general].map((f) => (
              <div key={f.id} className="grid gap-1 py-4 sm:grid-cols-[11rem_1fr] sm:gap-6">
                <dt className="text-sm text-stone">{f.topic}</dt>
                <dd className="leading-relaxed">{f.answer}</dd>
              </div>
            ))}
          </dl>
          <p className="mt-4 text-xs text-stone">{t.poweredNote}</p>
        </section>

        <aside className="md:sticky md:top-6 self-start rounded-3xl border border-line bg-white p-6 sm:p-8">
          <h2 className="display text-2xl">{t.nextSlots}</h2>
          {next.length === 0 ? (
            <p className="mt-4 text-sm text-stone">{t.noSlotsSoon}</p>
          ) : (
            <ul className="mt-5 grid grid-cols-2 gap-2">
              {next.map((s) => (
                <li key={s.id}>
                  <Link href={`/chat?project=${project.slug}&slot=${s.id}`}
                        className="block rounded-xl border border-line px-3 py-2.5 hover:border-indigo hover:bg-indigo-soft transition-colors">
                    <span className="block text-sm">{formatShortDay(s.starts_at, LOCALE[lang])}</span>
                    <span className="block display text-lg num">{formatTime(s.starts_at, LOCALE[lang])}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
          <div className="mt-6 flex flex-col gap-2">
            <Link href={`/chat?project=${project.slug}&intent=visit`} className="btn btn-primary">{t.bookVisit}</Link>
            <Link href={`/chat?project=${project.slug}`} className="btn btn-ghost">{t.askAbout}</Link>
            <a href={project.map_url} target="_blank" rel="noopener noreferrer" className="btn btn-quiet whitespace-normal text-center leading-snug">{t.directions}: {project.address}</a>
          </div>
        </aside>
      </div>
    </div>
  );
}
