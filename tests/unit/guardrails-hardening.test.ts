import { describe, expect, it } from "vitest";
import { asksForDiscount, checkReply, extractMeasures, extractMoney, wantsHuman } from "@/lib/assistant/guardrails";

const SHEET = `- Indicative price range: 2 BHK from ₹68 lakh; 3 BHK from ₹92 lakh up to ₹1.2 crore depending on floor and facing.
- Configurations: 2 BHK (approx. 1,150 sq ft super built-up, 720 sq ft carpet) and 3 BHK (approx. 1,620 sq ft super built-up, 1,010 sq ft carpet).
- Towers and homes: Four towers of 14 floors, 240 homes in total.
- Possession: Possession as per RERA registration: December 2027.
- School: Two CBSE schools are within 3 km of the site office.`;

describe("reply guard: every way of quoting a discount or an invented price is blocked", () => {
  const blocked: [string, string][] = [
    ["We have a festive offer of 5% off on 3 BHK.", "discount_or_final_price"],
    ["I can give you a 5% rebate if you book this week.", "discount_or_final_price"],
    ["There is a special scheme running right now.", "discount_or_final_price"],
    ["That would be a cheaper option for you.", "discount_or_final_price"],
    ["This is our best rate for the 3 BHK.", "discount_or_final_price"],
    ["The offer price is attractive for early bookings.", "discount_or_final_price"],
    ["The 3 BHK starts at 85 lacs.", "price_not_in_fact_sheet"],
    ["The 3 BHK is about 1.1 crores.", "price_not_in_fact_sheet"],
    ["Price is 7800000 rupees.", "price_not_in_fact_sheet"],
    ["Price is 78,00,000 rupees.", "price_not_in_fact_sheet"],
    ["It is around eighty lakh.", "price_not_in_fact_sheet"],
    ["It is one point one crore.", "price_not_in_fact_sheet"],
    ["It's a safe investment with good ROI.", "unregistered_claim"],
    ["You will see strong appreciation here.", "unregistered_claim"],
    ["Prices will go up soon, so hurry.", "unregistered_claim"],
    ["The 2 BHK carpet area is approx. 750 sq ft.", "figure_not_in_fact_sheet"],
    ["There is a school within 5 km.", "figure_not_in_fact_sheet"],
    ["The towers have 20 floors.", "figure_not_in_fact_sheet"],
  ];
  it.each(blocked)("blocks: %s", (reply, reason) => {
    const r = checkReply(reply, SHEET);
    expect(r.ok).toBe(false);
    expect(r.reasons).toContain(reason);
  });

  const allowed = [
    "The 3 BHK starts from ₹92 lakh, and the final price is confirmed by our sales team.",
    "3 BHK homes are about 1,010 sq ft carpet.",
    "Possession is December 2027, as per the RERA registration.",
    "There are four towers of 14 floors, 240 homes in total.",
    "Two CBSE schools are within 3 km of the site office.",
    "The 2 BHK is 720 sq ft carpet. Would you like to visit on Sunday at 11:00 am?",
    "The 3 BHK ranges up to ₹1.2 crore depending on floor and facing.",
    "I don't have that detail, so a person from the sales team will confirm it.",
    "We offer a furnished sample flat that you can see at the site office.",
  ];
  it.each(allowed)("lets an ordinary reply through: %s", (reply) => {
    expect(checkReply(reply, SHEET).ok).toBe(true);
  });

  it("does not mistake a phone number for a price", () => {
    expect(extractMoney("we'll call you on 9825011111")).toEqual([]);
  });
});

describe("buyer asks for a discount: caught before the model runs", () => {
  it.each([
    "Is it cheaper if I book now?", "Any scheme or festive offer?", "What is your final rate?", "Can you give me 10% off?",
    "any rebate?", "sasta karo thoda", "thoda rate kam kijiye", "मुझे ऑफर बताओ", "कुछ सस्ता मिलेगा?", "સસ્તું થશે?", "કોઈ સ્કીમ છે?",
    "Can we negotiate the price?", "give me a discount",
  ])("%s", (text) => expect(asksForDiscount(text)).toBe(true));

  it.each(["What is the carpet area?", "Do you offer loans?", "When is possession?", "Is there parking?"])("leaves %s alone", (text) =>
    expect(asksForDiscount(text)).toBe(false));
});

describe("buyer asks for a person, in the ways people actually say it", () => {
  it.each([
    "मैं सेल्स टीम से बात करना चाहता हूँ", "मुझे कॉल कीजिए", "સેલ્સ ટીમ સાથે વાત કરવી છે", "મને કૉલ કરો",
    "mujhe sales wale se baat karna hai", "executive se baat karwa do", "talk to somebody please", "please have a sales rep contact me",
    "can someone call me", "contact me", "I want to speak with your manager",
  ])("%s", (text) => expect(wantsHuman(text)).toBe(true));

  it.each(["What is the carpet area?", "कोई बात नहीं", "Is the clubhouse open?", "3 BHK का कारपेट एरिया कितना है?"])("does not hand off on: %s", (text) =>
    expect(wantsHuman(text)).toBe(false));
});

describe("extractMeasures", () => {
  it("normalises units and ignores commas", () => {
    expect(extractMeasures("1,010 sq ft, 14 floors, 3 km, 5%, 240 homes").sort()).toEqual(["14floors", "1010sqft", "240homes", "3km", "5%"].sort());
  });
  it("ignores BHK and times", () => {
    expect(extractMeasures("a 3 BHK at 11:00 am")).toEqual([]);
  });
});
