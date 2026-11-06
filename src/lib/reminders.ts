/** Reminder schedule and message templates (mocked WhatsApp/SMS). Pure — unit tested. */
import { formatDateTime } from "./time";

export type ReminderPlan = {
  kind: "reminder_1d" | "reminder_2h";
  send_at: Date;
  status: "scheduled" | "skipped";
  note?: string;
};

export const REMINDER_OFFSETS = {
  reminder_1d: 24 * 60 * 60_000,
  reminder_2h: 2 * 60 * 60_000,
} as const;

/**
 * Two reminders: 1 day and 2 hours before the visit.
 * A reminder whose time has already passed when the visit is booked is skipped
 * (booking 5 hours ahead gets only the 2-hour one). Opted-out leads get none.
 */
export function planReminders(visitStart: Date, bookedAt: Date, optedOut: boolean): ReminderPlan[] {
  return (Object.keys(REMINDER_OFFSETS) as Array<keyof typeof REMINDER_OFFSETS>).map((kind) => {
    const send_at = new Date(visitStart.getTime() - REMINDER_OFFSETS[kind]);
    if (optedOut) return { kind, send_at, status: "skipped", note: "Buyer opted out" };
    if (send_at.getTime() <= bookedAt.getTime()) return { kind, send_at, status: "skipped", note: "Booked inside the reminder window" };
    return { kind, send_at, status: "scheduled" };
  });
}

type Ctx = {
  buyerName: string;
  projectName: string;
  reraNo: string;
  address: string;
  mapUrl: string;
  startsAt: Date;
  executiveName?: string | null;
  optoutUrl: string;
};

const footer = (c: Ctx) =>
  `${c.projectName} · RERA Reg. No. ${c.reraNo}\nReply STOP or visit ${c.optoutUrl} to stop messages.`;

const firstName = (n: string) => n.trim().split(/\s+/)[0];

/** Template names mirror the opt-in WhatsApp templates the business would register. */
export const TEMPLATES = {
  ack: "lead_ack_v1",
  confirmation: "visit_confirm_v1",
  reminder_1d: "visit_reminder_1d_v1",
  reminder_2h: "visit_reminder_2h_v1",
  handoff: "handoff_intro_v1",
} as const;

export function renderMessage(kind: keyof typeof TEMPLATES, c: Ctx): string {
  const when = formatDateTime(c.startsAt);
  switch (kind) {
    case "ack":
      return `Hi ${firstName(c.buyerName)}, thank you for your interest in ${c.projectName}. You can ask us anything or book a site visit here, any time.\n${footer(c)}`;
    case "confirmation":
      return `Hi ${firstName(c.buyerName)}, your site visit to ${c.projectName} is confirmed for ${when}.\nAddress: ${c.address}\nLocation: ${c.mapUrl}\n${footer(c)}`;
    case "reminder_1d":
      return `Reminder: your visit to ${c.projectName} is tomorrow, ${when}.${c.executiveName ? ` ${c.executiveName} will meet you.` : ""}\nLocation: ${c.mapUrl}\n${footer(c)}`;
    case "reminder_2h":
      return `See you in 2 hours at ${c.projectName} (${when}).\nLocation: ${c.mapUrl}\n${footer(c)}`;
    case "handoff":
      return `Hi ${firstName(c.buyerName)}, I'm ${c.executiveName ?? "from the sales team"} at ${c.projectName}. I've read your chat and will call you shortly.\n${footer(c)}`;
  }
}
