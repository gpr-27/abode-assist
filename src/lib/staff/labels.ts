/** Labels and tones shared by staff screens. Pure — safe on server and client. */
import { formatDuration } from "../time";

export type Tone = "neutral" | "indigo" | "ok" | "warn" | "bad";

export const STATUS_LABEL: Record<string, string> = {
  new: "New", engaged: "Engaged", handed_off: "With executive", visit_booked: "Visit booked", visited: "Visited", lost: "Lost",
};
export const STATUS_TONE: Record<string, Tone> = {
  new: "warn", engaged: "neutral", handed_off: "indigo", visit_booked: "indigo", visited: "ok", lost: "neutral",
};
export const STATUSES = Object.keys(STATUS_LABEL);

export const VISIT_LABEL: Record<string, string> = { booked: "Booked", cancelled: "Cancelled", visited: "Visited", no_show: "No show" };
export const VISIT_TONE: Record<string, Tone> = { booked: "indigo", cancelled: "neutral", visited: "ok", no_show: "bad" };

export const OUTBOX_LABEL: Record<string, string> = { scheduled: "Scheduled", sent: "Sent", cancelled: "Cancelled", skipped: "Skipped" };
export const OUTBOX_TONE: Record<string, Tone> = { scheduled: "indigo", sent: "ok", cancelled: "neutral", skipped: "warn" };
export const KIND_LABEL: Record<string, string> = {
  ack: "Acknowledgement", confirmation: "Visit confirmation", reminder_1d: "Reminder · 1 day", reminder_2h: "Reminder · 2 hours", handoff: "Executive intro",
};

export const FLAG_LABEL: Record<string, string> = {
  discount_request: "Asked for a discount",
  missing_fact: "Question not in fact sheet",
  price_not_in_fact_sheet: "Reply mentioned a price not in the fact sheet",
  discount_or_final_price: "Reply mentioned discount/final price",
  unregistered_claim: "Reply made a claim beyond registered details",
  assistant_unavailable: "AI was unavailable",
};

export type ResponseState = { label: string; tone: Tone };

const MIN5 = 5 * 60_000;
const H48 = 48 * 3600_000;

/** Response timer for a lead row. */
export function responseState(createdAt: Date | string, firstResponseAt: Date | string | null, hasConsent: boolean, now = new Date()): ResponseState {
  const created = new Date(createdAt).getTime();
  if (firstResponseAt) {
    const ms = new Date(firstResponseAt).getTime() - created;
    return { label: `Answered in ${formatDuration(ms)}`, tone: ms <= MIN5 ? "ok" : ms <= H48 ? "warn" : "bad" };
  }
  const waited = now.getTime() - created;
  if (!hasConsent) return { label: `Needs a call (no WhatsApp consent), waiting ${formatDuration(waited)}`, tone: waited > H48 ? "bad" : "warn" };
  return { label: `Waiting ${formatDuration(waited)}`, tone: waited > H48 ? "bad" : "warn" };
}

/** Current time for server-rendered staff pages (kept out of component bodies for the purity lint rule). */
export function nowMs(): number {
  return Date.now();
}
