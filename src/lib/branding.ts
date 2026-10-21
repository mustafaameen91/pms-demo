/** Company letterhead rules (pure). */

export const PAPER_STYLES = [
  { value: "classic", label: "Classic", hint: "Formal letterhead: centred logo, double rule, framed page." },
  { value: "modern", label: "Modern", hint: "A band in your brand colour across the top." },
  { value: "minimal", label: "Minimal", hint: "Clean and quiet: small logo, lots of white space." },
] as const;
export type PaperStyle = (typeof PAPER_STYLES)[number]["value"];
export const isPaperStyle = (v: unknown): v is PaperStyle => PAPER_STYLES.some((s) => s.value === v);

export const DOCUMENT_LANGUAGES = ["ar", "en"] as const;
export type DocumentLanguage = (typeof DOCUMENT_LANGUAGES)[number];

/** A few safe starting points; any colour can be typed in. */
export const BRAND_SWATCHES = ["#0D9488", "#1D4ED8", "#B91C1C", "#B45309", "#15803D", "#7C3AED", "#0F172A", "#9D174D"];

export const isHexColor = (v: unknown): v is string => typeof v === "string" && /^#[0-9a-fA-F]{6}$/.test(v);

/** WCAG relative luminance of "#RRGGBB". */
export function luminance(hex: string) {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export const contrastRatio = (a: string, b: string) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

/** Text colour that reads best on the brand colour (for the Modern band). */
export const textOn = (hex: string) => (contrastRatio(hex, "#FFFFFF") >= contrastRatio(hex, "#111827") ? "#FFFFFF" : "#111827");

/** The brand colour, darkened until it is readable as text on white (AA, 4.5:1). */
export function readableOnWhite(hex: string) {
  let [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  for (let i = 0; i < 20 && contrastRatio(toHex(r, g, b), "#FFFFFF") < 4.5; i++) [r, g, b] = [r, g, b].map((c) => Math.round(c * 0.85));
  return toHex(r, g, b);
}
const toHex = (...c: number[]) => `#${c.map((v) => v.toString(16).padStart(2, "0")).join("")}`.toUpperCase();

export type CompanyProfile = {
  nameEn: string;
  nameAr: string;
  addressEn: string | null;
  addressAr: string | null;
  phone: string | null;
  email: string | null;
  website: string | null;
  registrationNo: string | null;
  taxNo: string | null;
  footerEn: string | null;
  footerAr: string | null;
  brandColor: string;
  /** URLs to show the images, or null. */
  logoUrl: string | null;
  stampUrl: string | null;
  defaultStyle: PaperStyle;
  defaultLanguage: DocumentLanguage;
};

/** The profile's text in one language, falling back to the other when a field is empty. */
export function inLanguage(p: CompanyProfile, lang: DocumentLanguage) {
  const pick = (ar: string | null, en: string | null) => (lang === "ar" ? ar || en : en || ar) || null;
  return {
    name: pick(p.nameAr, p.nameEn) ?? "",
    address: pick(p.addressAr, p.addressEn),
    footer: pick(p.footerAr, p.footerEn),
  };
}

/**
 * Labels printed on the paper itself. They follow the document's language,
 * not the reader's screen language (an Arabic contract stays Arabic).
 */
export const PAPER_LABELS = {
  en: { registration: "Reg. No.", tax: "Tax No.", phone: "Tel", page: "Page" },
  ar: { registration: "رقم التسجيل", tax: "الرقم الضريبي", phone: "هاتف", page: "صفحة" },
} as const;
