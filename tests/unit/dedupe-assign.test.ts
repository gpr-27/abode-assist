import { describe, expect, it } from "vitest";
import { classifyDuplicate, nameSimilarity, normalizeName } from "@/lib/dedupe";
import { chooseExecutive } from "@/lib/assign";

const existing = [
  { id: "a", name: "Hardik Patel", phone: "+919876558210", email: "hardik@example.com" },
  { id: "b", name: "Nidhi Shah", phone: "+919876558211", email: "nidhi@example.com" },
];

describe("dedupe", () => {
  it("same phone → same lead", () => {
    expect(classifyDuplicate({ name: "H. Patel", phone: "+919876558210", email: null }, existing)).toEqual({ kind: "same", leadId: "a", matchedOn: "phone" });
  });
  it("same e-mail → same lead", () => {
    expect(classifyDuplicate({ name: "Nidhi", phone: null, email: "nidhi@example.com" }, existing)).toEqual({ kind: "same", leadId: "b", matchedOn: "email" });
  });
  it("phone match wins over a different lead's e-mail", () => {
    expect(classifyDuplicate({ name: "X", phone: "+919876558210", email: "nidhi@example.com" }, existing)).toMatchObject({ kind: "same", leadId: "a" });
  });
  it("similar name with different contact → possible duplicate", () => {
    const v = classifyDuplicate({ name: "Nidhi Shaah", phone: "+919898012211", email: null }, existing);
    expect(v.kind).toBe("possible");
    expect(v).toMatchObject({ leadId: "b" });
  });
  it("honorifics and punctuation are ignored", () => {
    expect(normalizeName("Mr. Hardik  Patel")).toBe("hardik patel");
    expect(classifyDuplicate({ name: "Mr. Hardik Patel", phone: "+919000000001", email: null }, existing)).toMatchObject({ kind: "possible", leadId: "a" });
  });
  it("different people → new", () => {
    expect(classifyDuplicate({ name: "Kavita Joshi", phone: "+919000000002", email: null }, existing)).toEqual({ kind: "new" });
    expect(classifyDuplicate({ name: "Kavita Joshi", phone: null, email: null }, [])).toEqual({ kind: "new" });
  });
  it("nameSimilarity is symmetric, 1 for identical, 0 for empty", () => {
    expect(nameSimilarity("Nidhi Shah", "Nidhi Shaah")).toBeCloseTo(nameSimilarity("Nidhi Shaah", "Nidhi Shah"));
    expect(nameSimilarity("Kavita Joshi", "kavita joshi")).toBe(1);
    expect(nameSimilarity("", "x")).toBe(0);
    expect(nameSimilarity("Kavita Joshi", "Hardik Patel")).toBeLessThan(0.5);
  });
});

describe("chooseExecutive", () => {
  const t = (iso: string) => new Date(iso);
  it("picks the least-loaded executive", () => {
    expect(chooseExecutive([
      { id: "1", name: "Priya", openLeads: 5, lastAssignedAt: null },
      { id: "2", name: "Karan", openLeads: 2, lastAssignedAt: t("2026-11-07T10:00:00Z") },
    ])!.id).toBe("2");
  });
  it("on a tie, picks whoever was assigned longest ago, never-assigned first", () => {
    expect(chooseExecutive([
      { id: "1", name: "Priya", openLeads: 2, lastAssignedAt: t("2026-11-07T10:00:00Z") },
      { id: "2", name: "Karan", openLeads: 2, lastAssignedAt: t("2026-11-06T10:00:00Z") },
    ])!.id).toBe("2");
    expect(chooseExecutive([
      { id: "1", name: "Priya", openLeads: 2, lastAssignedAt: t("2026-11-06T10:00:00Z") },
      { id: "3", name: "Neha", openLeads: 2, lastAssignedAt: null },
    ])!.id).toBe("3");
  });
  it("is stable by name when everything else ties", () => {
    expect(chooseExecutive([
      { id: "1", name: "Priya", openLeads: 0, lastAssignedAt: null },
      { id: "2", name: "Arjun", openLeads: 0, lastAssignedAt: null },
    ])!.name).toBe("Arjun");
  });
  it("returns null when nobody sells the project", () => expect(chooseExecutive([])).toBeNull());
  it("does not mutate the input", () => {
    const c = [{ id: "1", name: "B", openLeads: 3, lastAssignedAt: null }, { id: "2", name: "A", openLeads: 1, lastAssignedAt: null }];
    chooseExecutive(c);
    expect(c[0].id).toBe("1");
  });
});
