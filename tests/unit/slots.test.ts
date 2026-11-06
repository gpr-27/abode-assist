import { describe, expect, it } from "vitest";
import { freeSlots, MIN_LEAD_MINUTES, partOfDay, pickSuggestions, type SlotRow } from "@/lib/slots";
import { istInstant } from "@/lib/time";

const NOW = new Date("2026-11-07T04:30:00Z"); // 10:00 IST, 7 Nov
const slot = (id: string, starts: Date, o: Partial<SlotRow> = {}): SlotRow => ({
  id, project_id: "p1", starts_at: starts, ends_at: new Date(starts.getTime() + 45 * 60_000), capacity: 2, active: true, held: 0, ...o,
});

describe("freeSlots", () => {
  const rows = [
    slot("later", istInstant("2026-11-09", 11)),
    slot("soon", istInstant("2026-11-08", 10)),
    slot("inactive", istInstant("2026-11-08", 12), { active: false }),
    slot("full", istInstant("2026-11-08", 13), { held: 2 }),
    slot("past", istInstant("2026-11-06", 11)),
    slot("too-soon", new Date(NOW.getTime() + (MIN_LEAD_MINUTES - 1) * 60_000)),
    slot("edge", new Date(NOW.getTime() + MIN_LEAD_MINUTES * 60_000)),
    slot("one-left", istInstant("2026-11-08", 14), { held: 1 }),
  ];

  it("keeps only active, future, not-full slots outside the notice window, sorted by start", () => {
    expect(freeSlots(rows, NOW).map((s) => s.id)).toEqual(["edge", "soon", "one-left", "later"]);
  });
  it("computes places left", () => {
    const f = freeSlots(rows, NOW);
    expect(f.find((s) => s.id === "one-left")!.left).toBe(1);
    expect(f.find((s) => s.id === "soon")!.left).toBe(2);
  });
  it("respects a custom notice window", () => {
    expect(freeSlots(rows, NOW, 0).map((s) => s.id)).toContain("too-soon");
  });
  it("treats held > capacity as full", () => {
    expect(freeSlots([slot("x", istInstant("2026-11-10", 11), { held: 5, capacity: 2 })], NOW)).toEqual([]);
  });
});

describe("partOfDay (IST)", () => {
  it.each([
    ["2026-11-08T03:30:00Z", "morning"], // 09:00 IST
    ["2026-11-08T06:29:00Z", "morning"], // 11:59 IST
    ["2026-11-08T06:30:00Z", "afternoon"], // 12:00 IST
    ["2026-11-08T07:30:00Z", "afternoon"], // 13:00 IST
    ["2026-11-08T10:29:00Z", "afternoon"], // 15:59 IST
    ["2026-11-08T10:30:00Z", "evening"], // 16:00 IST
    ["2026-11-08T11:30:00Z", "evening"], // 17:00 IST
  ])("%s → %s", (iso, part) => expect(partOfDay(new Date(iso))).toBe(part));
});

describe("pickSuggestions", () => {
  const days = ["2026-11-08", "2026-11-09", "2026-11-10", "2026-11-11"];
  const many = freeSlots(days.flatMap((d) => [10, 11, 12, 13, 14, 15, 16, 17].map((h) => slot(`${d}-${h}`, istInstant(d, h)))), NOW);

  it("spreads suggestions: at most 2 per IST day, capped at max", () => {
    const s = pickSuggestions(many, "any", 6);
    expect(s).toHaveLength(6);
    const perDay = new Map<string, number>();
    for (const x of s) perDay.set(x.id.slice(0, 10), (perDay.get(x.id.slice(0, 10)) ?? 0) + 1);
    expect([...perDay.values()].every((n) => n <= 2)).toBe(true);
    expect([...perDay.keys()]).toEqual(["2026-11-08", "2026-11-09", "2026-11-10"]);
  });
  it("filters by part of day in IST", () => {
    expect(pickSuggestions(many, "morning", 10).every((s) => partOfDay(new Date(s.starts_at)) === "morning")).toBe(true);
    expect(pickSuggestions(many, "evening", 10).map((s) => s.id)).toEqual(
      days.flatMap((d) => [`${d}-16`, `${d}-17`]),
    );
  });
  it("groups a late-evening UTC instant by its IST date", () => {
    // 23:30 IST on 8 Nov is 18:00Z on 8 Nov; 00:30 IST on 9 Nov is 19:00Z on 8 Nov.
    const a = freeSlots([slot("a", new Date("2026-11-08T18:00:00Z")), slot("b", new Date("2026-11-08T18:10:00Z")), slot("c", new Date("2026-11-08T19:00:00Z"))], NOW);
    expect(pickSuggestions(a, "any", 6).map((s) => s.id)).toEqual(["a", "b", "c"]);
  });
  it("per day: the earliest slot, then the first one at least 3 hours later", () => {
    const s = pickSuggestions(many, "any", 6);
    expect(s.map((x) => x.id)).toEqual(["2026-11-08-10", "2026-11-08-13", "2026-11-09-10", "2026-11-09-13", "2026-11-10-10", "2026-11-10-13"]);
  });
  it("falls back to the 2nd slot of the day when nothing is 3 hours later", () => {
    const day = freeSlots([10, 11, 12].map((h) => slot(`d-${h}`, istInstant("2026-11-08", h))), NOW);
    expect(pickSuggestions(day, "any", 6).map((x) => x.id)).toEqual(["d-10", "d-11"]);
  });
  it("a day with one open slot contributes one", () => {
    const one = freeSlots([slot("only", istInstant("2026-11-08", 15))], NOW);
    expect(pickSuggestions(one).map((x) => x.id)).toEqual(["only"]);
  });
  it("returns empty for no slots", () => expect(pickSuggestions([], "any")).toEqual([]));
});
