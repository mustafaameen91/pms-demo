/**
 * Arabic → Latin letters, for things that must stay Latin (project keys like
 * "MA-12", workspace web addresses). Approximate on purpose: "محطة الضخ" → "mhth aldkh".
 */
const MAP: Record<string, string> = {
  ا: "a", أ: "a", إ: "i", آ: "a", ء: "", ؤ: "w", ئ: "y", ب: "b", ت: "t", ث: "th", ج: "j", ح: "h", خ: "kh",
  د: "d", ذ: "dh", ر: "r", ز: "z", س: "s", ش: "sh", ص: "s", ض: "d", ط: "t", ظ: "z", ع: "a", غ: "gh",
  ف: "f", ق: "q", ك: "k", ل: "l", م: "m", ن: "n", ه: "h", ة: "h", و: "w", ي: "y", ى: "a",
  پ: "p", چ: "ch", ژ: "zh", گ: "g", ک: "k", ی: "y",
  "٠": "0", "١": "1", "٢": "2", "٣": "3", "٤": "4", "٥": "5", "٦": "6", "٧": "7", "٨": "8", "٩": "9",
};

export function toLatin(text: string) {
  return text
    .replace(/[ً-ْـ]/g, "") // vowel marks and tatweel
    .replace(/./gu, (ch) => MAP[ch] ?? ch);
}
