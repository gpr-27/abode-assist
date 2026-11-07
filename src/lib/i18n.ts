import type { Lang } from "./assistant/guardrails";
import { BRAND } from "./brand";

export const LANGS: { code: Lang; label: string; short: string }[] = [
  { code: "en", label: "English", short: "EN" },
  { code: "hi", label: "हिंदी", short: "हिं" },
  { code: "gu", label: "ગુજરાતી", short: "ગુ" },
];

export function asLang(v: string | null | undefined): Lang {
  return v === "hi" || v === "gu" ? v : "en";
}

type Dict = {
  brand: string; heroTitle: string; heroSub: (places: string) => string; startChat: string; bookVisit: string; homes: string; from: string;
  possession: string; rera: string; viewProject: string; howTitle: string; how: [string, string][]; priceNote: string;
  privacy: string; staff: string; myVisits: string; talkToPerson: string; typeHere: string; send: string; chatTitle: string;
  nextSlots: string; noSlotsSoon: string; facts: string; directions: string; askAbout: string; chatOffline: string; retry: string;
  name: string; mobile: string; email: string; consent: string; saveDetails: string; pick: string; placesLeft: (n: number) => string;
  visitBooked: string; addToCalendar: string; openMap: string; handedTo: (n: string) => string; handedToTeam: string; moreTimes: string;
  morning: string; afternoon: string; evening: string; poweredNote: string; signIn: string;
};

export const T: Record<Lang, Dict> = {
  en: {
    brand: BRAND,
    heroTitle: "Ask about your next home, any hour. Visit when it suits you.",
    heroSub: (places) => `2 and 3 BHK homes in ${places}, Ahmedabad. Answers in English, हिंदी or ગુજરાતી, and site visits booked in real open slots.`,
    startChat: "Start a chat", bookVisit: "Book a site visit", homes: "Homes", from: "Indicative price", possession: "Possession", rera: "RERA Reg. No.",
    viewProject: "See the project",
    howTitle: "How a site visit works",
    how: [["Pick a time", "Choose any open slot in the chat. You only see times that are really free."], ["Get a confirmation", "A WhatsApp message with the address and map pin, then reminders a day and two hours before."], ["Meet your executive", "A named person from our team meets you and already knows what you are looking for."]],
    priceNote: "Prices are indicative ranges from our fact sheet. The final price for a specific home is confirmed only by our sales team. All details are as per the RERA registration.",
    privacy: "We contact you only with your consent and only about your enquiry. Every message has a link to stop messages.",
    staff: "Staff sign in", myVisits: "My visits", talkToPerson: "Talk to a person", typeHere: "Ask about homes, prices, visits…", send: "Send",
    chatTitle: "Chat with us", nextSlots: "Next open visit times", noSlotsSoon: "No open times in the next two weeks. Ask in the chat and our team will call you.",
    facts: "At a glance", directions: "Directions", askAbout: "Ask about this project", chatOffline: "The chat couldn't be reached. Check your connection and try again.", retry: "Try again",
    name: "Your name", mobile: "Mobile number", email: "E-mail (optional)", consent: "I agree to be contacted by Company A on WhatsApp, SMS or call about this enquiry. I can opt out any time.",
    saveDetails: "Save and continue", pick: "Pick a time", placesLeft: (n) => (n === 1 ? "1 place left" : `${n} places left`),
    visitBooked: "Site visit booked", addToCalendar: "Add to calendar", openMap: "Open map", handedTo: (n) => `${n} will contact you`, handedToTeam: "Our sales team will contact you",
    moreTimes: "More times", morning: "Morning", afternoon: "Afternoon", evening: "Evening",
    poweredNote: "Answers come from the developer's fact sheet. For anything not covered, a person will confirm.", signIn: "Sign in",
  },
  hi: {
    brand: BRAND,
    heroTitle: "अपने अगले घर के बारे में कभी भी पूछें। जब सुविधा हो, तब विज़िट करें।",
    heroSub: (places) => `${places}, अहमदाबाद में 2 और 3 BHK घर। English, हिंदी या ગુજરાતી में जवाब, और असली खाली समय में साइट विज़िट बुकिंग।`,
    startChat: "चैट शुरू करें", bookVisit: "साइट विज़िट बुक करें", homes: "घर", from: "अनुमानित कीमत", possession: "पज़ेशन", rera: "RERA रजि. नं.",
    viewProject: "प्रोजेक्ट देखें",
    howTitle: "साइट विज़िट कैसे होती है",
    how: [["समय चुनें", "चैट में कोई भी खाली समय चुनें। आपको केवल सच में खाली समय दिखते हैं।"], ["पुष्टि पाएँ", "पते और मैप पिन के साथ WhatsApp संदेश, फिर एक दिन और दो घंटे पहले रिमाइंडर।"], ["अपने एग्ज़िक्यूटिव से मिलें", "हमारी टीम का एक व्यक्ति आपसे मिलेगा, जिसे पहले से पता होगा कि आप क्या ढूँढ रहे हैं।"]],
    priceNote: "कीमतें हमारी फ़ैक्ट शीट से अनुमानित रेंज हैं। किसी घर की अंतिम कीमत केवल हमारी सेल्स टीम बताती है। सभी विवरण RERA पंजीकरण के अनुसार हैं।",
    privacy: "हम केवल आपकी सहमति से और केवल आपकी पूछताछ के बारे में संपर्क करते हैं। हर संदेश में संदेश बंद करने का लिंक होता है।",
    staff: "स्टाफ़ साइन इन", myVisits: "मेरी विज़िट", talkToPerson: "किसी व्यक्ति से बात करें", typeHere: "घर, कीमत, विज़िट के बारे में पूछें…", send: "भेजें",
    chatTitle: "हमसे चैट करें", nextSlots: "अगले खाली विज़िट समय", noSlotsSoon: "अगले दो हफ़्तों में कोई खाली समय नहीं। चैट में पूछें, हमारी टीम कॉल करेगी।",
    facts: "एक नज़र में", directions: "रास्ता", askAbout: "इस प्रोजेक्ट के बारे में पूछें", chatOffline: "चैट से जुड़ नहीं पाए। कनेक्शन जाँचें और फिर कोशिश करें।", retry: "फिर कोशिश करें",
    name: "आपका नाम", mobile: "मोबाइल नंबर", email: "ई-मेल (वैकल्पिक)", consent: "मैं इस पूछताछ के बारे में Company A से WhatsApp, SMS या कॉल पर संपर्क के लिए सहमत हूँ। मैं कभी भी मना कर सकता/सकती हूँ।",
    saveDetails: "सेव करें और आगे बढ़ें", pick: "समय चुनें", placesLeft: (n) => `${n} जगह बाकी`,
    visitBooked: "साइट विज़िट बुक हो गई", addToCalendar: "कैलेंडर में जोड़ें", openMap: "मैप खोलें", handedTo: (n) => `${n} आपसे संपर्क करेंगे`, handedToTeam: "हमारी सेल्स टीम संपर्क करेगी",
    moreTimes: "और समय", morning: "सुबह", afternoon: "दोपहर", evening: "शाम",
    poweredNote: "जवाब डेवलपर की फ़ैक्ट शीट से आते हैं। जो इसमें नहीं है, वह एक व्यक्ति पुष्टि करेगा।", signIn: "साइन इन",
  },
  gu: {
    brand: BRAND,
    heroTitle: "તમારા આગલા ઘર વિશે ગમે ત્યારે પૂછો. અનુકૂળ હોય ત્યારે મુલાકાત લો.",
    heroSub: (places) => `${places}, અમદાવાદમાં 2 અને 3 BHK ઘરો. English, हिंदी કે ગુજરાતીમાં જવાબ, અને સાચા ખાલી સમયમાં સાઇટ વિઝિટ બુકિંગ.`,
    startChat: "ચેટ શરૂ કરો", bookVisit: "સાઇટ વિઝિટ બુક કરો", homes: "ઘરો", from: "અંદાજિત કિંમત", possession: "પઝેશન", rera: "RERA રજિ. નં.",
    viewProject: "પ્રોજેક્ટ જુઓ",
    howTitle: "સાઇટ વિઝિટ કેવી રીતે થાય છે",
    how: [["સમય પસંદ કરો", "ચેટમાં કોઈ પણ ખાલી સમય પસંદ કરો. તમને ફક્ત ખરેખર ખાલી સમય જ દેખાય છે."], ["પુષ્ટિ મેળવો", "સરનામું અને મેપ પિન સાથે WhatsApp સંદેશ, પછી એક દિવસ અને બે કલાક પહેલાં રિમાઇન્ડર."], ["તમારા એક્ઝિક્યુટિવને મળો", "અમારી ટીમની એક વ્યક્તિ તમને મળશે, જેને પહેલેથી ખબર હશે કે તમે શું શોધો છો."]],
    priceNote: "કિંમતો અમારી ફેક્ટ શીટમાંથી અંદાજિત શ્રેણી છે. કોઈ ઘરની અંતિમ કિંમત ફક્ત અમારી સેલ્સ ટીમ જણાવે છે. બધી વિગતો RERA નોંધણી મુજબ છે.",
    privacy: "અમે ફક્ત તમારી સંમતિથી અને ફક્ત તમારી પૂછપરછ વિશે સંપર્ક કરીએ છીએ. દરેક સંદેશમાં સંદેશા બંધ કરવાની લિંક હોય છે.",
    staff: "સ્ટાફ સાઇન ઇન", myVisits: "મારી વિઝિટ", talkToPerson: "કોઈ વ્યક્તિ સાથે વાત કરો", typeHere: "ઘર, કિંમત, વિઝિટ વિશે પૂછો…", send: "મોકલો",
    chatTitle: "અમારી સાથે ચેટ કરો", nextSlots: "આગળના ખાલી વિઝિટ સમય", noSlotsSoon: "આગળના બે અઠવાડિયામાં કોઈ ખાલી સમય નથી. ચેટમાં પૂછો, અમારી ટીમ કૉલ કરશે.",
    facts: "એક નજરમાં", directions: "રસ્તો", askAbout: "આ પ્રોજેક્ટ વિશે પૂછો", chatOffline: "ચેટ સાથે જોડાઈ શક્યા નહીં. કનેક્શન તપાસો અને ફરી પ્રયાસ કરો.", retry: "ફરી પ્રયાસ કરો",
    name: "તમારું નામ", mobile: "મોબાઇલ નંબર", email: "ઈ-મેલ (વૈકલ્પિક)", consent: "હું આ પૂછપરછ વિશે Company A દ્વારા WhatsApp, SMS કે કૉલ પર સંપર્ક માટે સંમત છું. હું ગમે ત્યારે ના પાડી શકું છું.",
    saveDetails: "સેવ કરો અને આગળ વધો", pick: "સમય પસંદ કરો", placesLeft: (n) => `${n} જગ્યા બાકી`,
    visitBooked: "સાઇટ વિઝિટ બુક થઈ", addToCalendar: "કૅલેન્ડરમાં ઉમેરો", openMap: "મેપ ખોલો", handedTo: (n) => `${n} તમારો સંપર્ક કરશે`, handedToTeam: "અમારી સેલ્સ ટીમ સંપર્ક કરશે",
    moreTimes: "વધુ સમય", morning: "સવાર", afternoon: "બપોર", evening: "સાંજ",
    poweredNote: "જવાબો ડેવલપરની ફેક્ટ શીટમાંથી આવે છે. જે તેમાં નથી, તે એક વ્યક્તિ પુષ્ટિ કરશે.", signIn: "સાઇન ઇન",
  },
};
