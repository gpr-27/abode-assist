import { describe, expect, it } from "vitest";
import { planReminders, renderMessage, REMINDER_OFFSETS, TEMPLATES } from "@/lib/reminders";

const visit = new Date("2026-11-10T05:30:00Z"); // 11:00 IST, 10 Nov
const H = 3600_000;

describe("planReminders", () => {
  it("booked 3 days ahead: both scheduled at exact offsets", () => {
    const p = planReminders(visit, new Date(visit.getTime() - 72 * H), false);
    expect(p.map((x) => [x.kind, x.status])).toEqual([["reminder_1d", "scheduled"], ["reminder_2h", "scheduled"]]);
    expect(p[0].send_at.getTime()).toBe(visit.getTime() - REMINDER_OFFSETS.reminder_1d);
    expect(p[1].send_at.getTime()).toBe(visit.getTime() - 2 * H);
  });
  it("booked 5 hours ahead: 1-day reminder skipped, 2-hour scheduled", () => {
    const p = planReminders(visit, new Date(visit.getTime() - 5 * H), false);
    expect(p.find((x) => x.kind === "reminder_1d")!.status).toBe("skipped");
    expect(p.find((x) => x.kind === "reminder_1d")!.note).toMatch(/inside the reminder window/);
    expect(p.find((x) => x.kind === "reminder_2h")!.status).toBe("scheduled");
  });
  it("booked 90 minutes ahead: both skipped", () => {
    expect(planReminders(visit, new Date(visit.getTime() - 1.5 * H), false).every((x) => x.status === "skipped")).toBe(true);
  });
  it("booked exactly at the reminder time: skipped (not sent in the past)", () => {
    expect(planReminders(visit, new Date(visit.getTime() - 2 * H), false)[1].status).toBe("skipped");
  });
  it("opted out: both skipped with a note", () => {
    const p = planReminders(visit, new Date(visit.getTime() - 72 * H), true);
    expect(p.every((x) => x.status === "skipped" && x.note === "Buyer opted out")).toBe(true);
  });
});

describe("renderMessage", () => {
  const ctx = {
    buyerName: "Hardik Patel", projectName: "Project 1", reraNo: "PR/GJ/AHMEDABAD/TEST/2025", address: "Site office, Shela",
    mapUrl: "https://maps.google.com/?q=23,72", startsAt: visit, executiveName: "Priya Shah", optoutUrl: "https://x.test/optout/abc",
  };
  it.each(Object.keys(TEMPLATES) as Array<keyof typeof TEMPLATES>)("%s carries the RERA number and an opt-out link", (kind) => {
    const m = renderMessage(kind, ctx);
    expect(m).toContain(ctx.reraNo);
    expect(m).toContain(ctx.optoutUrl);
    expect(m).toContain("STOP");
  });
  it.each(["confirmation", "reminder_1d", "reminder_2h"] as const)("%s has the map pin and the IST time", (kind) => {
    const m = renderMessage(kind, ctx);
    expect(m).toContain(ctx.mapUrl);
    expect(m).toMatch(/11:00\s*(am|AM)/);
  });
  it("confirmation includes the address and greets by first name", () => {
    const m = renderMessage("confirmation", ctx);
    expect(m).toContain(ctx.address);
    expect(m.startsWith("Hi Hardik,")).toBe(true);
  });
  it("names the executive in the 1-day reminder and the handoff intro", () => {
    expect(renderMessage("reminder_1d", ctx)).toContain("Priya Shah");
    expect(renderMessage("handoff", ctx)).toContain("Priya Shah");
  });
});
