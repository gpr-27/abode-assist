import Link from "next/link";
import clsx from "clsx";
import { requireRole } from "@/lib/auth/session";
import { sql } from "@/lib/db";
import { median, sourceMetrics, type LeadFact } from "@/lib/metrics";
import { SOURCE_LABEL, type Source } from "@/lib/services/leads";
import { formatDuration, formatINR, istDateKey } from "@/lib/time";
import { PageHeader, Stat } from "@/components/ui";

export const metadata = { title: "Dashboard" };

const pct = (n: number | null, digits = 1) => (n == null ? "—" : `${n.toFixed(digits)}%`);
const monthLabel = (m: string) => new Intl.DateTimeFormat("en-IN", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${m}-01T00:00:00Z`));

export default async function DashboardPage({ searchParams }: PageProps<"/staff/dashboard">) {
  await requireRole("executive", "head");
  const sp = await searchParams;
  const months = (await sql<{ m: string }[]>`
    select distinct to_char(created_at at time zone 'Asia/Kolkata', 'YYYY-MM') as m from leads order by m desc`).map((r) => r.m);
  const current = istDateKey(new Date()).slice(0, 7);
  const rawM = Array.isArray(sp.month) ? sp.month[0] : sp.month;
  const month = rawM === "all" ? "all" : rawM && months.includes(rawM) ? rawM : months.includes(current) ? current : months[0] ?? current;
  const monthFilter = month === "all" ? null : month;

  const rows = await sql<{ source: string; created_at: Date; first_response_at: Date | null; visit: string | null; project: string | null; day: string }[]>`
    select (select t.source::text from lead_touches t where t.lead_id = l.id order by t.created_at limit 1) as source,
           l.created_at, l.first_response_at, p.name as project,
           to_char(l.created_at at time zone 'Asia/Kolkata', 'YYYY-MM-DD') as day,
           (select case when bool_or(v.status = 'visited') then 'visited' when bool_or(v.status = 'no_show') then 'no_show'
                        when bool_or(v.status = 'booked') then 'booked' end from visits v where v.lead_id = l.id) as visit
      from leads l left join projects p on p.id = l.project_id
     where ${monthFilter}::text is null or to_char(l.created_at at time zone 'Asia/Kolkata', 'YYYY-MM') = ${monthFilter}`;
  const spendRows = await sql<{ source: string; amount: string }[]>`
    select source::text, sum(amount_inr)::text as amount from source_spend
     where ${monthFilter}::text is null or to_char(month, 'YYYY-MM') = ${monthFilter} group by source`;
  const spend = Object.fromEntries(spendRows.map((r) => [r.source, Number(r.amount)]));

  const facts: LeadFact[] = rows.map((r) => ({
    source: r.source ?? "website", createdAt: new Date(r.created_at), firstResponseAt: r.first_response_at ? new Date(r.first_response_at) : null,
    visitStatus: (r.visit as LeadFact["visitStatus"]) ?? null,
  }));
  const now = new Date();
  const bySource = sourceMetrics(facts, spend, now);
  const all = sourceMetrics(facts.map((f) => ({ ...f, source: "all" })), { all: Object.values(spend).reduce((a, b) => a + b, 0) }, now)[0];

  const responses = facts.filter((f) => f.firstResponseAt).map((f) => f.firstResponseAt!.getTime() - f.createdAt.getTime());
  const med = median(responses);

  const byProject = new Map<string, { leads: number; booked: number; visited: number }>();
  for (const r of rows) {
    const k = r.project ?? "No project yet";
    const e = byProject.get(k) ?? { leads: 0, booked: 0, visited: 0 };
    e.leads++; if (r.visit) e.booked++; if (r.visit === "visited") e.visited++;
    byProject.set(k, e);
  }
  const perDay = new Map<string, number>();
  for (const r of rows) perDay.set(r.day, (perDay.get(r.day) ?? 0) + 1);
  const days = [...perDay.entries()].sort(([a], [b]) => a.localeCompare(b)).slice(-31);
  const maxDay = Math.max(1, ...days.map(([, n]) => n));

  return (
    <>
      <PageHeader title="Dashboard" sub="Response time, visits and cost by lead source. A lead counts toward the month it arrived in." />

      <nav aria-label="Period" className="mb-6 flex flex-wrap gap-2">
        {months.map((m) => <Link key={m} href={`/staff/dashboard?month=${m}`} className={clsx("btn btn-sm", month === m ? "btn-primary" : "btn-ghost")}>{monthLabel(m)}</Link>)}
        <Link href="/staff/dashboard?month=all" className={clsx("btn btn-sm", month === "all" ? "btn-primary" : "btn-ghost")}>All time</Link>
      </nav>

      <section className="grid grid-cols-2 gap-x-6 border-y border-line lg:grid-cols-5">
        <Stat label="Median first response" value={formatDuration(med)} hint="Target: under 5 minutes" tone={med == null ? undefined : med <= 5 * 60_000 ? "ok" : "warn"} />
        <Stat label="Not reached in 48 h" value={pct(all?.notReached48hPct ?? null)} hint="Target: under 5%" tone={all?.notReached48hPct == null ? undefined : all.notReached48hPct < 5 ? "ok" : "bad"} />
        <Stat label="Lead to visit" value={pct(all?.leadToVisitPct ?? null)} hint="Target: 8% (was 6%)" tone={all?.leadToVisitPct == null ? undefined : all.leadToVisitPct >= 8 ? "ok" : "warn"} />
        <Stat label="Show-up rate" value={pct(all?.showUpPct ?? null, 0)} hint={`${all?.visited ?? 0} came, ${all?.noShow ?? 0} didn't`} />
        <Stat label="Cost per visit" value={formatINR(all?.costPerVisit ?? null)} hint={`${formatINR(all?.spend ?? 0)} spend · ${all?.leads ?? 0} leads`} />
      </section>

      <section className="mt-10">
        <h2 className="display text-2xl">By source</h2>
        <div className="mt-4 overflow-x-auto rounded-2xl border border-line bg-white">
          <table className="w-full min-w-[760px] text-sm num">
            <thead className="text-left text-stone border-b border-line">
              <tr>
                <th className="px-4 py-3 font-normal">Source</th>
                <th className="px-4 py-3 font-normal text-right">Leads</th>
                <th className="px-4 py-3 font-normal text-right">Median response</th>
                <th className="px-4 py-3 font-normal text-right">Not reached 48 h</th>
                <th className="px-4 py-3 font-normal text-right">Visits booked</th>
                <th className="px-4 py-3 font-normal text-right">Visited</th>
                <th className="px-4 py-3 font-normal text-right">Show-up</th>
                <th className="px-4 py-3 font-normal text-right">Spend</th>
                <th className="px-4 py-3 font-normal text-right">Cost / lead</th>
                <th className="px-4 py-3 font-normal text-right">Cost / visit</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {bySource.map((r) => (
                <tr key={r.source}>
                  <td className="px-4 py-3">{SOURCE_LABEL[r.source as Source] ?? r.source}</td>
                  <td className="px-4 py-3 text-right">{r.leads}</td>
                  <td className={clsx("px-4 py-3 text-right", r.medianResponseMs != null && r.medianResponseMs > 5 * 60_000 && "text-warn")}>{formatDuration(r.medianResponseMs)}</td>
                  <td className={clsx("px-4 py-3 text-right", (r.notReached48hPct ?? 0) >= 5 && "text-bad")}>{pct(r.notReached48hPct)}</td>
                  <td className="px-4 py-3 text-right">{r.booked}</td>
                  <td className="px-4 py-3 text-right">{r.visited}</td>
                  <td className="px-4 py-3 text-right">{pct(r.showUpPct, 0)}</td>
                  <td className="px-4 py-3 text-right">{r.spend ? formatINR(r.spend) : "—"}</td>
                  <td className="px-4 py-3 text-right">{formatINR(r.costPerLead)}</td>
                  <td className="px-4 py-3 text-right">{formatINR(r.costPerVisit)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-xs text-stone">
          Demo data: spend is scaled down 1:20 from the brief&apos;s ₹30 lakh a month to match the sample volume. Web chat has no media spend. Leads under 48 hours old are not yet counted in &ldquo;not reached&rdquo;.
        </p>
      </section>

      <div className="mt-10 grid gap-10 lg:grid-cols-2">
        <section>
          <h2 className="display text-2xl">By project</h2>
          <table className="mt-4 w-full text-sm num">
            <thead className="text-left text-stone"><tr><th className="py-2 font-normal">Project</th><th className="py-2 font-normal text-right">Leads</th><th className="py-2 font-normal text-right">Visits booked</th><th className="py-2 font-normal text-right">Visited</th></tr></thead>
            <tbody className="divide-y divide-line border-t border-line">
              {[...byProject.entries()].map(([k, v]) => (
                <tr key={k}><td className="py-2.5">{k}</td><td className="py-2.5 text-right">{v.leads}</td><td className="py-2.5 text-right">{v.booked}</td><td className="py-2.5 text-right">{v.visited}</td></tr>
              ))}
            </tbody>
          </table>
        </section>
        <section>
          <h2 className="display text-2xl">Leads per day</h2>
          {days.length === 0 ? <p className="mt-4 text-sm text-stone">No leads in this period.</p> : (
            <ul className="mt-4 space-y-1" aria-label="Leads per day">
              {days.map(([d, n]) => (
                <li key={d} className="grid grid-cols-[5.5rem_1fr_2rem] items-center gap-3 text-xs">
                  <span className="text-stone num">{new Date(`${d}T00:00:00Z`).toLocaleDateString("en-IN", { day: "numeric", month: "short", weekday: "short", timeZone: "UTC" })}</span>
                  <span className="h-2.5 rounded-sm bg-indigo/80" style={{ width: `${(100 * n) / maxDay}%` }} aria-hidden />
                  <span className="num text-right">{n}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </>
  );
}
