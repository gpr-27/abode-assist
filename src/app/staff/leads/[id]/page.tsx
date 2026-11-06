import Link from "next/link";
import { notFound } from "next/navigation";
import clsx from "clsx";
import { requireRole } from "@/lib/auth/session";
import { canAct, getLead, getLeadExtras, listExecutives, listProjects } from "@/lib/staff/queries";
import { FLAG_LABEL, KIND_LABEL, OUTBOX_LABEL, OUTBOX_TONE, responseState, STATUS_LABEL, STATUSES, VISIT_LABEL, VISIT_TONE } from "@/lib/staff/labels";
import { SOURCE_LABEL, type Source } from "@/lib/services/leads";
import { loadSlots } from "@/lib/services/visits";
import { HANDOFF_LABEL, type HandoffReason } from "@/lib/services/handoff";
import { formatPhone } from "@/lib/phone";
import { formatDateTime, formatShortDay, formatTime } from "@/lib/time";
import { Badge, Notice } from "@/components/ui";
import {
  BookVisitForm, CancelVisitButton, ConsentButton, DuplicateActions, LogCallButton, ReassignSelect, RefreshSummaryButton, ReplyForm, StatusSelect, TakeLeadButton,
} from "@/components/staff/lead-actions";

export const metadata = { title: "Lead" };

type Summary = { summary: string; wants: string | null; budget: string | null; timeline: string | null; intent: string; open_questions: string[]; generatedBy: string };

function parseSummary(s: string | null): Summary | null {
  if (!s) return null;
  try { return JSON.parse(s) as Summary; } catch { return { summary: s, wants: null, budget: null, timeline: null, intent: "", open_questions: [], generatedBy: "unknown" }; }
}

const LANG_NAME: Record<string, string> = { en: "English", hi: "Hindi", gu: "Gujarati" };

export default async function LeadPage({ params }: PageProps<"/staff/leads/[id]">) {
  const session = await requireRole("executive", "head");
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const lead = await getLead(id);
  if (!lead) notFound();
  const [extras, executives, projects] = await Promise.all([getLeadExtras(id), listExecutives(), listProjects()]);
  const mayAct = canAct(session, lead);
  const head = session.role === "head";
  const summary = parseSummary(lead.summary);
  const rs = responseState(lead.created_at, lead.first_response_at, !!lead.consent_at);
  const activeVisit = extras.visits.find((v) => v.status === "booked");

  const slotOptions = mayAct && !lead.opted_out_at
    ? (await Promise.all(projects.map(async (p) => (await loadSlots(p.id, 14)).map((s) => ({
        id: s.id, project: p.name, day: formatShortDay(s.starts_at), label: `${formatTime(s.starts_at)} · ${s.left} of ${s.capacity} free`,
      }))))).flat()
    : [];

  const latestConv = extras.conversations.at(-1);
  const blockedMessaging = lead.opted_out_at ? "The buyer opted out of messages. Replies are disabled (DPDP)." : !mayAct ? `Only ${lead.assigned_name ?? "the assigned executive"} or the sales head can reply.` : undefined;

  return (
    <div className="space-y-8">
      <nav className="text-sm text-stone"><Link href="/staff/leads" className="hover:text-ink">Leads</Link> / {lead.code}</nav>

      <header className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h1 className="display text-4xl leading-tight">{lead.name}</h1>
          <p className="mt-2 text-sm text-stone flex flex-wrap gap-x-4 gap-y-1">
            <span className="num">{lead.code}</span>
            {lead.phone && <a href={`tel:${lead.phone}`} className="text-ink hover:text-indigo num">{formatPhone(lead.phone)}</a>}
            {lead.email && <a href={`mailto:${lead.email}`} className="text-ink hover:text-indigo">{lead.email}</a>}
            <span>{lead.project_name ?? "No project yet"}{lead.wants ? `, ${lead.wants}` : ""}</span>
            <span>Prefers {LANG_NAME[lead.language] ?? lead.language}</span>
          </p>
          <p className="mt-3 flex flex-wrap gap-2">
            <Badge tone={rs.tone}>{rs.label}</Badge>
            {lead.consent_at ? <Badge tone="ok">Consent given {formatShortDay(lead.consent_at)}</Badge> : <Badge tone="warn">No messaging consent</Badge>}
          </p>
        </div>
        <div className="flex flex-wrap items-start gap-3">
          {mayAct ? <StatusSelect leadId={lead.id} status={lead.status} options={STATUSES.map((s) => ({ value: s, label: STATUS_LABEL[s] }))} />
                  : <Badge>{STATUS_LABEL[lead.status]}</Badge>}
          {head ? <ReassignSelect leadId={lead.id} current={lead.assigned_to} executives={executives} />
                : lead.assigned_to ? <span className="text-sm text-stone pt-1.5">With {lead.assigned_name}</span> : <TakeLeadButton leadId={lead.id} />}
          {mayAct && !lead.first_response_at && <LogCallButton leadId={lead.id} />}
          {mayAct && !lead.consent_at && !lead.opted_out_at && <ConsentButton leadId={lead.id} />}
        </div>
      </header>

      {lead.opted_out_at && <Notice tone="bad">Opted out on {formatDateTime(lead.opted_out_at)}. No WhatsApp, SMS or reminders will be sent, and pending ones were cancelled. Contact this buyer only if they reach out again.</Notice>}
      {lead.duplicate_hint && lead.duplicate_code && (
        <div className="rounded-2xl bg-warn-soft px-5 py-4 text-sm text-warn flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p>This may be the same buyer as <Link className="underline underline-offset-2" href={`/staff/leads/${lead.duplicate_hint}`}>{lead.duplicate_code} {lead.duplicate_name}</Link> (similar name, different contact).</p>
          <DuplicateActions leadId={lead.id} intoId={lead.duplicate_hint} intoCode={lead.duplicate_code} canMerge={head} />
        </div>
      )}

      <div className="grid gap-8 lg:grid-cols-[1.5fr_1fr]">
        <div className="space-y-8 min-w-0">
          <section className="rounded-2xl border border-line bg-white p-5 sm:p-6">
            <div className="flex items-center justify-between gap-3">
              <h2 className="font-medium">AI summary <span className="font-normal text-stone">— check before relying on it</span></h2>
              {latestConv && <RefreshSummaryButton leadId={lead.id} />}
            </div>
            {summary ? (
              <>
                <p className="mt-3 leading-relaxed">{summary.summary}</p>
                <dl className="mt-4 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
                  <div><dt className="text-stone">Wants</dt><dd>{summary.wants ?? lead.wants ?? "—"}</dd></div>
                  <div><dt className="text-stone">Budget</dt><dd>{summary.budget ?? lead.budget ?? "—"}</dd></div>
                  <div><dt className="text-stone">Timeline</dt><dd>{summary.timeline ?? lead.timeline ?? "—"}</dd></div>
                  <div><dt className="text-stone">Intent</dt><dd className="capitalize">{summary.intent || "—"}</dd></div>
                </dl>
                {summary.open_questions?.length > 0 && (
                  <div className="mt-4 text-sm">
                    <p className="text-stone">Questions the assistant couldn&apos;t answer</p>
                    <ul className="mt-1 list-disc pl-5">{summary.open_questions.map((q) => <li key={q}>{q}</li>)}</ul>
                  </div>
                )}
                <p className="mt-4 text-xs text-stone">Generated by {summary.generatedBy}. It only uses what the buyer said in chat.</p>
              </>
            ) : (
              <p className="mt-3 text-sm text-stone">
                {latestConv ? "No summary yet. It is written when the chat is handed to a person; you can also refresh it now." : `No chat with this lead. Known needs: ${[lead.wants, lead.budget].filter(Boolean).join(", ") || "none recorded"}.`}
              </p>
            )}
          </section>

          <section>
            <h2 className="display text-2xl">Conversation</h2>
            {extras.conversations.length === 0 ? (
              <p className="mt-3 text-sm text-stone">This lead came from {SOURCE_LABEL[(extras.touches[0]?.source ?? "portal") as Source]} and hasn&apos;t chatted. Call them, then log the call above.</p>
            ) : extras.conversations.map((c) => (
              <div key={c.id} className="mt-4 rounded-2xl border border-line bg-white">
                <div className="flex flex-wrap items-center gap-2 border-b border-line px-5 py-3 text-sm text-stone">
                  <span>Web chat · {c.project_name ?? "no project"} · started {formatDateTime(c.created_at)}</span>
                  {c.handoff_reason && <Badge tone="indigo">{HANDOFF_LABEL[c.handoff_reason as HandoffReason] ?? c.handoff_reason}</Badge>}
                  {c.flag_reasons.map((r) => <Badge key={r} tone="warn">{FLAG_LABEL[r] ?? r}</Badge>)}
                </div>
                <ol className="space-y-3 px-5 py-4">
                  {extras.messages.filter((m) => m.conversation_id === c.id).map((m) => m.role === "system" ? (
                    <li key={m.id} className="text-center text-xs text-stone">{m.content} · {formatTime(m.created_at)}</li>
                  ) : (
                    <li key={m.id} className={clsx("flex", m.role === "buyer" ? "justify-start" : "justify-end")}>
                      <div className={clsx("max-w-[85%] rounded-2xl px-4 py-2.5 text-sm",
                        m.role === "buyer" ? "bg-paper-2" : m.role === "executive" ? "bg-indigo text-white" : "bg-indigo-soft")}>
                        <p className="whitespace-pre-wrap">{m.content}</p>
                        {typeof m.meta?.blocked === "string" && <p className="mt-2 text-xs line-through opacity-70" title="Blocked before sending">{String(m.meta.blocked)}</p>}
                        <p className={clsx("mt-1 text-[11px]", m.role === "executive" ? "text-white/70" : "text-stone")}>
                          {m.role === "buyer" ? "Buyer" : m.role === "executive" ? m.author_name ?? "Executive" : `Assistant${m.meta?.model ? ` (${String(m.meta.model)})` : ""}${m.meta?.fallback ? " — offline fallback" : ""}`} · {formatTime(m.created_at)}
                        </p>
                      </div>
                    </li>
                  ))}
                </ol>
                {c.id === latestConv?.id && (
                  <div className="border-t border-line px-5 py-4"><ReplyForm leadId={lead.id} conversationId={c.id} disabled={blockedMessaging} /></div>
                )}
              </div>
            ))}
          </section>
        </div>

        <div className="space-y-8 min-w-0">
          <section className="rounded-2xl border border-line bg-white p-5 sm:p-6">
            <h2 className="font-medium">Site visits</h2>
            {extras.visits.length === 0 ? <p className="mt-2 text-sm text-stone">No visits yet.</p> : (
              <ul className="mt-3 divide-y divide-line">
                {extras.visits.map((v) => (
                  <li key={v.id} className="py-3 text-sm flex flex-wrap items-center justify-between gap-2">
                    <span>
                      <span className="block">{v.project_name}, {formatDateTime(v.starts_at)}</span>
                      <span className="text-xs text-stone">Booked by {v.booked_via} · party of {v.party_size}</span>
                    </span>
                    <span className="flex items-center gap-2">
                      <Badge tone={VISIT_TONE[v.status]}>{VISIT_LABEL[v.status]}</Badge>
                      {v.status === "booked" && mayAct && <CancelVisitButton visitId={v.id} leadId={lead.id} />}
                    </span>
                  </li>
                ))}
              </ul>
            )}
            {mayAct && !lead.opted_out_at && (
              <div className="mt-4 border-t border-line pt-4">
                <p className="mb-2 text-sm text-stone">{activeVisit ? "Move the visit to another time" : "Book a visit for this buyer"}</p>
                {lead.consent_at ? <BookVisitForm leadId={lead.id} slots={slotOptions} defaultProject={lead.project_name} />
                  : <p className="text-sm text-warn">Booking sends a WhatsApp confirmation and reminders, so record the buyer&apos;s consent first.</p>}
              </div>
            )}
          </section>

          <section className="rounded-2xl border border-line bg-white p-5 sm:p-6">
            <h2 className="font-medium">Messages to the buyer</h2>
            <p className="text-xs text-stone mt-1">WhatsApp/SMS are simulated in this demo.</p>
            {extras.outbox.length === 0 ? <p className="mt-2 text-sm text-stone">Nothing sent{lead.consent_at ? "" : " — no consent to message"}.</p> : (
              <ul className="mt-3 space-y-3">
                {extras.outbox.map((o) => (
                  <li key={o.id} className="text-sm">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium">{KIND_LABEL[o.kind] ?? o.kind}</span>
                      <Badge tone={OUTBOX_TONE[o.status]}>{OUTBOX_LABEL[o.status]}</Badge>
                      <span className="text-xs text-stone">{o.status === "sent" && o.sent_at ? formatDateTime(o.sent_at) : formatDateTime(o.send_at)}</span>
                    </div>
                    {o.status_note && <p className="text-xs text-stone">{o.status_note}</p>}
                    <details className="mt-1"><summary className="cursor-pointer text-xs text-indigo">Show text</summary><p className="mt-1 whitespace-pre-wrap rounded-lg bg-paper-2 p-3 text-xs">{o.body}</p></details>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="rounded-2xl border border-line bg-white p-5 sm:p-6">
            <h2 className="font-medium">Where this lead came from</h2>
            <ol className="mt-3 space-y-2 text-sm">
              {extras.touches.map((t) => (
                <li key={t.id} className="flex flex-wrap justify-between gap-2">
                  <span><Badge>{SOURCE_LABEL[t.source as Source] ?? t.source}</Badge>{t.note && <span className="ml-2 text-stone">{t.note}</span>}</span>
                  <span className="text-xs text-stone">{formatDateTime(t.created_at)}</span>
                </li>
              ))}
            </ol>
          </section>
        </div>
      </div>
    </div>
  );
}
