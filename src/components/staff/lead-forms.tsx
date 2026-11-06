"use client";
import { ActionForm } from "./action-ui";
import { addLead, importCsv } from "@/app/staff/actions";

const SOURCES = [
  ["portal", "Property portal"], ["social", "Social media ad"], ["website", "Website"], ["hoarding", "Hoarding call"], ["chat", "Web chat"],
] as const;

export function AddLeadForm({ projects }: { projects: { slug: string; name: string }[] }) {
  return (
    <ActionForm action={addLead} resetOnOk className="grid gap-3 sm:grid-cols-2">
      {(pending) => (
        <>
          <label className="text-sm">Name<input name="name" required minLength={2} maxLength={120} className="field mt-1" autoComplete="off" /></label>
          <label className="text-sm">Mobile<input name="phone" inputMode="tel" placeholder="98250 12345" className="field mt-1" autoComplete="off" /></label>
          <label className="text-sm">E-mail<input name="email" type="email" className="field mt-1" autoComplete="off" /></label>
          <label className="text-sm">Project
            <select name="project" className="field mt-1" defaultValue="">
              <option value="">Not chosen</option>
              {projects.map((p) => <option key={p.slug} value={p.slug}>{p.name}</option>)}
            </select>
          </label>
          <label className="text-sm">Wants
            <select name="wants" className="field mt-1" defaultValue="">
              <option value="">Not known</option><option>2 BHK</option><option>3 BHK</option><option>2 or 3 BHK</option>
            </select>
          </label>
          <label className="text-sm">Source
            <select name="source" className="field mt-1" defaultValue="hoarding">
              {SOURCES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </label>
          <label className="sm:col-span-2 flex items-start gap-2 text-sm">
            <input type="checkbox" name="consent" className="mt-1 accent-[var(--indigo)]" />
            <span>The buyer agreed to be contacted on WhatsApp/SMS about this enquiry (DPDP consent). Without it, no automatic message is sent.</span>
          </label>
          <div className="sm:col-span-2"><button className="btn btn-primary btn-sm" disabled={pending}>{pending ? "Adding…" : "Add lead"}</button></div>
        </>
      )}
    </ActionForm>
  );
}

export function ImportCsvForm() {
  return (
    <ActionForm action={importCsv} className="space-y-3">
      {(pending, state) => (
        <>
          <p className="text-sm text-stone">
            Columns we read: name, phone, email, project, wants, source, consent, note. Same phone or e-mail as an existing lead adds a source tag instead of a duplicate.{" "}
            <a href="/staff/leads/sample.csv" className="text-indigo underline underline-offset-2">Download a sample CSV</a>
          </p>
          <div className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
            <label className="text-sm">CSV file<input type="file" name="file" accept=".csv,text/csv" className="field mt-1 py-2" /></label>
            <label className="text-sm">Default source
              <select name="source" className="field mt-1" defaultValue="portal">
                {SOURCES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </label>
          </div>
          <label className="block text-sm">…or paste rows
            <textarea name="text" rows={4} className="field mt-1 font-mono text-xs" placeholder={"name,phone,project,wants,source,consent\nJignesh Bhatt,9824012345,Project 1,3 BHK,99acres,yes"} />
          </label>
          <button className="btn btn-primary btn-sm" disabled={pending}>{pending ? "Importing…" : "Import"}</button>
          {state?.report && (
            <div className="rounded-xl bg-paper-2 p-4 text-sm">
              <p><span className="num font-medium">{state.report.created}</span> new leads · <span className="num font-medium">{state.report.merged}</span> merged into existing leads · <span className="num font-medium">{state.report.possible}</span> flagged as possible duplicates · <span className="num font-medium">{state.report.rejected.length}</span> rejected</p>
              {state.report.rejected.length > 0 && (
                <ul className="mt-2 list-disc pl-5 text-bad">
                  {state.report.rejected.slice(0, 20).map((r) => <li key={r.row}>Row {r.row}: {r.reason}</li>)}
                </ul>
              )}
            </div>
          )}
        </>
      )}
    </ActionForm>
  );
}
