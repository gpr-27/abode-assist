import Link from "next/link";
import clsx from "clsx";
import { requireRole } from "@/lib/auth/session";
import { nowMs } from "@/lib/staff/labels";
import { sql } from "@/lib/db";
import { addDaysKey, formatShortDay, formatTime, istDateKey, istInstant } from "@/lib/time";
import { PageHeader } from "@/components/ui";
import { AddSlotsForm, SlotCell } from "@/components/staff/slot-controls";

export const metadata = { title: "Visit slots" };

export default async function SlotsPage({ searchParams }: PageProps<"/staff/slots">) {
  await requireRole("head");
  const sp = await searchParams;
  const projects = await sql<{ id: string; slug: string; name: string }[]>`select id, slug, name from projects order by name`;
  const slug = (Array.isArray(sp.project) ? sp.project[0] : sp.project) ?? projects[0]?.slug;
  const project = projects.find((p) => p.slug === slug) ?? projects[0];
  const today = istDateKey(new Date());
  const days = Array.from({ length: 14 }, (_, i) => addDaysKey(today, i));
  const slots = project ? await sql<{ id: string; starts_at: Date; capacity: number; active: boolean; held: number }[]>`
    select s.id, s.starts_at, s.capacity, s.active,
           (select count(*)::int from visits v where v.slot_id = s.id and v.status = 'booked') as held
      from visit_slots s
     where s.project_id = ${project.id} and s.starts_at >= ${istInstant(today, 0)} and s.starts_at < ${istInstant(addDaysKey(today, 14), 0)}
     order by s.starts_at` : [];
  const now = nowMs();
  const totals = slots.filter((s) => s.active && new Date(s.starts_at).getTime() > now).reduce((a, s) => ({ cap: a.cap + s.capacity, held: a.held + s.held }), { cap: 0, held: 0 });

  return (
    <>
      <PageHeader title="Visit slots" sub="Buyers and the assistant can only book these times. Each slot holds a set number of visitor groups; a slot never takes more than its capacity." />
      <nav className="mb-5 flex gap-2" aria-label="Projects">
        {projects.map((p) => <Link key={p.slug} href={`/staff/slots?project=${p.slug}`} className={clsx("btn btn-sm", p.slug === project?.slug ? "btn-primary" : "btn-ghost")}>{p.name}</Link>)}
      </nav>

      <section className="mb-6 rounded-2xl border border-line bg-white p-5">
        <h2 className="mb-3 font-medium">Add slots for a day</h2>
        <AddSlotsForm projects={projects} today={today} />
      </section>

      <p className="mb-3 text-sm text-stone num">Next 14 days: {totals.held} of {totals.cap} places booked ({totals.cap ? Math.round((100 * totals.held) / totals.cap) : 0}%). Tap a slot to close it or change capacity.</p>
      <div className="flex flex-wrap gap-4 mb-4 text-xs text-stone">
        <span className="flex items-center gap-1.5"><span className="h-3 w-3 rounded border border-line bg-white" />Open</span>
        <span className="flex items-center gap-1.5"><span className="h-3 w-3 rounded bg-indigo-soft border border-indigo/40" />Partly booked</span>
        <span className="flex items-center gap-1.5"><span className="h-3 w-3 rounded bg-indigo" />Full</span>
        <span className="flex items-center gap-1.5"><span className="h-3 w-3 rounded border border-dashed border-line" />Closed</span>
      </div>

      <div className="space-y-3">
        {days.map((d) => {
          const list = slots.filter((s) => istDateKey(s.starts_at) === d);
          return (
            <div key={d} className="grid gap-2 sm:grid-cols-[8rem_1fr] sm:items-start">
              <p className="text-sm pt-1.5">{formatShortDay(istInstant(d, 12))}</p>
              {list.length === 0 ? <p className="text-sm text-stone pt-1.5">No slots</p> : (
                <div className="grid grid-cols-4 gap-1.5 sm:grid-cols-8">
                  {list.map((s) => (
                    <SlotCell key={s.id} slot={{ id: s.id, time: formatTime(s.starts_at), held: s.held, capacity: s.capacity, active: s.active, past: new Date(s.starts_at).getTime() <= now }} />
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </>
  );
}
