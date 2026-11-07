"use client";
import { useState } from "react";
import clsx from "clsx";
import { T } from "@/lib/i18n";
import type { Lang } from "@/lib/assistant/guardrails";
import type { Card, ChatAction } from "@/lib/assistant/cards";
import { LOCALE } from "@/lib/assistant/copy";

const TZ = "Asia/Kolkata";
const dayKey = (iso: string) => new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(new Date(iso));
const dayLabel = (iso: string, lang: Lang) => new Intl.DateTimeFormat(LOCALE[lang], { timeZone: TZ, weekday: "short", day: "numeric", month: "short" }).format(new Date(iso));
const timeLabel = (iso: string, lang: Lang) => new Intl.DateTimeFormat(LOCALE[lang], { timeZone: TZ, hour: "numeric", minute: "2-digit" }).format(new Date(iso));
const fullLabel = (iso: string, lang: Lang) => new Intl.DateTimeFormat(LOCALE[lang], { timeZone: TZ, weekday: "long", day: "numeric", month: "long", hour: "numeric", minute: "2-digit" }).format(new Date(iso));

type P = { card: Card; lang: Lang; busy: boolean; live: boolean; onAction: (a: ChatAction) => void };

export function CardView(p: P) {
  switch (p.card.type) {
    case "slots": return <Slots {...p} card={p.card} />;
    case "contact_form": return p.live ? <ContactForm {...p} card={p.card} /> : null;
    case "booking": return <Booking {...p} card={p.card} />;
    case "handoff": return <Handoff {...p} card={p.card} />;
    case "signin": return <SignIn {...p} />;
    case "projects": return <Projects {...p} card={p.card} />;
  }
}

function Slots({ card, lang, busy, onAction }: P & { card: Extract<Card, { type: "slots" }> }) {
  const t = T[lang];
  const days = new Map<string, typeof card.slots>();
  for (const s of card.slots) days.set(dayKey(s.startsAt), [...(days.get(dayKey(s.startsAt)) ?? []), s]);
  const last = card.slots.at(-1)?.startsAt;
  return (
    <div className="w-full max-w-md rounded-2xl border border-line bg-white p-4">
      <p className="text-sm text-stone">{card.projectName} · {t.pick}</p>
      <div className="mt-3 space-y-3">
        {[...days.entries()].map(([k, slots]) => (
          <div key={k} className="flex flex-wrap items-center gap-2">
            <span className="w-28 shrink-0 text-sm">{dayLabel(slots[0].startsAt, lang)}</span>
            {slots.map((s) => (
              <button key={s.id} type="button" disabled={busy}
                      onClick={() => onAction({ type: "book", slotId: s.id })}
                      className="rounded-full border border-line px-3.5 py-1.5 text-sm num hover:border-indigo hover:bg-indigo-soft disabled:opacity-50"
                      aria-label={`${fullLabel(s.startsAt, lang)}, ${t.placesLeft(s.left)}`}>
                {timeLabel(s.startsAt, lang)}
                {s.left === 1 && <span className="ml-1.5 text-xs text-warn">·1</span>}
              </button>
            ))}
          </div>
        ))}
      </div>
      <div className="mt-4 flex flex-wrap gap-2 border-t border-line pt-3 text-sm">
        {(["morning", "afternoon", "evening"] as const).map((part) => (
          <button key={part} type="button" disabled={busy} className="btn btn-quiet btn-sm"
                  onClick={() => onAction({ type: "more_slots", projectSlug: card.projectSlug, part })}>{t[part]}</button>
        ))}
        {last && (
          <button type="button" disabled={busy} className="btn btn-quiet btn-sm"
                  onClick={() => onAction({ type: "more_slots", projectSlug: card.projectSlug, after: last })}>{t.moreTimes}</button>
        )}
      </div>
    </div>
  );
}

function ContactForm({ card, lang, busy, onAction }: P & { card: Extract<Card, { type: "contact_form" }> }) {
  const t = T[lang];
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [consent, setConsent] = useState(false);
  const [touched, setTouched] = useState(false);
  const digits = phone.replace(/\D/g, "").replace(/^(91|0)(?=\d{10}$)/, "");
  const phoneOk = /^[6-9]\d{9}$/.test(digits);
  const nameOk = name.trim().length >= 2;
  const ok = phoneOk && nameOk && consent;

  return (
    <form
      className="w-full max-w-md space-y-3 rounded-2xl border border-line bg-white p-4"
      onSubmit={(e) => {
        e.preventDefault();
        setTouched(true);
        if (ok) onAction({ type: "contact", name: name.trim(), phone, email: email.trim(), consent });
      }}
    >
      {card.pendingSlot && <p className="text-sm text-stone">{card.pendingSlot}</p>}
      <div>
        <label className="text-sm" htmlFor="cf-name">{t.name}</label>
        <input id="cf-name" className="field mt-1" autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} aria-invalid={touched && !nameOk} maxLength={120} />
      </div>
      <div>
        <label className="text-sm" htmlFor="cf-phone">{t.mobile}</label>
        <div className="mt-1 flex items-center gap-2">
          <span className="text-stone text-sm">+91</span>
          <input id="cf-phone" className="field num" inputMode="numeric" autoComplete="tel-national" placeholder="98250 12345"
                 value={phone} onChange={(e) => setPhone(e.target.value)} aria-invalid={touched && !phoneOk} maxLength={16} />
        </div>
        {touched && !phoneOk && <p className="mt-1 text-xs text-bad">10-digit Indian mobile number, starting 6–9.</p>}
      </div>
      <div>
        <label className="text-sm" htmlFor="cf-email">{t.email}</label>
        <input id="cf-email" type="email" className="field mt-1" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} maxLength={160} />
      </div>
      <label className="flex items-start gap-2.5 text-sm leading-snug">
        <input type="checkbox" className="mt-0.5 h-4 w-4 accent-[var(--indigo)]" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
        <span className={clsx(touched && !consent && "text-bad")}>{t.consent}</span>
      </label>
      <button type="submit" className="btn btn-primary w-full" disabled={busy}>{t.saveDetails}</button>
    </form>
  );
}

function ics(card: Extract<Card, { type: "booking" }>) {
  const stamp = (d: Date) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  const start = new Date(card.startsAt);
  const end = new Date(card.endsAt);
  const body = [
    "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Abode Assist//Site visit//EN", "BEGIN:VEVENT",
    `UID:${card.visitId}@abode-assist`, `DTSTAMP:${stamp(new Date())}`, `DTSTART:${stamp(start)}`, `DTEND:${stamp(end)}`,
    `SUMMARY:Site visit — ${card.projectName}`, `LOCATION:${card.address.replace(/,/g, "\\,")}`,
    `DESCRIPTION:${card.mapUrl} — RERA Reg. No. ${card.reraNo}`, "END:VEVENT", "END:VCALENDAR",
  ].join("\r\n");
  return `data:text/calendar;charset=utf-8,${encodeURIComponent(body)}`;
}

function Booking({ card, lang }: P & { card: Extract<Card, { type: "booking" }> }) {
  const t = T[lang];
  return (
    <div className="w-full max-w-md rounded-2xl border border-indigo/40 bg-white p-5">
      <p className="text-sm text-indigo">{t.visitBooked}</p>
      <p className="display mt-1 text-2xl leading-snug">{fullLabel(card.startsAt, lang)}</p>
      {card.rescheduledFrom && <p className="mt-1 text-sm text-stone line-through">{fullLabel(card.rescheduledFrom, lang)}</p>}
      <p className="mt-3 text-sm">{card.projectName}</p>
      <p className="text-sm text-stone">{card.address}</p>
      <div className="mt-4 flex flex-wrap gap-2">
        <a className="btn btn-ghost btn-sm" href={card.mapUrl} target="_blank" rel="noopener noreferrer">{t.openMap}</a>
        <a className="btn btn-ghost btn-sm" href={ics(card)} download="site-visit.ics">{t.addToCalendar}</a>
      </div>
      <p className="mt-4 text-xs text-stone">{t.rera} {card.reraNo}</p>
    </div>
  );
}

function Handoff({ card, lang }: P & { card: Extract<Card, { type: "handoff" }> }) {
  const t = T[lang];
  return (
    <div className="flex items-center gap-3 rounded-full border border-line bg-white py-1.5 pl-1.5 pr-4 text-sm">
      <span className="grid h-7 w-7 place-items-center rounded-full bg-indigo text-xs text-white" aria-hidden>
        {(card.executiveName ?? "S").split(" ").map((w) => w[0]).join("").slice(0, 2)}
      </span>
      {card.executiveName ? t.handedTo(card.executiveName) : t.handedToTeam}
    </div>
  );
}

function Projects({ card, lang, busy, onAction }: P & { card: Extract<Card, { type: "projects" }> }) {
  const t = T[lang];
  return (
    <div className="flex w-full max-w-md flex-col gap-2 sm:flex-row">
      {card.projects.map((p) => (
        <button key={p.slug} type="button" disabled={busy} onClick={() => onAction({ type: "pick_project", projectSlug: p.slug })}
                className="flex-1 rounded-2xl border border-line bg-white px-4 py-3 text-left hover:border-indigo disabled:opacity-50">
          <span className="display block text-lg">{p.name}</span>
          <span className="block text-sm text-stone">{p.locality} · {t.bookVisit}</span>
        </button>
      ))}
    </div>
  );
}

function SignIn({ lang }: P) {
  const label = { en: "Confirm with a one-time code", hi: "वन-टाइम कोड से पुष्टि करें", gu: "વન-ટાઇમ કોડથી ખાતરી કરો" }[lang];
  return <a href="/login/buyer" className="btn btn-primary btn-sm">{label}</a>;
}
