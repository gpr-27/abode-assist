import Link from "next/link";
import clsx from "clsx";
import { requireRole } from "@/lib/auth/session";
import { sql } from "@/lib/db";
import { FLAG_LABEL } from "@/lib/staff/labels";
import { HANDOFF_LABEL, type HandoffReason } from "@/lib/services/handoff";
import { formatDateTime, formatTime } from "@/lib/time";
import { Badge, Empty, PageHeader } from "@/components/ui";
import { ReviewForm } from "@/components/staff/review-form";

export const metadata = { title: "Review" };

type Conv = {
  id: string; flag_reasons: string[]; handoff_reason: string | null; created_at: Date; updated_at: Date; reviewed_at: Date | null;
  review_note: string | null; reviewer: string | null; lead_id: string | null; lead_name: string | null; lead_code: string | null; project_name: string | null; language: string;
};

export default async function ReviewPage({ searchParams }: PageProps<"/staff/review">) {
  await requireRole("head");
  const sp = await searchParams;
  const tab = (Array.isArray(sp.tab) ? sp.tab[0] : sp.tab) === "reviewed" ? "reviewed" : "open";
  const convs = await sql<Conv[]>`
    select c.id, c.flag_reasons, c.handoff_reason, c.created_at, c.updated_at, c.reviewed_at, c.review_note, u.name as reviewer,
           l.id as lead_id, l.name as lead_name, l.code as lead_code, p.name as project_name, c.language
      from conversations c
      left join leads l on l.id = c.lead_id left join projects p on p.id = c.project_id left join users u on u.id = c.reviewed_by
     where c.flagged and ${tab === "open"} = (c.reviewed_at is null)
     order by c.updated_at desc limit 50`;
  const ids = convs.map((c) => c.id);
  const msgs = ids.length ? await sql<{ id: string; conversation_id: string; role: string; content: string; meta: Record<string, unknown>; created_at: Date }[]>`
    select id, conversation_id, role::text, content, meta, created_at from messages where conversation_id in ${sql(ids)} order by created_at, id` : [];
  const [{ open, reviewed }] = await sql<{ open: number; reviewed: number }[]>`
    select count(*) filter (where reviewed_at is null)::int as open, count(*) filter (where reviewed_at is not null)::int as reviewed
      from conversations where flagged`;

  return (
    <>
      <PageHeader title="Flagged chats" sub="Chats where a buyer asked for a discount, the assistant lacked a fact, a reply was blocked, or the AI was down. Review them daily." />
      <nav className="mb-6 flex gap-2" aria-label="Review tabs">
        <Link href="/staff/review" className={clsx("btn btn-sm", tab === "open" ? "btn-primary" : "btn-ghost")}>To review <span className="num ml-1 opacity-80">{open}</span></Link>
        <Link href="/staff/review?tab=reviewed" className={clsx("btn btn-sm", tab === "reviewed" ? "btn-primary" : "btn-ghost")}>Reviewed <span className="num ml-1 opacity-80">{reviewed}</span></Link>
      </nav>

      {convs.length === 0 ? (
        <Empty title={tab === "open" ? "Nothing to review" : "No reviewed chats yet"}>
          {tab === "open" ? "New flags appear here as buyers chat. The assistant blocks risky replies before buyers see them." : "Chats you mark reviewed move here with your note."}
        </Empty>
      ) : (
        <ul className="space-y-6">
          {convs.map((c) => {
            const missing = c.flag_reasons.includes("missing_fact");
            const lastBuyerQ = msgs.filter((m) => m.conversation_id === c.id && m.role === "buyer").at(-1)?.content ?? "";
            return (
              <li key={c.id} className="rounded-2xl border border-line bg-white">
                <div className="flex flex-col gap-2 border-b border-line px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="font-medium">
                      {c.lead_id ? <Link href={`/staff/leads/${c.lead_id}`} className="hover:text-indigo">{c.lead_name}</Link> : "Anonymous visitor"}
                      {c.lead_code && <span className="ml-2 text-xs text-stone num">{c.lead_code}</span>}
                    </p>
                    <p className="text-xs text-stone">{c.project_name ?? "No project"} · {c.language.toUpperCase()} · last message {formatDateTime(c.updated_at)}</p>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {c.flag_reasons.map((r) => <Badge key={r} tone="warn">{FLAG_LABEL[r] ?? r}</Badge>)}
                    {c.handoff_reason && <Badge tone="indigo">{HANDOFF_LABEL[c.handoff_reason as HandoffReason] ?? c.handoff_reason}</Badge>}
                  </div>
                </div>
                <ol className="space-y-2 px-5 py-4 text-sm">
                  {msgs.filter((m) => m.conversation_id === c.id).map((m) => (
                    <li key={m.id} className={clsx(m.role === "system" && "text-center text-xs text-stone")}>
                      {m.role !== "system" && <span className="text-stone">{m.role === "buyer" ? "Buyer" : m.role === "executive" ? "Executive" : "Assistant"}, {formatTime(m.created_at)}: </span>}
                      <span className="whitespace-pre-wrap">{m.content}</span>
                      {typeof m.meta?.blocked === "string" && (
                        <span className="mt-1 block rounded-lg bg-bad-soft px-3 py-2 text-xs text-bad">
                          Blocked before sending: <span className="line-through">{String(m.meta.blocked)}</span>
                        </span>
                      )}
                    </li>
                  ))}
                </ol>
                <div className="flex flex-col gap-3 border-t border-line px-5 py-4">
                  {c.reviewed_at ? (
                    <p className="text-sm text-stone">Reviewed by {c.reviewer ?? "the sales head"} on {formatDateTime(c.reviewed_at)}{c.review_note ? `: “${c.review_note}”` : "."}</p>
                  ) : <ReviewForm conversationId={c.id} />}
                  {missing && (
                    <Link href={`/staff/facts?topic=${encodeURIComponent(lastBuyerQ.slice(0, 80))}`} className="text-sm text-indigo underline underline-offset-2 self-start">
                      Add this to the fact sheet
                    </Link>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
