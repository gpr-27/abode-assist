import Link from "next/link";
import { after } from "next/server";
import clsx from "clsx";
import { requireRole } from "@/lib/auth/session";
import { listLeads, listProjects } from "@/lib/staff/queries";
import { responseState, STATUS_LABEL, STATUS_TONE, STATUSES } from "@/lib/staff/labels";
import { SOURCE_LABEL, type Source } from "@/lib/services/leads";
import { dispatchDue } from "@/lib/services/outbox";
import { maskPhone } from "@/lib/phone";
import { formatDateTime } from "@/lib/time";
import { Badge, Empty, PageHeader } from "@/components/ui";
import { AddLeadForm, ImportCsvForm } from "@/components/staff/lead-forms";

export const metadata = { title: "Leads" };

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) || undefined;

export default async function LeadsPage({ searchParams }: PageProps<"/staff/leads">) {
  const session = await requireRole("executive", "head");
  const sp = await searchParams;
  const f = {
    q: one(sp.q), source: one(sp.source), status: one(sp.status), project: one(sp.project),
    mine: one(sp.mine) === "1", needs: one(sp.needs) === "1", page: Number(one(sp.page) ?? 1) || 1,
  };
  after(() => dispatchDue().catch(() => {}));
  const [{ rows, total, page, pages }, projects] = await Promise.all([listLeads(f, session), listProjects()]);
  const now = new Date();
  const filtered = !!(f.q || f.source || f.status || f.project || f.mine || f.needs);
  const qs = (patch: Record<string, string | undefined>) => {
    const p = new URLSearchParams();
    const merged = { q: f.q, source: f.source, status: f.status, project: f.project, mine: f.mine ? "1" : undefined, needs: f.needs ? "1" : undefined, ...patch };
    for (const [k, v] of Object.entries(merged)) if (v) p.set(k, v);
    const s = p.toString();
    return s ? `?${s}` : "";
  };

  return (
    <>
      <PageHeader
        title="Leads"
        sub={`${total} ${filtered ? "matching" : "in total"} — portals, ads, the website, hoarding calls and web chat in one list. Unanswered leads come first.`}
      />

      <div className="mb-6 grid gap-3 lg:grid-cols-2">
        <details className="group rounded-2xl border border-line bg-white">
          <summary className="cursor-pointer list-none px-5 py-3.5 text-sm font-medium flex justify-between">Add a lead <span className="text-stone group-open:rotate-45 transition-transform">+</span></summary>
          <div className="px-5 pb-5"><AddLeadForm projects={projects} /></div>
        </details>
        <details className="group rounded-2xl border border-line bg-white">
          <summary className="cursor-pointer list-none px-5 py-3.5 text-sm font-medium flex justify-between">Import portal CSV <span className="text-stone group-open:rotate-45 transition-transform">+</span></summary>
          <div className="px-5 pb-5"><ImportCsvForm /></div>
        </details>
      </div>

      <form className="mb-4 flex flex-wrap items-end gap-2" role="search">
        <label className="text-sm flex flex-col grow min-w-[12rem] max-w-xs">Search
          <input name="q" defaultValue={f.q} placeholder="Name, phone or LD-code" className="field mt-1 py-2" />
        </label>
        <label className="text-sm flex flex-col">Source
          <select name="source" defaultValue={f.source ?? ""} className="field mt-1 py-2 w-auto">
            <option value="">All</option>
            {(Object.keys(SOURCE_LABEL) as Source[]).map((s) => <option key={s} value={s}>{SOURCE_LABEL[s]}</option>)}
          </select>
        </label>
        <label className="text-sm flex flex-col">Status
          <select name="status" defaultValue={f.status ?? ""} className="field mt-1 py-2 w-auto">
            <option value="">All</option>
            {STATUSES.map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
          </select>
        </label>
        <label className="text-sm flex flex-col">Project
          <select name="project" defaultValue={f.project ?? ""} className="field mt-1 py-2 w-auto">
            <option value="">All</option>
            {projects.map((p) => <option key={p.slug} value={p.slug}>{p.name}</option>)}
          </select>
        </label>
        {f.mine && <input type="hidden" name="mine" value="1" />}
        {f.needs && <input type="hidden" name="needs" value="1" />}
        <button className="btn btn-ghost btn-sm">Apply</button>
        <div className="flex gap-2 sm:ml-auto">
          <Link href={`/staff/leads${qs({ mine: f.mine ? undefined : "1", page: undefined })}`} className={clsx("btn btn-sm", f.mine ? "btn-primary" : "btn-ghost")}>My leads</Link>
          <Link href={`/staff/leads${qs({ needs: f.needs ? undefined : "1", page: undefined })}`} className={clsx("btn btn-sm", f.needs ? "btn-primary" : "btn-ghost")}>Needs a response</Link>
          {filtered && <Link href="/staff/leads" className="btn btn-quiet btn-sm">Clear</Link>}
        </div>
      </form>

      {rows.length === 0 ? (
        <Empty title={filtered ? "No leads match these filters" : "No leads yet"} action={filtered ? <Link href="/staff/leads" className="btn btn-ghost btn-sm">Clear filters</Link> : undefined}>
          {filtered ? "Try a shorter search or another source." : "Leads from web chat appear here instantly. Add one by hand or import a portal CSV above."}
        </Empty>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-line bg-white">
          <table className="w-full text-sm">
            <thead className="hidden md:table-header-group text-left text-stone border-b border-line">
              <tr>
                <th className="px-4 py-3 font-normal">Lead</th>
                <th className="px-4 py-3 font-normal">Wants</th>
                <th className="px-4 py-3 font-normal">Sources</th>
                <th className="px-4 py-3 font-normal">Status</th>
                <th className="px-4 py-3 font-normal">Executive</th>
                <th className="px-4 py-3 font-normal">First response</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {rows.map((l) => {
                const rs = responseState(l.created_at, l.first_response_at, !!l.consent_at, now);
                return (
                  <tr key={l.id} className="block md:table-row hover:bg-paper-2/60 px-4 py-3 md:p-0">
                    <td className="block md:table-cell md:px-4 md:py-3">
                      <Link href={`/staff/leads/${l.id}`} className="font-medium hover:text-indigo">{l.name}</Link>
                      <span className="ml-2 num text-xs text-stone">{l.code}</span>
                      {l.duplicate_code && <Badge tone="warn" className="ml-2">Possible duplicate of {l.duplicate_code}</Badge>}
                      {l.opted_out_at && <Badge tone="bad" className="ml-2">Opted out</Badge>}
                      <p className="text-xs text-stone mt-0.5 num">{maskPhone(l.phone)} · {formatDateTime(l.created_at)}</p>
                    </td>
                    <td className="inline-block md:table-cell md:px-4 md:py-3 mr-3 mt-1 md:mt-0">
                      <span>{l.wants ?? "—"}</span>
                      <span className="block text-xs text-stone">{l.project_name ?? "No project yet"}</span>
                    </td>
                    <td className="inline-block md:table-cell md:px-4 md:py-3 mr-3">
                      <span className="flex flex-wrap gap-1">{l.sources.map((s) => <Badge key={s}>{SOURCE_LABEL[s as Source] ?? s}</Badge>)}</span>
                    </td>
                    <td className="inline-block md:table-cell md:px-4 md:py-3 mr-3"><Badge tone={STATUS_TONE[l.status]}>{STATUS_LABEL[l.status]}</Badge></td>
                    <td className="inline-block md:table-cell md:px-4 md:py-3 mr-3 text-stone">{l.assigned_name ?? "Unassigned"}</td>
                    <td className="block md:table-cell md:px-4 md:py-3 mt-1 md:mt-0"><Badge tone={rs.tone}>{rs.label}</Badge></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {pages > 1 && (
        <nav aria-label="Pages" className="mt-4 flex items-center justify-between text-sm">
          <span className="text-stone num">Page {page} of {pages}</span>
          <span className="flex gap-2">
            {page > 1 && <Link className="btn btn-ghost btn-sm" href={`/staff/leads${qs({ page: String(page - 1) })}`}>Previous</Link>}
            {page < pages && <Link className="btn btn-ghost btn-sm" href={`/staff/leads${qs({ page: String(page + 1) })}`}>Next</Link>}
          </span>
        </nav>
      )}
    </>
  );
}
