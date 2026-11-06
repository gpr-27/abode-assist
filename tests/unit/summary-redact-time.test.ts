import { describe, expect, it } from "vitest";
import { parseSummaryJson, ruleSummary } from "@/lib/assistant/summary";
import { redact } from "@/lib/assistant/providers";
import { addDaysKey, formatDuration, formatINR, istDateKey, istInstant } from "@/lib/time";

const good = { summary: "Buyer wants a 2 BHK in Project 2.", wants: "2 BHK", budget: "₹70 lakh", timeline: null, intent: "warm", open_questions: [] };

describe("parseSummaryJson", () => {
  it("reads plain, fenced and prose-wrapped JSON", () => {
    expect(parseSummaryJson(JSON.stringify(good))).toEqual(good);
    expect(parseSummaryJson("```json\n" + JSON.stringify(good) + "\n```")).toEqual(good);
    expect(parseSummaryJson("Here you go: " + JSON.stringify(good) + " Thanks!")).toEqual(good);
  });
  it("rejects invalid JSON or the wrong shape", () => {
    expect(parseSummaryJson("no json here")).toBeNull();
    expect(parseSummaryJson("{not: json}")).toBeNull();
    expect(parseSummaryJson(JSON.stringify({ ...good, intent: "very hot" }))).toBeNull();
    expect(parseSummaryJson(JSON.stringify({ summary: "x" }))).toBeNull();
  });
});

describe("ruleSummary", () => {
  it("uses only known fields and the buyer's own words", () => {
    const r = ruleSummary({ wants: "3 BHK", budget: null, timeline: null }, ["Hi", "Is the sample flat ready?", "Ok thanks"], false);
    expect(r.summary).toContain("3 BHK");
    expect(r.summary).toContain("Ok thanks");
    expect(r.budget).toBeNull();
    expect(r.open_questions).toEqual(["Is the sample flat ready?"]);
  });
  it("intent: visit → hot, budget → warm, otherwise cold", () => {
    expect(ruleSummary({ wants: null, budget: null, timeline: null }, [], true).intent).toBe("hot");
    expect(ruleSummary({ wants: null, budget: "80L", timeline: null }, [], false).intent).toBe("warm");
    expect(ruleSummary({ wants: null, budget: null, timeline: null }, [], false).intent).toBe("cold");
  });
  it("keeps at most the last 3 questions", () => {
    expect(ruleSummary({ wants: null, budget: null, timeline: null }, ["a?", "b?", "c?", "d?"], false).open_questions).toEqual(["b?", "c?", "d?"]);
  });
});

describe("redact (personal data never reaches free-tier providers)", () => {
  it("removes phones, e-mails and the buyer's name", () => {
    const out = redact("I'm Hardik Patel, call +91 98765 58210 or 9876558210, mail hardik.p@example.com", ["Hardik Patel"]);
    expect(out).not.toMatch(/Hardik|Patel|98765|58210|example\.com/);
    expect(out).toContain("[phone]");
    expect(out).toContain("[email]");
    expect(out).toContain("[name]");
  });
  it("leaves ordinary text alone", () => {
    expect(redact("2 BHK from ₹68 lakh, 720 sq ft carpet")).toBe("2 BHK from ₹68 lakh, 720 sq ft carpet");
  });
  it("escapes regex characters in names", () => {
    expect(() => redact("hello", ["A.(b)* Shah"])).not.toThrow();
  });
});

describe("time helpers", () => {
  it("istInstant / istDateKey round trip", () => {
    const d = istInstant("2026-11-08", 11, 0);
    expect(d.toISOString()).toBe("2026-11-08T05:30:00.000Z");
    expect(istDateKey(d)).toBe("2026-11-08");
    expect(istDateKey(new Date("2026-11-07T19:00:00Z"))).toBe("2026-11-08"); // 00:30 IST next day
    expect(istDateKey(new Date("2026-11-07T18:29:00Z"))).toBe("2026-11-07");
  });
  it("addDaysKey crosses month and year ends", () => {
    expect(addDaysKey("2026-10-31", 1)).toBe("2026-11-01");
    expect(addDaysKey("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDaysKey("2026-11-01", -1)).toBe("2026-10-31");
  });
  it("formatDuration", () => {
    expect(formatDuration(45_000)).toBe("45s");
    expect(formatDuration(3 * 60_000)).toBe("3m");
    expect(formatDuration(130 * 60_000)).toBe("2h 10m");
    expect(formatDuration(120 * 60_000)).toBe("2h");
    expect(formatDuration(76 * 3600_000)).toBe("3d 4h");
    expect(formatDuration(null)).toBe("—");
    expect(formatDuration(-5)).toBe("0s");
  });
  it("formatINR", () => {
    expect(formatINR(6800000)).toBe("₹68,00,000");
    expect(formatINR(null)).toBe("—");
  });
});
