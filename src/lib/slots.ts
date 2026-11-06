/** Pure slot logic, shared by the assistant, the booking page and the tests. */

export type SlotRow = {
  id: string;
  project_id: string;
  starts_at: Date;
  ends_at: Date;
  capacity: number;
  active: boolean;
  held: number; // visits currently in status 'booked'
};

export type FreeSlot = SlotRow & { left: number };

/** Buyers cannot book a slot that starts in less than this; the site team needs notice. */
export const MIN_LEAD_MINUTES = 60;

export function freeSlots(rows: SlotRow[], now: Date, minLeadMinutes = MIN_LEAD_MINUTES): FreeSlot[] {
  const cutoff = now.getTime() + minLeadMinutes * 60_000;
  return rows
    .filter((r) => r.active && new Date(r.starts_at).getTime() >= cutoff && r.held < r.capacity)
    .map((r) => ({ ...r, left: r.capacity - r.held }))
    .sort((a, b) => new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime());
}

export type PartOfDay = "morning" | "afternoon" | "evening" | "any";

/** IST hour → part of day. Morning < 12:00, afternoon < 16:00, evening after. */
export function partOfDay(d: Date): Exclude<PartOfDay, "any"> {
  const h = Number(new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Kolkata", hour: "2-digit", hour12: false }).format(d));
  if (h < 12) return "morning";
  if (h < 16) return "afternoon";
  return "evening";
}

/** Spread suggestions across days so the buyer sees choice, not five slots on the same morning. */
export function pickSuggestions(slots: FreeSlot[], part: PartOfDay = "any", max = 6): FreeSlot[] {
  const filtered = part === "any" ? slots : slots.filter((s) => partOfDay(new Date(s.starts_at)) === part);
  const perDay = new Map<string, number>();
  const out: FreeSlot[] = [];
  for (const s of filtered) {
    const key = new Date(new Date(s.starts_at).getTime() + 330 * 60_000).toISOString().slice(0, 10);
    const n = perDay.get(key) ?? 0;
    if (n >= 2) continue;
    perDay.set(key, n + 1);
    out.push(s);
    if (out.length >= max) break;
  }
  return out;
}

export const BOOKING_ERRORS: Record<string, string> = {
  SLOT_FULL: "That slot was just taken by someone else.",
  SLOT_INACTIVE: "That slot is no longer offered.",
  SLOT_IN_PAST: "That slot has already started.",
  SLOT_NOT_FOUND: "That slot does not exist.",
  TOO_SOON: `Visits need at least ${MIN_LEAD_MINUTES} minutes' notice.`,
  NO_CONSENT: "We need your consent to contact you before booking.",
  OPTED_OUT: "This number has opted out of messages.",
  WRONG_PROJECT: "That slot belongs to a different project.",
};
