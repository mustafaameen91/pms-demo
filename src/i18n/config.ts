/** Languages the app is available in. English is the source language. */
export const LOCALES = ["en", "ar"] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = "en";
export const LOCALE_COOKIE = "locale";

export const LOCALE_NAMES: Record<Locale, string> = { en: "English", ar: "العربية" };

export const isLocale = (v: unknown): v is Locale => LOCALES.includes(v as Locale);
export const dirOf = (locale: Locale) => (locale === "ar" ? "rtl" : "ltr");

/** Locale for Intl formatting. Arabic keeps Latin digits (1,500 not ١٬٥٠٠) for amounts, %, and task IDs. */
export const intlLocale = (locale: Locale) => (locale === "ar" ? "ar-u-nu-latn" : "en-US");

/** Best match from an Accept-Language header. */
export function localeFromHeader(header: string | null | undefined): Locale {
  for (const part of (header ?? "").split(",")) {
    const tag = part.split(";")[0].trim().toLowerCase();
    if (tag.startsWith("ar")) return "ar";
    if (tag.startsWith("en")) return "en";
  }
  return DEFAULT_LOCALE;
}
