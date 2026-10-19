import "server-only";
import { cache } from "react";
import { cookies, headers } from "next/headers";
import { DEFAULT_LOCALE, LOCALE_COOKIE, isLocale, localeFromHeader, type Locale } from "./config";
import { createT, type T } from "./translate";
import { ar } from "./ar";

/** Dictionary for a language (English needs none: the text is the key). */
export const dictionaryFor = (locale: Locale) => (locale === "ar" ? ar : {});

/** Translator for a given language, e.g. a notification recipient's. */
export function tFor(locale: string | null | undefined): T {
  const l = isLocale(locale) ? locale : DEFAULT_LOCALE;
  return createT(l, dictionaryFor(l));
}

/** This request's language: the visitor's choice (cookie), else their browser's language. */
export const getLocale = cache(async (): Promise<Locale> => {
  const chosen = (await cookies()).get(LOCALE_COOKIE)?.value;
  if (isLocale(chosen)) return chosen;
  return localeFromHeader((await headers()).get("accept-language"));
});

/** Translator for this request (server components, server actions, route handlers). */
export const getT = cache(async () => tFor(await getLocale()));
