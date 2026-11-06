import { describe, expect, it } from "vitest";
import { asksForDiscount, checkReply, detectLanguage, extractMoney, SAFE_REPLIES, wantsHuman } from "@/lib/assistant/guardrails";

const FACTS = `- Indicative price range: 2 BHK from ₹68 lakh; 3 BHK from ₹92 lakh up to ₹1.2 crore depending on floor and facing.
- Configurations: 2 BHK (approx. 1,150 sq ft super built-up, 720 sq ft carpet)`;

describe("wantsHuman", () => {
  it.each([
    "Can I talk to a person?",
    "I want to speak with someone",
    "please connect to sales",
    "speak to your sales team",
    "Is there a real person here?",
    "call me back please",
    "Talk to human",
    "mujhe kisi se baat karni hai",
    "call karo",
    "मुझे किसी व्यक्ति से बात करनी है",
    "कृपया कॉल करें",
    "મારે કોઈ વ્યક્તિ સાથે વાત કરવી છે",
    "મને ફોન કરો",
  ])("hands off for: %s", (t) => expect(wantsHuman(t)).toBe(true));

  it.each(["What is the carpet area of a 2 BHK?", "Is the sample flat ready?", "When is possession?", "Show me Saturday morning slots"])(
    "does not hand off for: %s", (t) => expect(wantsHuman(t)).toBe(false),
  );

  it("over-triggers on the bare word 'human' (accepted: a handoff is the safe failure)", () => {
    expect(wantsHuman("Is there a human resources office nearby?")).toBe(true);
  });
});

describe("asksForDiscount", () => {
  it.each(["Any discount?", "What is the best price?", "Can you reduce the price?", "Do you have any offers?", "Is it negotiable?", "kuch kam karo", "डिस्काउंट मिलेगा?", "કોઈ ડિસ્કાઉન્ટ છે?", "free parking?"])(
    "flags: %s", (t) => expect(asksForDiscount(t)).toBe(true),
  );
  it.each(["What is the price range?", "How big is the 3 BHK?", "Book a visit on Sunday"])("does not flag: %s", (t) => expect(asksForDiscount(t)).toBe(false));
});

describe("extractMoney", () => {
  it("canonicalises lakh / crore / rupee forms to the same rupee amount", () => {
    expect(extractMoney("₹68 lakh")).toEqual(["6800000"]);
    expect(extractMoney("68 lakh")).toEqual(["6800000"]);
    expect(extractMoney("Rs. 68 lakhs")).toEqual(["6800000"]);
    expect(extractMoney("INR 68 lac")).toEqual(["6800000"]);
    expect(extractMoney("₹1.2 crore")).toEqual(["12000000"]);
    expect(extractMoney("1.2 cr")).toEqual(["12000000"]);
    expect(extractMoney("Rs. 85,00,000")).toEqual(["8500000"]);
    expect(extractMoney("₹92L")).toEqual(["9200000"]);
  });
  it("finds several amounts", () => {
    expect(extractMoney("from ₹68 lakh up to ₹1.2 crore").sort()).toEqual(["12000000", "6800000"]);
  });
  it("ignores plain numbers without a currency or unit", () => {
    expect(extractMoney("1,150 sq ft, 14 floors, 240 homes")).toEqual([]);
    expect(extractMoney("92L")).toEqual(["9200000"]); // short-hand lakh is caught too
  });
});

describe("checkReply", () => {
  it("passes a price that is in the fact sheet, in any notation", () => {
    expect(checkReply("2 BHK homes start from 68 lakh; final pricing comes from the sales team.", FACTS)).toEqual({ ok: true, reasons: [] });
    expect(checkReply("3 BHK goes up to ₹1.2 crore.", FACTS).ok).toBe(true);
  });
  it("blocks an invented price", () => {
    expect(checkReply("A 3 BHK will cost about ₹1.05 crore.", FACTS).reasons).toContain("price_not_in_fact_sheet");
  });
  it("blocks discount and final-price talk", () => {
    expect(checkReply("We can offer a 5% discount this week.", FACTS).reasons).toContain("discount_or_final_price");
    expect(checkReply("The final price is ₹68 lakh.", FACTS).reasons).toContain("discount_or_final_price");
  });
  it("blocks claims beyond the registered details", () => {
    expect(checkReply("This comes with guaranteed returns.", FACTS).reasons).toContain("unregistered_claim");
    expect(checkReply("Prices will appreciate quickly here.", FACTS).reasons).toContain("unregistered_claim");
  });
  it("passes an ordinary helpful reply", () => {
    expect(checkReply("Yes, a furnished 3 BHK sample flat is ready to view. Would you like to visit?", FACTS).ok).toBe(true);
  });
  it("reports every reason that applies", () => {
    expect(checkReply("Special price ₹50 lakh with assured returns!", FACTS).reasons.sort()).toEqual(
      ["discount_or_final_price", "price_not_in_fact_sheet", "unregistered_claim"],
    );
  });
});

describe("detectLanguage", () => {
  it("detects scripts and falls back otherwise", () => {
    expect(detectLanguage("कीमत क्या है?")).toBe("hi");
    expect(detectLanguage("કિંમત શું છે?")).toBe("gu");
    expect(detectLanguage("What is the price?")).toBe("en");
    expect(detectLanguage("kitne ka hai", "hi")).toBe("hi");
  });
  it("has safe replies in all three languages", () => {
    for (const l of ["en", "hi", "gu"] as const) {
      expect(SAFE_REPLIES[l].blocked.length).toBeGreaterThan(20);
      expect(SAFE_REPLIES[l].discount.length).toBeGreaterThan(20);
    }
  });
});

describe("regressions found by the test pass", () => {
  it("does not treat 'no 1 BHK homes' as a superlative claim", () => {
    expect(checkReply("We have no 1 BHK homes in Project 2.", "").ok).toBe(true);
    expect(checkReply("We are the no. 1 developer in Ahmedabad.", "").reasons).toContain("unregistered_claim");
  });
  it("hands off on 'connect me with sales'", () => {
    expect(wantsHuman("please connect me with sales")).toBe(true);
    expect(wantsHuman("connect me to a person")).toBe(true);
  });
  it("blocks a shorthand lakh price that is not in the fact sheet", () => {
    expect(checkReply("The 3 BHK is 92L.", "3 BHK from ₹95 lakh").reasons).toContain("price_not_in_fact_sheet");
    expect(checkReply("The 3 BHK starts at 92L.", "3 BHK from ₹92 lakh").ok).toBe(true);
  });
});
