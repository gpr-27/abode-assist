import Link from "next/link";
import { after } from "next/server";
import clsx from "clsx";
import { requireRole } from "@/lib/auth/session";
import { nowMs } from "@/lib/staff/labels";
import { sql } from "@/lib/db";
import { dispatchDue } from "@/lib/services/outbox";
import { VISIT_LABEL, VISIT_TONE } from "@/lib/staff/labels";
import { addDaysKey, formatDay, formatDateTime, formatTime, istDateKey, istInstant } from "@/lib/time";
import { Badge, Empty, PageHeader } from "@/components/ui";
import { OutcomeButtons } from "@/components/staff/visit-actions";

export const metadata = { title: "Visits" };

type SlotRow = { id: string; project_id: string; project_name: string; starts_at: Date; capacity: number; active: boolean };
type VisitRow = { id: string; slot_id: string; status: string; party_size: number; booked_via: string; lead_id: string; lead_name: string; lead_code: string; exec_name: string | null; starts_at: Date; project_name: string };

export default async function VisitsPage({ searchParams }: PageProps<"/staff/visits">) {
  await requireRole("executive", "head");
  const sp = await searchParams;
  const raw = Array.isArray(sp.date) ? sp.date[0] : sp.date;
  const today = istDateKey(new Date());
  const day = raw && /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : today;
  const from = istInstant(day, 0);
  const to = istInstant(addDaysKey(day, 1), 0);
  after(() => dispatchDue().catch(() => {}));

  const [slots, visits, awaiting] = await Promise.all([
    sql<SlotRow[]>`select s.id, s.project_id, p.name as project_name, s.starts_at, s.capacity, s.active
                     from visit_slots s join projects p on p.id = s.project_id
                    where s.starts_at >= ${from} and s.starts_at < ${to} order by p.name, s.starts_at`,
    sql<VisitRow[]>`select v.id, v.slot_id, v.status, v.party_size, v.booked_via, l.id as lead_id, l.name as lead_name, l.code as lead_code,
                           u.name as exec_name, s.starts_at, p.name as project_name
                      from visits v join visit_slots s on s.id = v.slot_id join leads l on l.id = v.lead_id
                      join projects p on p.id = s.project_id left join users u on u.id = l.assigned_to
                     where s.starts_at >= ${from} and s.starts_at < ${to} and v.status <> 'cancelled' order by s.starts_at`,
    sql<VisitRow[]>`select v.id, v.slot_id, v.status, v.party_size, v.booked_via, l.id as lead_id, l.name as lead_name, l.code as lead_code,
                           u.name as exec_name, s.starts_at, p.name as project_name
                      from visits v join visit_slots s on s.id = v.slot_id join leads l on l.id = v.lead_id
                      join projects p on p.id = s.project_id left join users u on u.id = l.assigned_to
                     where v.status = 'booked' and s.starts_at < now() - interval '45 minutes' order by s.starts_at`,
  ]);

  const now = nowMs();
  const projects = [...new Set(slots.map((s) => s.project_name))];
  const bookedCount = visits.filter((v) => v.status === "booked").length;
  const canMark = (starts: Date) => new Date(starts).getTime() < now + 12 * 3600_000;

  return (
    <>
      <PageHeader
        title="Site visits"
        sub={`${formatDay(from)}${day === today ? " (today)" : ""} — ${visits.length} visit${visits.length === 1 ? "" : "s"}, ${bookedCount} still to happen or be marked.`}
        actions={
          <>
            <Link className="btn btn-ghost btn-sm" href={`/staff/visits?date=${addDaysKey(day, -1)}`}>Previous day</Link>
            {day !== today && <Link className="btn btn-ghost btn-sm" href="/staff/visits">Today</Link>}
            <Link className="btn btn-ghost btn-sm" href={`/staff/visits?date=${addDaysKey(day, 1)}`}>Next day</Link>
          </>
        }
      />

      {awaiting.length > 0 && (
        <section className="mb-8 rounded-2xl bg-warn-soft p-5">
          <h2 className="font-medium text-warn">Awaiting outcome</h2>
          <p className="text-sm text-warn">These visits have passed but nobody marked whether the buyer came. Show-up rates depend on it.</p>
          <ul className="mt-3 divide-y divide-warn/20">
            {awaiting.map((v) => (
              <li key={v.id} className="flex flex-col gap-2 py-3 text-sm sm:flex-row sm:items-center sm:justify-between">
                <span><Link href={`/staff/leads/${v.lead_id}`} className="font-medium hover:underline">{v.lead_name}</Link> <span className="text-xs num">{v.lead_code}</span> — {v.project_name}, {formatDateTime(v.starts_at)}{v.exec_name ? `, ${v.exec_name}` : ""}</span>
                <OutcomeButtons visitId={v.id} />
              </li>
            ))}
          </ul>
        </section>
      )}

      {slots.length === 0 ? (
        <Empty title="No visit slots on this day" action={<Link href="/staff/slots" className="btn btn-ghost btn-sm">Manage slots</Link>}>
          The sales head opens slots per project. Buyers can only book times that exist here.
        </Empty>
      ) : (
        <div className="grid gap-6 xl:grid-cols-2">
          {projects.map((pn) => (
            <section key={pn} className="rounded-2xl border border-line bg-white">
              <h2 className="border-b border-line px-5 py-3 font-medium">{pn}</h2>
              <ul className="divide-y divide-line">
                {slots.filter((s) => s.project_name === pn).map((s) => {
                  const vs = visits.filter((v) => v.slot_id === s.id);
                  const held = vs.filter((v) => v.status === "booked").length;
                  const used = vs.length;
                  return (
                    <li key={s.id} className={clsx("grid grid-cols-[4.5rem_1fr] gap-3 px-5 py-3", !s.active && "opacity-60")}>
                      <div>
                        <p className="num font-medium">{formatTime(s.starts_at)}</p>
                        <p className="text-xs text-stone num">{used}/{s.capacity}{!s.active && " · closed"}</p>
                        <div className="mt-1 h-1 rounded-full bg-paper-2" aria-hidden><div className="h-1 rounded-full bg-indigo" style={{ width: `${Math.min(100, (100 * used) / s.capacity)}%` }} /></div>
                      </div>
                      <div className="min-w-0">
                        {vs.length === 0 ? <p className="text-sm text-stone pt-0.5">{s.active ? "Open" : "Closed by the sales head"}</p> : (
                          <ul className="space-y-2">
                            {vs.map((v) => (
                              <li key={v.id} className="flex flex-col gap-2 text-sm sm:flex-row sm:items-center sm:justify-between">
                                <span className="min-w-0">
                                  <Link href={`/staff/leads/${v.lead_id}`} className="font-medium hover:text-indigo">{v.lead_name}</Link>
                                  <span className="ml-1.5 text-xs text-stone num">{v.lead_code}</span>
                                  <span className="block text-xs text-stone">{v.exec_name ?? "No executive yet"} · party of {v.party_size} · via {v.booked_via}</span>
                                </span>
                                {v.status === "booked" && canMark(v.starts_at) ? <OutcomeButtons visitId={v.id} /> : <Badge tone={VISIT_TONE[v.status]}>{VISIT_LABEL[v.status]}</Badge>}
                              </li>
                            ))}
                          </ul>
                        )}
                        {held > 0 && held >= s.capacity && <p className="mt-1 text-xs text-stone">Full</p>}
                      </div>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </div>
      )}
    </>
  );
}
