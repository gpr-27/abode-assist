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
  /\b(talk|speak|chat|connect)\s+(?:me\s+)?(to|with)\s+(a\s+|an\s+|some\s*one|someone|your\s+)?(human|person|agent|executive|sales\s*(person|team|executive|rep)?|manager|someone|real\s+person|team)\b/i,
  /\b(talk|speak|chat)\s+(to|with)\s+(somebody|anybody|anyone)\b/i,
  /\b(real|actual)\s+(human|person)\b/i,
  /\b(call\s+me|call\s+back|callback|phone\s+me|ring\s+me|contact\s+me|reach\s+me)\b/i,
  /\b(can|could|will|would)\s+(someone|somebody|anyone|a\s+(person|sales\s*(rep|person|executive)))\s+(call|contact|reach|phone)\b/i,
  /\b(have|get)\s+(a\s+|an\s+|the\s+)?(sales\s*(rep|person|executive|team)|executive|manager|someone|somebody)\s+(call|contact|reach|phone)\b/i,
  /\bhuman\b/i,
  // Hinglish: a person word near a talk/call word, in either order
  /\b(insaan|kisi\s+se\s+baat|baat\s+karni|baat\s+karwa|call\s+karo|phone\s+karo)\b/i,
  /\b(sales|team|executive|manager|rep|representative|insaan|banda|bande|wale|wala|person)\b[^.?!\n]{0,30}\b(baat|bat|call|phone|contact|milna|milwa)\w*/i,
  /\b(baat|call|phone|contact|milwa)\w*\s*(kar|kij|kro|karo|karna|karni)\w*\b[^.?!\n]{0,25}\b(sales|team|executive|manager|insaan|banda|person)\b/i,
  // Hindi
  /(व्यक्ति|इंसान|किसी से बात|बात करनी|बात कराओ|कॉल करें|फोन करें|कॉल करो)/,
  /(सेल्स|टीम|एग्ज़िक्यूटिव|एक्जीक्यूटिव|एग्जीक्यूटिव|मैनेजर|आदमी)[^.?!।\n]{0,25}(बात|कॉल|फोन|फ़ोन|संपर्क|मिल)/,
  /(बात|कॉल|फोन|फ़ोन|संपर्क)[^.?!।\n]{0,25}(सेल्स|टीम|एग्ज़िक्यूटिव|एक्जीक्यूटिव|एग्जीक्यूटिव|मैनेजर|आदमी)/,
  /(मुझे|मुझसे)[^.?!।\n]{0,15}(कॉल|फोन|फ़ोन|संपर्क)/,
  // Gujarati
  /(માણસ|વ્યક્તિ|વાત કરવી|વાત કરાવો|ફોન કરો|કૉલ કરો|કોલ કરો)/,
  /(સેલ્સ|ટીમ|એક્ઝિક્યુટિવ|મેનેજર)[^.?!।\n]{0,25}(વાત|કૉલ|કોલ|ફોન|સંપર્ક|મળ)/,
  /(વાત|કૉલ|કોલ|ફોન|સંપર્ક)[^.?!।\n]{0,25}(સેલ્સ|ટીમ|એક્ઝિક્યુટિવ|મેનેજર)/,
  /(મને|મારી સાથે)[^.?!।\n]{0,15}(કૉલ|કોલ|ફોન|સંપર્ક)/,
];

/** The buyer can ask for a person at any time; this bypasses the model entirely. */
export function wantsHuman(text: string): boolean {
  return HUMAN_PATTERNS.some((re) => re.test(text));
}

const DISCOUNT_RE = new RegExp(
  [
    String.raw`\b(discount|discounted|offer\s+price|special\s+price|best\s+price|lowest\s+price|negotiab\w*|negotiat\w*|cash\s*back|waive[sd]?|free\s+(parking|registration|stamp\s+duty|gst|modular\s+kitchen))\b`,
    String.raw`\b\d+(\.\d+)?\s*%\s*(off|discount|rebate|cashback|less)\b`,
    String.raw`\b(rebates?|schemes?|concessions?|cheaper)\b`,
    String.raw`\b(festive|diwali|special|limited|launch|booking|exclusive|early[\s-]?bird|current|latest)\s+(offers?|deals?|prices?|rates?|schemes?)\b`,
    String.raw`\b(best|lowest|negotiated|negotiable|reduced)\s+(rate|price|deal)\b`,
    // "final price" is only fine when the sentence says the sales team confirms it.
    String.raw`\bfinal\s+(rate|price|deal)\b(?![^.!?\n]*\b(confirm\w*|sales\s+team|decid\w*|person)\b)`,
    String.raw`\boffers?\b(?=[^.!?\n]*\b(price|rate|booking|%|lakh|lac|crore|discount)\b)`,
    String.raw`\b(sasta|sasti|sastha|rate\s+kam|price\s+kam|kam\s+kijiye|kam\s+karo|thoda\s+kam|kuch\s+kam)\b`,
    "(छूट|डिस्काउंट|कम\\s*कीमत|फाइनल\\s*प्राइस|ऑफर|ऑफ़र|स्कीम|सस्ता|सस्ती|रिबेट|रियायत|रेट\\s*कम|कीमत\\s*कम)",
    "(ડિસ્કાઉન્ટ|છૂટ|ઓછી\\s*કિંમત|ફાઇનલ\\s*પ્રાઇસ|ઑફર|ઓફર|સ્કીમ|સસ્તું|સસ્તી|સસ્તો|રિબેટ|રેટ\\s*ઓછો|કિંમત\\s*ઓછી)",
  ].join("|"),
  "i",
);

const CLAIM_RE =
  /\b(guarantee[ds]?|assured\s+(returns?|appreciation|rental)|will\s+(appreciate|double)|(price|prices)\s+(will|are\s+(going|expected)\s+to)\s+(rise|go\s+up|increase|appreciate)|investment\s+returns?|rental\s+(income|yield)|(great|good|safe|sure|best|excellent|smart|solid|profitable)\s+investment|\broi\b|(strong|great|good|high|capital)\s+appreciation|capital\s+gains?|resale\s+value|risk[\s-]?free|selling\s+fast|limited\s+(units|flats|homes)|last\s+few\s+(units|flats|homes)|best\s+in\s+(the\s+)?city|(?:no\.?\s*1|number\s+one)\s+(?:project|developer|builder|in))\b/i;

const WORD_NUM: Record<string, number> = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, thirteen: 13,
  fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19, twenty: 20, thirty: 30, forty: 40, fifty: 50,
  sixty: 60, seventy: 70, eighty: 80, ninety: 90,
};

/** "eighty lakh" → 80, "twenty five" → 25, "one point two" → 1.2. Returns null if the words are not a number. */
function wordsToNumber(words: string): number | null {
  const parts = words.toLowerCase().split(/\s+point\s+/);
  const whole = (p: string) => {
    let total = 0;
    for (const w of p.split(/[\s-]+/).filter(Boolean)) {
      if (!(w in WORD_NUM)) return null;
      total += WORD_NUM[w];
    }
    return total;
  };
  const head = whole(parts[0]);
  if (head === null) return null;
  if (parts.length === 1) return head;
  const frac = parts[1].split(/\s+/).map((w) => (w in WORD_NUM && WORD_NUM[w] < 10 ? String(WORD_NUM[w]) : "")).join("");
  return frac ? Number(`${head}.${frac}`) : head;
}

/** ₹ amounts, lakh/crore figures (digits or words), and bare 6–9 digit sums mentioned in a text, as whole rupees. */
export function extractMoney(text: string): string[] {
  const out = new Set<string>();
  const unit = String.raw`lakhs?|lacs?|crores?|crs?|cr|l|k`;
  const digits = new RegExp(String.raw`(?:₹|rs\.?|inr)\s*([\d.,]+)\s*(${unit})?|([\d.,]+)\s*(lakhs?|lacs?|crores?|crs?|cr|l)\b`, "gi");
  let m: RegExpExecArray | null;
  while ((m = digits.exec(text))) {
    const num = (m[1] ?? m[3] ?? "").replace(/,/g, "").replace(/\.$/, "");
    if (!num) continue;
    out.add(canonicalMoney(num, (m[2] ?? m[4] ?? "").toLowerCase()));
  }
  const words = /\b((?:(?:one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety)[\s-]+)*(?:one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety)(?:\s+point(?:\s+(?:one|two|three|four|five|six|seven|eight|nine))+)?)\s+(lakhs?|lacs?|crores?)\b/gi;
  while ((m = words.exec(text))) {
    const n = wordsToNumber(m[1]);
    if (n !== null) out.add(canonicalMoney(String(n), m[2].toLowerCase()));
  }
  // A bare 6–9 digit figure (with or without Indian/Western commas) reads as a price; 10 digits is a phone number.
  const bare = /(?<![\d,.₹])(\d{1,3}(?:,\d{2,3})+|\d{6,9})(?![\d,]*\d)(?!\s*(?:lakhs?|lacs?|crores?|crs?|cr|l|k)\b)/gi;
  while ((m = bare.exec(text))) {
    const n = Number(m[1].replace(/,/g, ""));
    if (n >= 100000 && n < 1e10) out.add(String(n));
  }
  return [...out];
}

function canonicalMoney(num: string, unit: string): string {
  const n = Number(num);
  if (!Number.isFinite(n)) return num;
  const mult = unit.startsWith("cr") ? 1e7 : unit.startsWith("la") || unit === "l" ? 1e5 : unit === "k" ? 1e3 : 1;
  return String(Math.round(n * mult));
}

/**
 * Measured figures a buyer might rely on: areas, percentages, distances, floors, towers, homes, months.
 * Each "number + unit" in a reply must also appear in the fact sheet, so the assistant cannot invent a size or a distance.
 */
const UNIT_ALIASES: [RegExp, string][] = [
  [/^sq\.?\s*ft\.?$|^sqft$|^square\s+feet$|^square\s+foot$/i, "sqft"],
  [/^%$|^percent$|^per\s*cent$/i, "%"],
  [/^km$|^kms$|^kilomet(?:re|er)s?$/i, "km"],
  [/^floors?$|^storeys?$|^stories$/i, "floors"],
  [/^towers?$/i, "towers"],
  [/^(?:homes?|flats?|apartments?|units?)$/i, "homes"],
  [/^months?$/i, "months"],
];

export function extractMeasures(text: string): string[] {
  const out = new Set<string>();
  const re = /(\d[\d,]*(?:\.\d+)?)\s*(sq\.?\s*ft\.?|sqft|square\s+fee?t|square\s+foot|%|percent|per\s*cent|kms?|kilomet(?:re|er)s?|floors?|storeys?|stories|towers?|homes?|flats?|apartments?|units?|months?)(?![a-z])/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    const unit = UNIT_ALIASES.find(([r]) => r.test(m![2].trim()))?.[1];
    if (unit) out.add(`${Number(m[1].replace(/,/g, ""))}${unit}`);
  }
  return [...out];
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
  const knownMeasures = new Set(extractMeasures(factSheetText));
  if (extractMeasures(reply).some((m) => !knownMeasures.has(m))) reasons.push("figure_not_in_fact_sheet");
  return { ok: reasons.length === 0, reasons };
}

/** Questions that must never be answered by the model, whatever the fact sheet says. */
export function asksForDiscount(text: string): boolean {
  return DISCOUNT_RE.test(text) || /\b(bargain|reduce\s+the\s+price|any\s+offers?|final\s+rate|best\s+rate|price\s+negotiation)\b/i.test(text);
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
