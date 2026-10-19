export { cn } from "cn"

export function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]!.toUpperCase())
    .join("");
}

/**
 * Formatting helpers take the Intl locale (`t.intl` from useT()/getT()) so the
 * server and the browser format the same way; English when omitted.
 */
const EN = "en-US";

/** Formats a decimal string/number as money, e.g. formatMoney("1500", "USD") -> "$1,500". */
export function formatMoney(amount: string | number | null | undefined, currency: string, locale = EN) {
  if (amount === null || amount === undefined || amount === "") return "—";
  const value = typeof amount === "string" ? Number(amount) : amount;
  try {
    const text = new Intl.NumberFormat(locale, {
      style: "currency",
      currency,
      // Whole amounts without decimals; otherwise always two (75,000.50, not 75,000.5).
      minimumFractionDigits: value % 1 === 0 ? 0 : 2,
      maximumFractionDigits: value % 1 === 0 ? 0 : 2,
    }).format(value);
    // Arabic: a Latin symbol (US$) would be split by the text direction ("$US 0"), so keep that amount
    // left-to-right in one piece; Arabic symbols (د.ع.) already read correctly.
    return locale.startsWith("ar") && !/[\u0600-\u06FF]/.test(text) ? `\u2066${text.replace(/\u200F/g, "")}\u2069` : text;
  } catch {
    return `${value.toLocaleString(locale)} ${currency}`;
  }
}

/** "2026-10-20" -> "Oct 20, 2026" (no timezone drift). */
export function formatDate(date: string | null | undefined, locale = EN) {
  if (!date) return "—";
  const [y, m, d] = date.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(locale, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

/** A number with grouping, e.g. 1,500.25. */
export function formatNumber(value: number | string, locale = EN, maximumFractionDigits = 2) {
  return Number(value).toLocaleString(locale, { maximumFractionDigits });
}

/** A moment in time, e.g. "Oct 19, 2026, 3:29 PM". */
export function formatDateTime(date: Date | string, locale = EN) {
  return new Date(date).toLocaleString(locale, { dateStyle: "medium", timeStyle: "short" });
}

/** "just now", "5 minutes ago", "3 days ago", then a date. Pass `justNow` translated: t("just now"). */
export function timeAgo(date: Date | string, locale = EN, justNow = "just now") {
  const d = new Date(date);
  const seconds = Math.round((Date.now() - d.getTime()) / 1000);
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });
  if (seconds < 60) return justNow;
  if (seconds < 3600) return rtf.format(-Math.round(seconds / 60), "minute");
  if (seconds < 86400) return rtf.format(-Math.round(seconds / 3600), "hour");
  if (seconds < 7 * 86400) return rtf.format(-Math.round(seconds / 86400), "day");
  return d.toLocaleDateString(locale, { month: "short", day: "numeric", year: "numeric" });
}
