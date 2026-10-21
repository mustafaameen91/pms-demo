/**
 * Translation (pure, works on server and client).
 *
 * The English text itself is the key: `t("Add task")`. English needs no
 * dictionary; Arabic looks the text up and falls back to English when a
 * string is missing. Variables use {braces}: `t("Assigned {ref} to {name}", { ref, name })`.
 * Plurals: `t.plural(n, "{count} task", "{count} tasks")` — the Arabic entry is
 * keyed by the English plural and lists Arabic's forms (zero/one/two/few/many/other).
 */
import { intlLocale, type Locale } from "./config";

export type PluralForms = Partial<Record<Intl.LDMLPluralRule, string>> & { other: string };
export type Dictionary = Record<string, string | PluralForms>;
type Vars = Record<string, string | number | null | undefined>;

export type T = {
  (text: string, vars?: Vars): string;
  plural: (count: number, one: string, other: string, vars?: Vars) => string;
  locale: Locale;
  /** Locale string for Intl / toLocaleString. */
  intl: string;
};

function fill(text: string, vars: Vars | undefined, intl: string) {
  if (!vars) return text;
  return text.replace(/\{(\w+)\}/g, (match, name: string) => {
    const v = vars[name];
    if (v === undefined || v === null) return match;
    return typeof v === "number" ? v.toLocaleString(intl) : v;
  });
}

/**
 * "Open|risk" → "Open". A "|context" suffix gives the same English word its own
 * key when another language needs a different word (e.g. a button vs a status).
 */
const withoutContext = (text: string) => {
  const bar = text.indexOf("|");
  return bar === -1 ? text : text.slice(0, bar);
};

export function createT(locale: Locale, dict: Dictionary): T {
  const intl = intlLocale(locale);
  const t = ((text: string, vars?: Vars) => {
    const hit = locale === "en" ? undefined : dict[text];
    return fill(typeof hit === "string" ? hit : withoutContext(text), vars, intl);
  }) as T;
  const rules = new Intl.PluralRules(intl);
  t.plural = (count, one, other, vars) => {
    const all = { count, ...vars };
    if (locale === "en") return fill(count === 1 ? one : other, all, intl);
    const hit = dict[other];
    if (hit && typeof hit === "object") return fill(hit[rules.select(count)] ?? hit.other, all, intl);
    return fill(typeof hit === "string" ? hit : count === 1 ? one : other, all, intl);
  };
  t.locale = locale;
  t.intl = intl;
  return t;
}
