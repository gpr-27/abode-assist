/** Reminder schedule and message templates (mocked WhatsApp/SMS). Pure — unit tested. */
import { formatDateTime } from "./time";

export type ReminderPlan = {
  kind: "reminder_1d" | "reminder_2h";
  send_at: Date;
  status: "scheduled" | "skipped";
  note?: string;
};

export const REMINDER_OFFSETS = {
  reminder_1d: 24 * 60 * 60_000,
  reminder_2h: 2 * 60 * 60_000,
} as const;

/**
 * Two reminders: 1 day and 2 hours before the visit.
 * A reminder whose time has already passed when the visit is booked is skipped
 * (booking 5 hours ahead gets only the 2-hour one). Opted-out leads get none.
 */
export function planReminders(visitStart: Date, bookedAt: Date, optedOut: boolean): ReminderPlan[] {
  return (Object.keys(REMINDER_OFFSETS) as Array<keyof typeof REMINDER_OFFSETS>).map((kind) => {
    const send_at = new Date(visitStart.getTime() - REMINDER_OFFSETS[kind]);
    if (optedOut) return { kind, send_at, status: "skipped", note: "Buyer opted out" };
    if (send_at.getTime() <= bookedAt.getTime()) return { kind, send_at, status: "skipped", note: "Booked inside the reminder window" };
    return { kind, send_at, status: "scheduled" };
  });
}

type Ctx = {
  buyerName: string;
  projectName: string;
  reraNo: string;
  address: string;
  mapUrl: string;
  startsAt: Date;
  executiveName?: string | null;
  optoutUrl: string;
};

export type MsgLang = "en" | "hi" | "gu";
const LOCALES: Record<MsgLang, string> = { en: "en-IN", hi: "hi-IN", gu: "gu-IN" };

/** The legal footer: project, RERA number and a way to stop. Same facts in every language. */
const footer = (c: Ctx, lang: MsgLang) =>
  ({
    en: `${c.projectName} · RERA Reg. No. ${c.reraNo}\nReply STOP or visit ${c.optoutUrl} to stop messages.`,
    hi: `${c.projectName} · RERA पंजी. सं. ${c.reraNo}\nसंदेश बंद करने के लिए STOP लिखें या ${c.optoutUrl} खोलें।`,
    gu: `${c.projectName} · RERA નોંધણી નં. ${c.reraNo}\nસંદેશા બંધ કરવા STOP લખો અથવા ${c.optoutUrl} ખોલો.`,
  })[lang];

const firstName = (n: string) => n.trim().split(/\s+/)[0];

/** Template names mirror the opt-in WhatsApp templates the business would register. */
export const TEMPLATES = {
  ack: "lead_ack_v1",
  confirmation: "visit_confirm_v1",
  reminder_1d: "visit_reminder_1d_v1",
  reminder_2h: "visit_reminder_2h_v1",
  handoff: "handoff_intro_v1",
} as const;

export function renderMessage(kind: keyof typeof TEMPLATES, c: Ctx, lang: MsgLang = "en"): string {
  const when = formatDateTime(c.startsAt, LOCALES[lang]);
  const name = firstName(c.buyerName);
  const f = footer(c, lang);
  const meets = c.executiveName ? { en: ` ${c.executiveName} will meet you.`, hi: ` ${c.executiveName} आपसे मिलेंगे।`, gu: ` ${c.executiveName} તમને મળશે.` }[lang] : "";
  const pin = c.mapUrl ? { en: `\nLocation: ${c.mapUrl}`, hi: `\nलोकेशन: ${c.mapUrl}`, gu: `\nલોકેશન: ${c.mapUrl}` }[lang] : "";
  switch (kind) {
    case "ack":
      return {
        en: `Hi ${name}, thank you for your interest in ${c.projectName}. You can ask us anything or book a site visit here, any time.`,
        hi: `नमस्ते ${name}, ${c.projectName} में आपकी रुचि के लिए धन्यवाद। आप यहाँ कभी भी कुछ भी पूछ सकते हैं या साइट विज़िट बुक कर सकते हैं।`,
        gu: `નમસ્તે ${name}, ${c.projectName} માં રસ દાખવવા બદલ આભાર. તમે અહીં ગમે ત્યારે કંઈ પણ પૂછી શકો છો અથવા સાઇટ વિઝિટ બુક કરી શકો છો.`,
      }[lang] + `\n${f}`;
    case "confirmation":
      return {
        en: `Hi ${name}, your site visit to ${c.projectName} is confirmed for ${when}.\nAddress: ${c.address}`,
        hi: `नमस्ते ${name}, ${c.projectName} की आपकी साइट विज़िट ${when} के लिए पक्की हो गई है।\nपता: ${c.address}`,
        gu: `નમસ્તે ${name}, ${c.projectName} ની તમારી સાઇટ વિઝિટ ${when} માટે પાકી થઈ ગઈ છે.\nસરનામું: ${c.address}`,
      }[lang] + `${pin}\n${f}`;
    case "reminder_1d":
      return {
        en: `Reminder: your visit to ${c.projectName} is tomorrow, ${when}.${meets}`,
        hi: `याद दिलाना: ${c.projectName} में आपकी विज़िट कल, ${when} है।${meets}`,
        gu: `યાદ અપાવીએ: ${c.projectName} માં તમારી વિઝિટ આવતીકાલે, ${when} છે.${meets}`,
      }[lang] + `${pin}\n${f}`;
    case "reminder_2h":
      return {
        en: `See you in 2 hours at ${c.projectName} (${when}).`,
        hi: `2 घंटे में मिलते हैं: ${c.projectName} (${when})।`,
        gu: `2 કલાકમાં મળીએ: ${c.projectName} (${when}).`,
      }[lang] + `${pin}\n${f}`;
    case "handoff": {
      const who = c.executiveName;
      return {
        en: `Hi ${name}, I'm ${who ?? "from the sales team"} at ${c.projectName}. I've read your chat and will call you shortly.`,
        hi: `नमस्ते ${name}, मैं ${who ?? "सेल्स टीम"} हूँ, ${c.projectName} की ओर से। आपकी चैट मेरे पास है और हम जल्द ही आपसे संपर्क करेंगे।`,
        gu: `નમસ્તે ${name}, હું ${who ?? "સેલ્સ ટીમ"}, ${c.projectName} તરફથી. તમારી ચેટ મારી પાસે છે અને અમે ટૂંક સમયમાં તમારો સંપર્ક કરીશું.`,
      }[lang] + `\n${f}`;
    }
  }
}
