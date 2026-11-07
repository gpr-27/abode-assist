import type { Metadata } from "next";
import Link from "next/link";
import { requireRole } from "@/lib/auth/session";
import { sql } from "@/lib/db";
import { formatDateTime } from "@/lib/time";
import { formatPhone } from "@/lib/phone";
import { Badge, Empty } from "@/components/ui";
import { MessageBody } from "@/components/message-body";
import { cancelMyVisit, setMessages, signOut } from "./actions";
import { BRAND } from "@/lib/brand";

export const metadata: Metadata = { title: "My site visits", robots: { index: false } };

type VisitRow = { id: string; status: string; starts_at: Date; upcoming: boolean; project: string; slug: string; address: string; map_url: string; rera_no: string; executive: string | null };

const STATUS: Record<string, { label: string; tone: "indigo" | "ok" | "neutral" | "bad" }> = {
  booked: { label: "Booked", tone: "indigo" }, visited: { label: "Visited", tone: "ok" }, cancelled: { label: "Cancelled", tone: "neutral" }, no_show: { label: "Missed", tone: "bad" },
};

export default async function MyVisits() {
  const s = await requireRole("buyer");
  const [user] = await sql<{ phone: string }[]>`select phone from users where id = ${s.userId}`;
  const visits = await sql<VisitRow[]>`
    select v.id, v.status, s.starts_at, (v.status = 'booked' and s.starts_at > now()) as upcoming, p.name as project, p.slug, p.address, p.map_url, p.rera_no, u.name as executive
      from visits v join leads l on l.id = v.lead_id join visit_slots s on s.id = v.slot_id join projects p on p.id = s.project_id
      left join users u on u.id = l.assigned_to
     where l.buyer_user_id = ${s.userId}
     order by s.starts_at desc`;
  const [prefs] = await sql<{ opted_out_at: Date | null; consent_at: Date | null }[]>`
    select max(opted_out_at) as opted_out_at, max(consent_at) as consent_at from leads where buyer_user_id = ${s.userId}`;
  const messages = await sql<{ id: string; kind: string; body: string; status: string; send_at: Date }[]>`
    select o.id, o.kind, o.body, o.status, o.send_at from outbox o join leads l on l.id = o.lead_id
     where l.buyer_user_id = ${s.userId} and o.status in ('sent', 'scheduled') order by o.send_at desc limit 10`;
  const upcoming = visits.filter((v) => v.upcoming);
  const past = visits.filter((v) => !upcoming.includes(v));
  const optedOut = !!prefs?.opted_out_at;

  return (
    <main className="mx-auto w-full max-w-3xl px-4 sm:px-8 py-8">
      <header className="flex items-center justify-between">
        <Link href="/" className="display text-xl">{BRAND}</Link>
        <form action={signOut}><button className="btn btn-quiet btn-sm">Sign out</button></form>
      </header>

      <h1 className="display mt-10 text-4xl">Hello, {s.name.split(" ")[0]}</h1>
      <p className="mt-2 text-stone">Signed in as {formatPhone(user?.phone)}</p>

      <section className="mt-10">
        <h2 className="display text-2xl">Upcoming</h2>
        {upcoming.length === 0 ? (
          <div className="mt-4"><Empty title="No upcoming visit" action={<Link href="/chat?intent=visit" className="btn btn-primary btn-sm">Book a site visit</Link>}>Pick an open time in the chat and it will show up here.</Empty></div>
        ) : upcoming.map((v) => (
          <article key={v.id} className="mt-4 rounded-3xl border border-indigo/40 bg-white p-6">
            <p className="text-sm text-indigo">{v.project}</p>
            <p className="display mt-1 text-3xl">{formatDateTime(v.starts_at)}</p>
            <p className="mt-2 text-sm text-stone">{v.address}</p>
            {v.executive && <p className="mt-1 text-sm">{v.executive} will meet you.</p>}
            <div className="mt-5 flex flex-wrap gap-2">
              <a href={v.map_url} target="_blank" rel="noopener noreferrer" className="btn btn-ghost btn-sm">Open map</a>
              <Link href={`/chat?project=${v.slug}&intent=visit`} className="btn btn-ghost btn-sm">Change time</Link>
              <form action={cancelMyVisit}>
                <input type="hidden" name="visitId" value={v.id} />
                <button className="btn btn-quiet btn-sm text-bad">Cancel visit</button>
              </form>
            </div>
            <p className="mt-4 text-xs text-stone">RERA Reg. No. {v.rera_no}</p>
          </article>
        ))}
      </section>

      {past.length > 0 && (
        <section className="mt-12">
          <h2 className="display text-2xl">Earlier</h2>
          <ul className="mt-4 divide-y divide-line border-y border-line">
            {past.map((v) => (
              <li key={v.id} className="flex items-center justify-between gap-3 py-3 text-sm">
                <span>{v.project} · {formatDateTime(v.starts_at)}</span>
                <Badge tone={STATUS[v.status]?.tone}>{v.status === "booked" ? "Awaiting check-in" : STATUS[v.status]?.label}</Badge>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="mt-12">
        <h2 className="display text-2xl">Messages we sent you</h2>
        {messages.length === 0 ? <p className="mt-3 text-sm text-stone">Nothing yet.</p> : (
          <ul className="mt-4 space-y-3">
            {messages.map((m) => (
              <li key={m.id} className="rounded-2xl bg-white border border-line p-4 text-sm">
                <p className="text-xs text-stone">{m.status === "scheduled" ? `Scheduled for ${formatDateTime(m.send_at)}` : formatDateTime(m.send_at)} · WhatsApp</p>
                <MessageBody body={m.body} className="mt-3" />
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="mt-12 rounded-3xl border border-line bg-white p-6">
        <h2 className="display text-2xl">Contact preferences</h2>
        <p className="mt-2 text-sm text-stone">
          {optedOut ? "You've stopped messages from us. We won't contact you about this enquiry." : "We send WhatsApp messages only about your enquiry and visits: a confirmation and two reminders."}
        </p>
        <form action={setMessages} className="mt-4">
          <input type="hidden" name="on" value={optedOut ? "1" : "0"} />
          <button className={optedOut ? "btn btn-primary btn-sm" : "btn btn-ghost btn-sm"}>{optedOut ? "Allow messages again" : "Stop all messages"}</button>
        </form>
      </section>
    </main>
  );
}
