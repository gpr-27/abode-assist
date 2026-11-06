import type { Lang } from "./guardrails";

/** Deterministic assistant lines used after button actions and in fallback mode. */
export const COPY: Record<Lang, {
  greeting: string;
  slotsIntro: (project: string) => string;
  noSlots: string;
  needContact: (slot?: string | null) => string;
  booked: (project: string, when: string) => string;
  rescheduled: (project: string, when: string) => string;
  alreadyBooked: (when: string) => string;
  bookFailed: (msg: string) => string;
  contactSaved: string;
  contactInvalid: string;
  consentRequired: string;
  pickProject: string;
  handoffWithName: (name: string) => string;
  handoffNoContact: string;
}> = {
  en: {
    greeting: "Hello, and welcome. I can answer questions about our homes and book a site visit for you. Which project would you like to know about?",
    slotsIntro: (p) => `Here are the next open visit times at ${p}. Tap one to hold it.`,
    noSlots: "There are no open visit times in the next two weeks. I've asked our team to call you with a time that suits you.",
    needContact: (s) => `${s ? `To hold ${s} for you, ` : "To confirm your visit, "}I need your name and mobile number. We'll only use them for this enquiry.`,
    booked: (p, w) => `Your visit to ${p} is booked for ${w}. We'll send a reminder a day before and two hours before.`,
    rescheduled: (p, w) => `Done. Your visit to ${p} has moved to ${w}. Reminders are updated.`,
    alreadyBooked: (w) => `You already hold ${w}. Nothing changed.`,
    bookFailed: (m) => `${m} Here are the next open times.`,
    contactSaved: "Thank you, your details are saved.",
    contactInvalid: "That mobile number doesn't look right. Please enter a 10-digit Indian mobile number.",
    consentRequired: "Please tick the consent box so we're allowed to contact you about your visit.",
    pickProject: "Which project would you like to visit?",
    handoffWithName: (n) => `${n} from our sales team will contact you shortly. They can see this chat, so you won't need to repeat yourself.`,
    handoffNoContact: "Happy to connect you with our sales team. Please share your name and number so the right person can call you.",
  },
  hi: {
    greeting: "नमस्ते, स्वागत है। मैं हमारे घरों के बारे में सवालों के जवाब दे सकता हूँ और आपके लिए साइट विज़िट बुक कर सकता हूँ। आप किस प्रोजेक्ट के बारे में जानना चाहेंगे?",
    slotsIntro: (p) => `${p} में अगले खाली विज़िट समय ये हैं। किसी एक पर टैप करें।`,
    noSlots: "अगले दो हफ़्तों में कोई खाली समय नहीं है। हमारी टीम आपको आपकी सुविधा के समय के लिए कॉल करेगी।",
    needContact: (s) => `${s ? `${s} आपके लिए रोकने के लिए ` : "विज़िट पक्की करने के लिए "}मुझे आपका नाम और मोबाइल नंबर चाहिए। इनका उपयोग केवल इसी पूछताछ के लिए होगा।`,
    booked: (p, w) => `${p} में आपकी विज़िट ${w} के लिए बुक हो गई है। हम एक दिन पहले और दो घंटे पहले रिमाइंडर भेजेंगे।`,
    rescheduled: (p, w) => `हो गया। ${p} में आपकी विज़िट अब ${w} पर है। रिमाइंडर अपडेट कर दिए गए हैं।`,
    alreadyBooked: (w) => `आपके पास पहले से ${w} बुक है। कुछ नहीं बदला।`,
    bookFailed: (m) => `${m} अगले खाली समय ये हैं।`,
    contactSaved: "धन्यवाद, आपकी जानकारी सेव हो गई है।",
    contactInvalid: "यह मोबाइल नंबर सही नहीं लगता। कृपया 10 अंकों का भारतीय मोबाइल नंबर डालें।",
    consentRequired: "कृपया सहमति वाला बॉक्स टिक करें, ताकि हम आपकी विज़िट के बारे में संपर्क कर सकें।",
    pickProject: "आप कौन-सा प्रोजेक्ट देखना चाहेंगे?",
    handoffWithName: (n) => `हमारी सेल्स टीम से ${n} जल्द ही आपसे संपर्क करेंगे। वे यह चैट देख सकते हैं, इसलिए आपको दोबारा कुछ बताना नहीं पड़ेगा।`,
    handoffNoContact: "मैं आपको हमारी सेल्स टीम से जोड़ देता हूँ। कृपया अपना नाम और नंबर दें ताकि सही व्यक्ति आपको कॉल कर सके।",
  },
  gu: {
    greeting: "નમસ્તે, સ્વાગત છે. હું અમારા ઘરો વિશેના પ્રશ્નોના જવાબ આપી શકું છું અને તમારા માટે સાઇટ વિઝિટ બુક કરી શકું છું. તમે કયા પ્રોજેક્ટ વિશે જાણવા માંગો છો?",
    slotsIntro: (p) => `${p} માં આગળના ખાલી વિઝિટ સમય આ છે. કોઈ એક પર ટૅપ કરો.`,
    noSlots: "આગળના બે અઠવાડિયામાં કોઈ ખાલી સમય નથી. અમારી ટીમ તમારી અનુકૂળતાના સમય માટે તમને કૉલ કરશે.",
    needContact: (s) => `${s ? `${s} તમારા માટે રાખવા ` : "વિઝિટ પાકી કરવા "}મને તમારું નામ અને મોબાઇલ નંબર જોઈએ. તેનો ઉપયોગ ફક્ત આ પૂછપરછ માટે થશે.`,
    booked: (p, w) => `${p} માં તમારી વિઝિટ ${w} માટે બુક થઈ ગઈ છે. અમે એક દિવસ પહેલાં અને બે કલાક પહેલાં રિમાઇન્ડર મોકલીશું.`,
    rescheduled: (p, w) => `થઈ ગયું. ${p} માં તમારી વિઝિટ હવે ${w} પર છે. રિમાઇન્ડર અપડેટ થઈ ગયા છે.`,
    alreadyBooked: (w) => `તમારી પાસે પહેલેથી ${w} બુક છે. કંઈ બદલાયું નથી.`,
    bookFailed: (m) => `${m} આગળના ખાલી સમય આ છે.`,
    contactSaved: "આભાર, તમારી વિગતો સેવ થઈ ગઈ છે.",
    contactInvalid: "આ મોબાઇલ નંબર સાચો લાગતો નથી. કૃપા કરીને 10 અંકનો ભારતીય મોબાઇલ નંબર લખો.",
    consentRequired: "કૃપા કરીને સંમતિનું બૉક્સ ટિક કરો, જેથી અમે તમારી વિઝિટ વિશે સંપર્ક કરી શકીએ.",
    pickProject: "તમે કયો પ્રોજેક્ટ જોવા માંગો છો?",
    handoffWithName: (n) => `અમારી સેલ્સ ટીમમાંથી ${n} ટૂંક સમયમાં તમારો સંપર્ક કરશે. તેઓ આ ચેટ જોઈ શકે છે, તેથી તમારે ફરી કંઈ કહેવું નહીં પડે.`,
    handoffNoContact: "હું તમને અમારી સેલ્સ ટીમ સાથે જોડી આપું. કૃપા કરીને તમારું નામ અને નંબર આપો જેથી યોગ્ય વ્યક્તિ તમને કૉલ કરી શકે.",
  },
};

export const LOCALE: Record<Lang, string> = { en: "en-IN", hi: "hi-IN", gu: "gu-IN" };
