import { describe, expect, it } from "vitest";
import { formatPhone, maskPhone, normalizeEmail, normalizeIndianMobile } from "@/lib/phone";

describe("normalizeIndianMobile", () => {
  it.each([
    ["9825012345", "+919825012345"],
    ["98250 12345", "+919825012345"],
    ["+91-98250-12345", "+919825012345"],
    ["+91 98250 12345", "+919825012345"],
    ["09825012345", "+919825012345"],
    ["919825012345", "+919825012345"],
    ["(+91) 6355 012 345", "+916355012345"],
    ["7000012345", "+917000012345"],
  ])("accepts %s", (input, out) => expect(normalizeIndianMobile(input)).toBe(out));

  it.each([
    ["2225012345"], // landline-like, starts with 2
    ["5825012345"], // starts with 5
    ["982501234"], // 9 digits
    ["98250123456"], // 11 digits, no leading 0
    ["0098250123456"],
    ["abc"],
    [""],
  ])("rejects %s", (input) => expect(normalizeIndianMobile(input)).toBeNull());

  it("rejects null and undefined", () => {
    expect(normalizeIndianMobile(null)).toBeNull();
    expect(normalizeIndianMobile(undefined)).toBeNull();
  });
});

describe("formatPhone / maskPhone", () => {
  it("formats E.164 for display", () => {
    expect(formatPhone("+919825012345")).toBe("+91 98250 12345");
    expect(formatPhone(null)).toBe("—");
  });
  it("masks all but the last 4 digits", () => {
    const m = maskPhone("+919825012345");
    expect(m.endsWith("2345")).toBe(true);
    expect(m).not.toContain("98250");
    expect(maskPhone(undefined)).toBe("—");
  });
});

describe("normalizeEmail", () => {
  it("lowercases and trims valid addresses", () => {
    expect(normalizeEmail("  Nidhi.Shah@Example.COM ")).toBe("nidhi.shah@example.com");
  });
  it.each([["not-an-email"], ["a@b"], ["a b@c.com"], [""]])("rejects %s", (e) => expect(normalizeEmail(e)).toBeNull());
  it("rejects null", () => expect(normalizeEmail(null)).toBeNull());
});
