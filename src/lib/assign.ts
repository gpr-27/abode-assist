/** Choose which executive gets a handed-off lead. Pure — unit tested. */

export type Candidate = { id: string; name: string; openLeads: number; lastAssignedAt: Date | null };

/**
 * Least open leads wins; on a tie, whoever was assigned longest ago (never-assigned first);
 * then name for a stable order. Returns null when nobody sells this project.
 */
export function chooseExecutive(cands: Candidate[]): Candidate | null {
  if (cands.length === 0) return null;
  return [...cands].sort((a, b) => {
    if (a.openLeads !== b.openLeads) return a.openLeads - b.openLeads;
    const ta = a.lastAssignedAt ? new Date(a.lastAssignedAt).getTime() : -Infinity;
    const tb = b.lastAssignedAt ? new Date(b.lastAssignedAt).getTime() : -Infinity;
    if (ta !== tb) return ta - tb;
    return a.name.localeCompare(b.name);
  })[0];
}
