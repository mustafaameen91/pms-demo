/**
 * Amounts in words for vouchers, contracts and invoices (pure).
 * Arabic follows the usual commercial form: "فقط … دينار عراقي لا غير".
 */

const CURRENCY_NAMES: Record<string, { en: [string, string]; ar: string; minor: { en: string; ar: string; per: number } }> = {
  IQD: { en: ["Iraqi dinar", "Iraqi dinars"], ar: "دينار عراقي", minor: { en: "fils", ar: "فلس", per: 1000 } },
  USD: { en: ["US dollar", "US dollars"], ar: "دولار أمريكي", minor: { en: "cents", ar: "سنت", per: 100 } },
  EUR: { en: ["euro", "euros"], ar: "يورو", minor: { en: "cents", ar: "سنت", per: 100 } },
  GBP: { en: ["pound sterling", "pounds sterling"], ar: "جنيه إسترليني", minor: { en: "pence", ar: "بنس", per: 100 } },
  SAR: { en: ["Saudi riyal", "Saudi riyals"], ar: "ريال سعودي", minor: { en: "halalas", ar: "هللة", per: 100 } },
  AED: { en: ["UAE dirham", "UAE dirhams"], ar: "درهم إماراتي", minor: { en: "fils", ar: "فلس", per: 100 } },
  KWD: { en: ["Kuwaiti dinar", "Kuwaiti dinars"], ar: "دينار كويتي", minor: { en: "fils", ar: "فلس", per: 1000 } },
  QAR: { en: ["Qatari riyal", "Qatari riyals"], ar: "ريال قطري", minor: { en: "dirhams", ar: "درهم", per: 100 } },
  JOD: { en: ["Jordanian dinar", "Jordanian dinars"], ar: "دينار أردني", minor: { en: "fils", ar: "فلس", per: 1000 } },
  EGP: { en: ["Egyptian pound", "Egyptian pounds"], ar: "جنيه مصري", minor: { en: "piastres", ar: "قرش", per: 100 } },
  TRY: { en: ["Turkish lira", "Turkish lira"], ar: "ليرة تركية", minor: { en: "kuruş", ar: "قرش", per: 100 } },
};

// --- English ---

const EN_ONES = ["", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen", "nineteen"];
const EN_TENS = ["", "", "twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety"];
const EN_SCALES = ["", "thousand", "million", "billion", "trillion"];

function enBelowThousand(n: number) {
  const parts: string[] = [];
  if (n >= 100) {
    parts.push(`${EN_ONES[Math.floor(n / 100)]} hundred`);
    n %= 100;
  }
  if (n >= 20) parts.push(EN_TENS[Math.floor(n / 10)] + (n % 10 ? `-${EN_ONES[n % 10]}` : ""));
  else if (n > 0) parts.push(EN_ONES[n]);
  return parts.join(" ");
}

export function numberToEnglish(n: number): string {
  if (n === 0) return "zero";
  const groups: string[] = [];
  for (let scale = 0; n > 0; scale++, n = Math.floor(n / 1000)) {
    const chunk = n % 1000;
    if (chunk) groups.unshift([enBelowThousand(chunk), EN_SCALES[scale]].filter(Boolean).join(" "));
  }
  return groups.join(" ");
}

// --- Arabic ---

const AR_ONES = ["", "واحد", "اثنان", "ثلاثة", "أربعة", "خمسة", "ستة", "سبعة", "ثمانية", "تسعة"];
const AR_TEENS = ["عشرة", "أحد عشر", "اثنا عشر", "ثلاثة عشر", "أربعة عشر", "خمسة عشر", "ستة عشر", "سبعة عشر", "ثمانية عشر", "تسعة عشر"];
const AR_TENS = ["", "", "عشرون", "ثلاثون", "أربعون", "خمسون", "ستون", "سبعون", "ثمانون", "تسعون"];
const AR_HUNDREDS = ["", "مائة", "مائتان", "ثلاثمائة", "أربعمائة", "خمسمائة", "ستمائة", "سبعمائة", "ثمانمائة", "تسعمائة"];
/** [one, two, 3–10 plural, 11–99 accusative singular, 100+ singular] */
const AR_SCALES: [string, string, string, string, string][] = [
  ["", "", "", "", ""],
  ["ألف", "ألفان", "آلاف", "ألفًا", "ألف"],
  ["مليون", "مليونان", "ملايين", "مليونًا", "مليون"],
  ["مليار", "ملياران", "مليارات", "مليارًا", "مليار"],
  ["تريليون", "تريليونان", "تريليونات", "تريليونًا", "تريليون"],
];

function arBelowThousand(n: number) {
  const parts: string[] = [];
  if (n >= 100) {
    parts.push(AR_HUNDREDS[Math.floor(n / 100)]);
    n %= 100;
  }
  if (n >= 20) parts.push(n % 10 ? `${AR_ONES[n % 10]} و${AR_TENS[Math.floor(n / 10)]}` : AR_TENS[Math.floor(n / 10)]);
  else if (n >= 10) parts.push(AR_TEENS[n - 10]);
  else if (n > 0) parts.push(AR_ONES[n]);
  return parts.join(" و");
}

function arGroup(chunk: number, scale: number) {
  if (scale === 0) return arBelowThousand(chunk);
  const [one, two, few, many, hundredPlus] = AR_SCALES[scale];
  if (chunk === 1) return one;
  if (chunk === 2) return two;
  if (chunk <= 10) return `${arBelowThousand(chunk)} ${few}`;
  const last2 = chunk % 100;
  // "مائتان" shortens to "مائتا" right before the scale word (مائتا ألف).
  const words = last2 === 0 && Math.floor(chunk / 100) === 2 ? "مائتا" : arBelowThousand(chunk);
  return `${words} ${last2 >= 11 ? many : last2 >= 3 ? few : hundredPlus}`;
}

export function numberToArabic(n: number): string {
  if (n === 0) return "صفر";
  const groups: string[] = [];
  for (let scale = 0; n > 0; scale++, n = Math.floor(n / 1000)) {
    const chunk = n % 1000;
    if (chunk) groups.unshift(arGroup(chunk, scale));
  }
  return groups.join(" و");
}

// --- Money ---

/**
 * "One million five hundred thousand Iraqi dinars only" /
 * "فقط مليون وخمسمائة ألف دينار عراقي لا غير".
 */
export function amountInWords(amount: number | string, currency: string, lang: "en" | "ar") {
  const value = Math.abs(Number(amount));
  const c = CURRENCY_NAMES[currency];
  const whole = Math.floor(value + 1e-9);
  // Fractions are kept to 2 decimals in the app; express them in the minor unit.
  const minor = c ? Math.round((value - whole) * c.minor.per) : Math.round((value - whole) * 100);
  if (lang === "ar") {
    const name = c?.ar ?? currency;
    const minorPart = minor ? ` و${numberToArabic(minor)} ${c?.minor.ar ?? ""}`.trimEnd() : "";
    return `فقط ${numberToArabic(whole)} ${name}${minorPart} لا غير`;
  }
  const name = c ? c.en[whole === 1 ? 0 : 1] : currency;
  const minorPart = minor ? ` and ${numberToEnglish(minor)} ${c?.minor.en ?? ""}`.trimEnd() : "";
  const text = `${numberToEnglish(whole)} ${name}${minorPart} only`;
  return text.charAt(0).toUpperCase() + text.slice(1);
}
