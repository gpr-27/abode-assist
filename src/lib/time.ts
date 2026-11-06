export const TZ = "Asia/Kolkata";
const IST_OFFSET_MIN = 330;

export function formatDateTime(d: Date | string, locale = "en-IN") {
  return new Intl.DateTimeFormat(locale, {
    timeZone: TZ, weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit",
  }).format(new Date(d));
}

export function formatDay(d: Date | string, locale = "en-IN") {
  return new Intl.DateTimeFormat(locale, { timeZone: TZ, weekday: "long", day: "numeric", month: "long" }).format(new Date(d));
}

export function formatShortDay(d: Date | string, locale = "en-IN") {
  return new Intl.DateTimeFormat(locale, { timeZone: TZ, weekday: "short", day: "numeric", month: "short" }).format(new Date(d));
}

export function formatTime(d: Date | string, locale = "en-IN") {
  return new Intl.DateTimeFormat(locale, { timeZone: TZ, hour: "numeric", minute: "2-digit" }).format(new Date(d));
}

/** YYYY-MM-DD of the given instant in IST. */
export function istDateKey(d: Date | string): string {
  const t = new Date(new Date(d).getTime() + IST_OFFSET_MIN * 60_000);
  return t.toISOString().slice(0, 10);
}

/** The UTC instant for a wall-clock time in IST, e.g. istInstant("2026-11-08", 11, 0). */
export function istInstant(dateKey: string, hour: number, minute = 0): Date {
  const [y, m, d] = dateKey.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d, hour, minute) - IST_OFFSET_MIN * 60_000);
}

export function addDaysKey(dateKey: string, days: number): string {
  const [y, m, d] = dateKey.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

/** Human duration: 45s, 3m, 2h 10m, 3d 4h */
export function formatDuration(ms: number | null | undefined): string {
  if (ms == null || !Number.isFinite(ms)) return "—";
  const s = Math.max(0, Math.round(ms / 1000));
  if (s < 60) return `${s}s`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ${m % 60 ? `${m % 60}m` : ""}`.trim();
  const d = Math.floor(h / 24);
  return `${d}d ${h % 24 ? `${h % 24}h` : ""}`.trim();
}

export function formatINR(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "—";
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(n);
}
