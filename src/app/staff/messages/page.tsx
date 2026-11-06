import Link from "next/link";
import { after } from "next/server";
import clsx from "clsx";
import { requireRole } from "@/lib/auth/session";
import { sql } from "@/lib/db";
import { dispatchDue } from "@/lib/services/outbox";
import { KIND_LABEL, OUTBOX_LABEL, OUTBOX_TONE } from "@/lib/staff/labels";
import { maskPhone } from "@/lib/phone";
import { formatDateTime } from "@/lib/time";
import { Badge, Empty, PageHeader } from "@/components/ui";
import { SendDueButton } from "@/components/staff/send-due";

export const metadata = { title: "Messages" };

const STATUSES = ["scheduled", "sent", "cancelled", "skipped"];
const KINDS = ["ack", "confirmation", "reminder_1d", "reminder_2h", "handoff"];

export default async function MessagesPage({ searchParams }: PageProps<"/staff/messages">) {
  await requireRole("executive", "head");
  const sp = await searchParams;
  const status = (Array.isArray(sp.status) ? sp.status[0] : sp.status) ?? null;
  const kind = (Array.isArray(sp.kind) ? sp.kind[0] : sp.kind) ?? null;
  const st = status && STATUSES.includes(status) ? status : null;
  const kd = kind && KINDS.includes(kind) ? kind : null;
  after(() => dispatchDue().catch(() => {}));

  const rows = await sql<{ id: string; kind: string; channel: string; template: string; body: string; send_at: Date; sent_at: Date | null; status: string; status_note: string | null; lead_id: string; lead_name: string; phone: string | null }[]>`
    select o.id, o.kind, o.channel, o.template, o.body, o.send_at, o.sent_at, o.status::text, o.status_note, l.id as lead_id, l.name as lead_name, l.phone
      from outbox o join leads l on l.id = o.lead_id
     where (${st}::text is null or o.status::text = ${st}) and (${kd}::text is null or o.kind = ${kd})
     order by case when o.status = 'scheduled' then 0 else 1 end, case when o.status = 'scheduled' then o.send_at end asc, o.send_at desc
     limit 200`;
  const [{ due }] = await sql<{ due: number }[]>`select count(*)::int as due from outbox where status = 'scheduled' and send_at <= now()`;
  const link = (patch: Record<string, string | null>) => {
    const p = new URLSearchParams();
    const m = { status: st, kind: kd, ...patch };
    for (const [k, v] of Object.entries(m)) if (v) p.set(k, v);
    return `/staff/messages${p.size ? `?${p}` : ""}`;
  };

  return (
    <>
      <PageHeader
        title="Messages"
        sub="Every WhatsApp/SMS the system sends, from approved opt-in templates. Sending is simulated in this demo. In production a scheduled job sends due reminders; opening this page also sends anything due."
        actions={<SendDueButton />}
      />
      {due > 0 && <p className="mb-4 text-sm text-warn">{due} message{due === 1 ? " is" : "s are"} due now.</p>}

      <div className="mb-5 flex flex-wrap gap-2 text-sm">
        <Link href={link({ status: null })} className={clsx("btn btn-sm", !st ? "btn-primary" : "btn-ghost")}>All</Link>
        {STATUSES.map((s) => <Link key={s} href={link({ status: s })} className={clsx("btn btn-sm", st === s ? "btn-primary" : "btn-ghost")}>{OUTBOX_LABEL[s]}</Link>)}
        <span className="mx-1 hidden sm:inline border-l border-line" />
        {KINDS.map((k) => <Link key={k} href={link({ kind: kd === k ? null : k })} className={clsx("btn btn-sm", kd === k ? "btn-primary" : "btn-ghost")}>{KIND_LABEL[k]}</Link>)}
      </div>

      {rows.length === 0 ? <Empty title="No messages match">Messages appear when leads arrive with consent, visits are booked, or reminders fall due.</Empty> : (
        <ul className="divide-y divide-line rounded-2xl border border-line bg-white">
          {rows.map((o) => (
            <li key={o.id} className="grid grid-cols-1 gap-3 px-5 py-4 md:grid-cols-[16rem_1fr] [&>*]:min-w-0">
              <div className="text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">{KIND_LABEL[o.kind] ?? o.kind}</span>
                  <Badge tone={OUTBOX_TONE[o.status]}>{OUTBOX_LABEL[o.status]}</Badge>
                </div>
                <p className="mt-1"><Link href={`/staff/leads/${o.lead_id}`} className="hover:text-indigo">{o.lead_name}</Link> <span className="text-xs text-stone num">{maskPhone(o.phone)}</span></p>
                <p className="text-xs text-stone [overflow-wrap:anywhere]">{o.channel === "whatsapp" ? "WhatsApp" : "SMS"} · {o.template}</p>
                <p className="text-xs text-stone">{o.status === "sent" && o.sent_at ? `Sent ${formatDateTime(o.sent_at)}` : `${o.status === "scheduled" ? "Due" : "Was due"} ${formatDateTime(o.send_at)}`}</p>
                {o.status_note && <p className="text-xs text-warn">{o.status_note}</p>}
              </div>
              <p className="whitespace-pre-wrap [overflow-wrap:anywhere] rounded-xl bg-paper-2 px-4 py-3 text-sm">{o.body}</p>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
