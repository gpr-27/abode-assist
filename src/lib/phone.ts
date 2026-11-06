/**
 * Normalise an Indian mobile number to E.164 (+91XXXXXXXXXX).
 * Accepts "98250 12345", "+91-98250-12345", "09825012345", "919825012345".
 * Returns null for anything that is not a valid Indian mobile (starts 6–9, 10 digits).
 */
export function normalizeIndianMobile(input: string | null | undefined): string | null {
  if (!input) return null;
  let digits = input.replace(/\D/g, "");
  if (digits.length === 12 && digits.startsWith("91")) digits = digits.slice(2);
  else if (digits.length === 11 && digits.startsWith("0")) digits = digits.slice(1);
  if (digits.length !== 10 || !/^[6-9]/.test(digits)) return null;
  return `+91${digits}`;
}

/** "+919825012345" → "+91 98250 12345" */
export function formatPhone(e164: string | null | undefined): string {
  if (!e164) return "—";
  const d = e164.replace(/^\+91/, "");
  return d.length === 10 ? `+91 ${d.slice(0, 5)} ${d.slice(5)}` : e164;
}

/** Show only the last 4 digits, e.g. in lists visible to the whole sales floor. */
export function maskPhone(e164: string | null | undefined): string {
  if (!e164) return "—";
  const d = e164.replace(/^\+91/, "");
  return `+91 ••••• •${d.slice(-4)}`;
}

export function normalizeEmail(input: string | null | undefined): string | null {
  if (!input) return null;
  const e = input.trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e) ? e : null;
}
