export { cn } from "cn"

export function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]!.toUpperCase())
    .join("");
}

/** Formats a decimal string/number as money, e.g. formatMoney("1500", "USD") -> "$1,500". */
export function formatMoney(amount: string | number | null | undefined, currency: string) {
  if (amount === null || amount === undefined || amount === "") return "—";
  const value = typeof amount === "string" ? Number(amount) : amount;
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency,
      // Whole amounts without decimals; otherwise always two (75,000.50, not 75,000.5).
      minimumFractionDigits: value % 1 === 0 ? 0 : 2,
      maximumFractionDigits: value % 1 === 0 ? 0 : 2,
    }).format(value);
  } catch {
    return `${value.toLocaleString()} ${currency}`;
  }
}

/** "2026-10-20" -> "Oct 20, 2026" (no timezone drift). */
export function formatDate(date: string | null | undefined) {
  if (!date) return "—";
  const [y, m, d] = date.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}
