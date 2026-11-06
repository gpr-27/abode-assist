/**
 * Deterministic checks that run around the language model.
 * The model is told the rules; these functions make sure the rules hold even when it slips.
 */

export type Lang = "en" | "hi" | "gu";

/** Script-based language detection. Romanised Hindi is left to the UI language choice. */
export function detectLanguage(text: string, fallback: Lang = "en"): Lang {
  if (/[઀-૿]/.test(text)) return "gu";
  if (/[ऀ-ॿ]/.test(text)) return "hi";
  return fallback;
}

const HUMAN_PATTERNS: RegExp[] = [
  /\b(talk|speak|chat|connect)\s+(to|with)\s+(a\s+|an\s+|some\s*one|someone|your\s+)?(human|person|agent|executive|sales\s*(person|team|executive)?|manager|someone|real\s+person|team)\b/i,
  /\b(real|actual)\s+(human|person)\b/i,
  /\b(call\s+me|call\s+back|callback|phone\s+me|ring\s+me)\b/i,
  /\bhuman\b/i,
  /\b(insaan|kisi\s+se\s+baat|baat\s+karni|baat\s+karwa|call\s+karo|phone\s+karo)\b/i,
  /(व्यक्ति|इंसान|किसी से बात|बात करनी|बात कराओ|कॉल करें|फोन करें|कॉल करो)/,
  /(માણસ|વ્યક્તિ|વાત કરવી|વાત કરાવો|ફોન કરો|કૉલ કરો|કોલ કરો)/,
];

/** The buyer can ask for a person at any time; this bypasses the model entirely. */
export function wantsHuman(text: string): boolean {
  return HUMAN_PATTERNS.some((re) => re.test(text));
}

const DISCOUNT_RE =
  /\b(discount|discounted|offer\s+price|special\s+price|best\s+price|lowest\s+price|final\s+price|negotiab\w*|negotiat\w*|cash\s*back|waive[sd]?|free\s+(parking|registration|stamp\s+duty|gst|modular\s+kitchen))\b|(छूट|डिस्काउंट|कम\s*कीमत|फाइनल\s*प्राइस)|(ડિસ્કાઉન્ટ|છૂટ|ઓછી\s*કિંમત|ફાઇનલ\s*પ્રાઇસ)/i;

const CLAIM_RE =
  /\b(guarantee[ds]?|assured\s+(returns?|appreciation|rental)|will\s+(appreciate|double)|price\s+will\s+(rise|go\s+up)|investment\s+returns?|rental\s+yield\s+of|best\s+in\s+(the\s+)?city|no\.?\s*1)\b/i;

/** ₹ amounts, lakh/crore figures and bare 6+ digit sums mentioned in a reply. */
export function extractMoney(text: string): string[] {
  const out = new Set<string>();
  const re = /(?:₹|rs\.?|inr)\s*([\d.,]+)\s*(lakh|lac|lakhs|crore|cr|l|k)?|([\d.,]+)\s*(lakh|lac|lakhs|crore|cr)\b/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    const num = (m[1] ?? m[3] ?? "").replace(/,/g, "").replace(/\.$/, "");
    const unit = (m[2] ?? m[4] ?? "").toLowerCase();
    if (!num) continue;
    out.add(canonicalMoney(num, unit));
  }
  return [...out];
}

function canonicalMoney(num: string, unit: string): string {
  const n = Number(num);
  if (!Number.isFinite(n)) return num;
  const mult = unit.startsWith("cr") ? 1e7 : unit.startsWith("la") || unit === "l" ? 1e5 : unit === "k" ? 1e3 : 1;
  return String(Math.round(n * mult));
}

export type GuardResult = {
  ok: boolean;
  reasons: string[]; // stable codes, stored on the conversation for the daily review
};

/**
 * Check a drafted reply before the buyer sees it.
 * - no discounts, offers or "final price" talk
 * - no claims beyond the registered details (returns, appreciation, superlatives)
 * - every money figure must appear in the fact sheet
 */
export function checkReply(reply: string, factSheetText: string): GuardResult {
  const reasons: string[] = [];
  if (DISCOUNT_RE.test(reply)) reasons.push("discount_or_final_price");
  if (CLAIM_RE.test(reply)) reasons.push("unregistered_claim");
  const allowed = new Set(extractMoney(factSheetText));
  const mentioned = extractMoney(reply);
  if (mentioned.some((m) => !allowed.has(m))) reasons.push("price_not_in_fact_sheet");
  return { ok: reasons.length === 0, reasons };
}

/** Questions that must never be answered by the model, whatever the fact sheet says. */
export function asksForDiscount(text: string): boolean {
  return DISCOUNT_RE.test(text) || /\b(bargain|reduce\s+the\s+price|any\s+offers?|kam\s+karo|kuch\s+kam)\b/i.test(text);
}

export const SAFE_REPLIES: Record<Lang, { blocked: string; human: string; discount: string; unavailable: string }> = {
  en: {
    blocked:
      "I want to be accurate with you, so I'll have one of our sales team confirm that detail personally. Is there anything else I can help with meanwhile, like booking a site visit?",
    human: "Of course. I've passed your chat to our sales team; a named executive will reach you shortly. You can keep chatting here too.",
    discount:
      "Prices, offers and discounts are confirmed only by our sales team, so I can't quote them here. I've asked an executive to reach you with the details.",
    unavailable:
      "I'm having trouble answering right now. You can still pick a visit slot below, or ask for a person and our team will call you.",
  },
  hi: {
    blocked:
      "मैं आपको सही जानकारी देना चाहता हूँ, इसलिए यह बात हमारी सेल्स टीम का कोई सदस्य खुद पुष्टि करेगा। तब तक क्या मैं साइट विज़िट बुक करने में मदद करूँ?",
    human: "ज़रूर। मैंने आपकी चैट हमारी सेल्स टीम को भेज दी है; एक एग्ज़िक्यूटिव जल्द ही आपसे संपर्क करेंगे। आप यहाँ बात जारी रख सकते हैं।",
    discount:
      "कीमत, ऑफ़र और डिस्काउंट केवल हमारी सेल्स टीम ही बताती है, इसलिए मैं यहाँ नहीं बता सकता। मैंने एक एग्ज़िक्यूटिव से आपको संपर्क करने को कहा है।",
    unavailable:
      "अभी जवाब देने में दिक्कत आ रही है। आप नीचे से विज़िट का समय चुन सकते हैं, या किसी व्यक्ति से बात करने के लिए कहें।",
  },
  gu: {
    blocked:
      "હું તમને સાચી માહિતી આપવા માંગુ છું, તેથી આ વિગત અમારી સેલ્સ ટીમના સભ્ય જાતે પુષ્ટિ કરશે. ત્યાં સુધી શું હું સાઇટ વિઝિટ બુક કરવામાં મદદ કરું?",
    human: "ચોક્કસ. મેં તમારી ચેટ અમારી સેલ્સ ટીમને મોકલી છે; એક એક્ઝિક્યુટિવ ટૂંક સમયમાં તમારો સંપર્ક કરશે. તમે અહીં વાત ચાલુ રાખી શકો છો.",
    discount:
      "કિંમત, ઑફર અને ડિસ્કાઉન્ટ ફક્ત અમારી સેલ્સ ટીમ જ જણાવે છે, તેથી હું અહીં કહી શકતો નથી. મેં એક એક્ઝિક્યુટિવને તમારો સંપર્ક કરવા કહ્યું છે.",
    unavailable:
      "હમણાં જવાબ આપવામાં તકલીફ છે. તમે નીચેથી વિઝિટનો સમય પસંદ કરી શકો છો, અથવા કોઈ વ્યક્તિ સાથે વાત કરવા કહો.",
  },
};
