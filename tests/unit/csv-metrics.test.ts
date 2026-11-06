import { describe, expect, it } from "vitest";
import { mapPortalCsv, parseCsv, truthy } from "@/lib/csv";
import { median, sourceMetrics, type LeadFact } from "@/lib/metrics";

describe("parseCsv", () => {
  it("handles quoted commas, escaped quotes, CRLF, BOM and blank lines", () => {
    const text = '﻿name,note\r\n"Shah, Nidhi","said ""call after 6"""\r\n\r\nKavita,plain\n';
    expect(parseCsv(text)).toEqual([["name", "note"], ["Shah, Nidhi", 'said "call after 6"'], ["Kavita", "plain"]]);
  });
  it("handles a final line without a newline and quoted newlines", () => {
    expect(parseCsv('a,b\n"x\ny",z')).toEqual([["a", "b"], ["x\ny", "z"]]);
  });
  it("returns nothing for empty input", () => expect(parseCsv("")).toEqual([]));
});

describe("mapPortalCsv", () => {
  it("maps loose portal headers onto our fields", () => {
    const { rows, errors } = mapPortalCsv("Full Name,Mobile Number,Project Name,BHK,Lead Source,Opt-in\nHardik Patel,98765 58210,Project 1,3 BHK,99acres,Yes\n");
    expect(errors).toEqual([]);
    expect(rows[0]).toMatchObject({ name: "Hardik Patel", phone: "98765 58210", project: "Project 1", wants: "3 BHK", source: "99acres", consent: "Yes" });
    expect(rows[0].email).toBe("");
  });
  it("reports missing columns instead of throwing", () => {
    expect(mapPortalCsv("mobile,project\n9876558210,Project 1").errors).toContain("Missing a 'name' column.");
    expect(mapPortalCsv("name,project\nA,Project 1").errors).toContain("Need a 'phone' or 'email' column.");
    expect(mapPortalCsv("").errors).toEqual(["The file is empty."]);
  });
  it("truthy understands opt-in values", () => {
    for (const v of ["yes", "Y", "TRUE", "1", "opt-in", " Yes "]) expect(truthy(v)).toBe(true);
    for (const v of ["no", "", "0", "maybe"]) expect(truthy(v)).toBe(false);
  });
});

describe("median", () => {
  it("odd, even, empty, ignores non-finite", () => {
    expect(median([5, 1, 3])).toBe(3);
    expect(median([4, 1, 3, 2])).toBe(2.5);
    expect(median([])).toBeNull();
    expect(median([NaN, Infinity, 2])).toBe(2);
  });
});

describe("sourceMetrics", () => {
  const now = new Date("2026-11-07T12:00:00Z");
  const ago = (h: number) => new Date(now.getTime() - h * 3600_000);
  const plus = (d: Date, min: number) => new Date(d.getTime() + min * 60_000);
  const facts: LeadFact[] = [
    { source: "portal", createdAt: ago(100), firstResponseAt: plus(ago(100), 1), visitStatus: "visited" },
    { source: "portal", createdAt: ago(80), firstResponseAt: plus(ago(80), 3), visitStatus: "no_show" },
    { source: "portal", createdAt: ago(72), firstResponseAt: plus(ago(72), 60 * 50), visitStatus: null }, // reached after 50h
    { source: "portal", createdAt: ago(60), firstResponseAt: null, visitStatus: null }, // never reached
    { source: "portal", createdAt: ago(10), firstResponseAt: null, visitStatus: "booked" }, // too young to judge
    { source: "chat", createdAt: ago(5), firstResponseAt: ago(5), visitStatus: null },
  ];
  const rows = sourceMetrics(facts, { portal: 50000, social: 10000 }, now);
  const portal = rows.find((r) => r.source === "portal")!;

  it("counts leads, visits and show-up rate", () => {
    expect(portal.leads).toBe(5);
    expect(portal.booked).toBe(3);
    expect(portal.visited).toBe(1);
    expect(portal.noShow).toBe(1);
    expect(portal.showUpPct).toBe(50);
    expect(portal.leadToVisitPct).toBe(20);
  });
  it("median first response uses responded leads only", () => {
    expect(portal.medianResponseMs).toBe(3 * 60_000);
  });
  it("judges 'not reached in 48h' only on leads older than 48h", () => {
    expect(portal.notReached48hPct).toBe(50); // 2 of the 4 judged leads
  });
  it("cost per lead and per visit", () => {
    expect(portal.costPerLead).toBe(10000);
    expect(portal.costPerVisit).toBe(50000);
  });
  it("is null-safe for a source with spend but no leads, and for a source with no spend", () => {
    const social = rows.find((r) => r.source === "social")!;
    expect(social).toMatchObject({ leads: 0, medianResponseMs: null, notReached48hPct: null, showUpPct: null, costPerLead: null, costPerVisit: null, spend: 10000 });
    const chat = rows.find((r) => r.source === "chat")!;
    expect(chat).toMatchObject({ spend: 0, costPerLead: null, notReached48hPct: null, medianResponseMs: 0 });
  });
  it("sorts by lead volume", () => expect(rows[0].source).toBe("portal"));
});
