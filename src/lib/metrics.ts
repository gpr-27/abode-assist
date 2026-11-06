/** Dashboard maths, kept pure so the numbers can be tested. */

export function median(xs: number[]): number | null {
  const v = xs.filter((x) => Number.isFinite(x)).sort((a, b) => a - b);
  if (v.length === 0) return null;
  const mid = Math.floor(v.length / 2);
  return v.length % 2 ? v[mid] : (v[mid - 1] + v[mid]) / 2;
}

export type LeadFact = {
  source: string;
  createdAt: Date;
  firstResponseAt: Date | null;
  visitStatus: "booked" | "visited" | "no_show" | null; // best outcome of the lead's visits
};

export type SourceRow = {
  source: string;
  leads: number;
  medianResponseMs: number | null;
  notReached48hPct: number | null;
  booked: number;
  visited: number;
  noShow: number;
  showUpPct: number | null;
  leadToVisitPct: number | null;
  spend: number;
  costPerLead: number | null;
  costPerVisit: number | null;
};

const H48 = 48 * 3600_000;

export function sourceMetrics(facts: LeadFact[], spendBySource: Record<string, number>, now: Date): SourceRow[] {
  const sources = new Set([...facts.map((f) => f.source), ...Object.keys(spendBySource)]);
  return [...sources].map((source) => {
    const fs = facts.filter((f) => f.source === source);
    const responses = fs.filter((f) => f.firstResponseAt).map((f) => f.firstResponseAt!.getTime() - f.createdAt.getTime());
    // Only leads older than 48h can be judged as "not reached within 48h".
    const judged = fs.filter((f) => now.getTime() - f.createdAt.getTime() >= H48);
    const notReached = judged.filter((f) => !f.firstResponseAt || f.firstResponseAt.getTime() - f.createdAt.getTime() > H48).length;
    const booked = fs.filter((f) => f.visitStatus).length;
    const visited = fs.filter((f) => f.visitStatus === "visited").length;
    const noShow = fs.filter((f) => f.visitStatus === "no_show").length;
    const spend = spendBySource[source] ?? 0;
    return {
      source,
      leads: fs.length,
      medianResponseMs: median(responses),
      notReached48hPct: judged.length ? (100 * notReached) / judged.length : null,
      booked,
      visited,
      noShow,
      showUpPct: visited + noShow ? (100 * visited) / (visited + noShow) : null,
      leadToVisitPct: fs.length ? (100 * visited) / fs.length : null,
      spend,
      costPerLead: fs.length && spend ? spend / fs.length : null,
      costPerVisit: visited && spend ? spend / visited : null,
    };
  }).sort((a, b) => b.leads - a.leads);
}
