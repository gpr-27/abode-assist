/** Duplicate detection rules. Exact matches merge automatically; fuzzy ones need a person. */

export function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .replace(/\b(mr|mrs|ms|dr|shri|smt)\.?\s+/g, "")
    .replace(/[^\p{L}\s]/gu, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Sørensen–Dice similarity on character bigrams, 0..1. */
export function nameSimilarity(a: string, b: string): number {
  const x = normalizeName(a).replace(/ /g, "");
  const y = normalizeName(b).replace(/ /g, "");
  if (!x || !y) return 0;
  if (x === y) return 1;
  const grams = (s: string) => {
    const m = new Map<string, number>();
    for (let i = 0; i < s.length - 1; i++) m.set(s.slice(i, i + 2), (m.get(s.slice(i, i + 2)) ?? 0) + 1);
    return m;
  };
  const gx = grams(x);
  const gy = grams(y);
  let overlap = 0;
  for (const [g, n] of gx) overlap += Math.min(n, gy.get(g) ?? 0);
  return (2 * overlap) / (x.length - 1 + y.length - 1);
}

export type ExistingLead = { id: string; name: string; phone: string | null; email: string | null };
export type IncomingLead = { name: string; phone: string | null; email: string | null };

export type DedupeVerdict =
  | { kind: "same"; leadId: string; matchedOn: "phone" | "email" }
  | { kind: "possible"; leadId: string; score: number }
  | { kind: "new" };

/**
 * Same phone or same email → the same person, add a source touch to the existing lead.
 * Very similar name but different contact → create the lead but flag it for a person to merge.
 */
export const FUZZY_THRESHOLD = 0.85;

export function classifyDuplicate(incoming: IncomingLead, existing: ExistingLead[]): DedupeVerdict {
  for (const e of existing) {
    if (incoming.phone && e.phone === incoming.phone) return { kind: "same", leadId: e.id, matchedOn: "phone" };
  }
  for (const e of existing) {
    if (incoming.email && e.email === incoming.email) return { kind: "same", leadId: e.id, matchedOn: "email" };
  }
  let best: { id: string; score: number } | null = null;
  for (const e of existing) {
    const score = nameSimilarity(incoming.name, e.name);
    if (score >= FUZZY_THRESHOLD && (!best || score > best.score)) best = { id: e.id, score };
  }
  return best ? { kind: "possible", leadId: best.id, score: best.score } : { kind: "new" };
}
