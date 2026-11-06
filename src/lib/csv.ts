/** Minimal RFC 4180 CSV parser (quoted fields, escaped quotes, CRLF). */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  const s = text.replace(/^﻿/, "");
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (quoted) {
      if (c === '"') {
        if (s[i + 1] === '"') { field += '"'; i++; } else quoted = false;
      } else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") { row.push(field); field = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && s[i + 1] === "\n") i++;
      row.push(field); field = "";
      if (row.some((f) => f.trim() !== "")) rows.push(row);
      row = [];
    } else field += c;
  }
  row.push(field);
  if (row.some((f) => f.trim() !== "")) rows.push(row);
  return rows;
}

export type PortalRow = { name: string; phone: string; email: string; project: string; wants: string; source: string; consent: string; note: string };

const ALIASES: Record<keyof PortalRow, string[]> = {
  name: ["name", "full name", "customer name", "lead name"],
  phone: ["phone", "mobile", "phone number", "mobile number", "contact"],
  email: ["email", "email id", "e-mail"],
  project: ["project", "project name", "property"],
  wants: ["wants", "configuration", "bhk", "requirement", "unit type"],
  source: ["source", "lead source", "channel"],
  consent: ["consent", "whatsapp consent", "opt in", "opt-in"],
  note: ["note", "notes", "message", "comments"],
};

/** Map a CSV with loose portal headers onto our fields. Returns header problems instead of throwing. */
export function mapPortalCsv(text: string): { rows: PortalRow[]; errors: string[] } {
  const all = parseCsv(text);
  if (all.length === 0) return { rows: [], errors: ["The file is empty."] };
  const header = all[0].map((h) => h.trim().toLowerCase());
  const idx = {} as Record<keyof PortalRow, number>;
  for (const key of Object.keys(ALIASES) as Array<keyof PortalRow>) {
    idx[key] = header.findIndex((h) => ALIASES[key].includes(h));
  }
  const errors: string[] = [];
  if (idx.name < 0) errors.push("Missing a 'name' column.");
  if (idx.phone < 0 && idx.email < 0) errors.push("Need a 'phone' or 'email' column.");
  if (errors.length) return { rows: [], errors };
  const rows = all.slice(1).map((r) => {
    const get = (k: keyof PortalRow) => (idx[k] >= 0 ? (r[idx[k]] ?? "").trim() : "");
    return { name: get("name"), phone: get("phone"), email: get("email"), project: get("project"), wants: get("wants"), source: get("source"), consent: get("consent"), note: get("note") };
  });
  return { rows, errors };
}

export function truthy(v: string): boolean {
  return /^(y|yes|true|1|opted in|opt-in)$/i.test(v.trim());
}
