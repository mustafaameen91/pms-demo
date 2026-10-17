/** Workspace access rules for the paid plan (pure, shared by server and tests). */
import { todayISO } from "@/lib/accomplishment";
import { daysBetween } from "@/lib/schedule";

/** Warn this many days before the paid period ends. */
export const RENEWAL_WARNING_DAYS = 7;

export type AccessState =
  | { allowed: true; kind: "complimentary" }
  | { allowed: true; kind: "active" | "trial"; paidUntil: string; daysLeft: number; endingSoon: boolean }
  | { allowed: false; kind: "pending" | "expired" | "cancelled"; paidUntil: string | null };

export function accessFor(
  sub: { status: string; paidUntil: string | null } | null | undefined,
  today = todayISO(),
): AccessState {
  if (!sub) return { allowed: false, kind: "pending", paidUntil: null };
  if (sub.status === "cancelled") return { allowed: false, kind: "cancelled", paidUntil: sub.paidUntil };
  if (sub.status === "pending") return { allowed: false, kind: "pending", paidUntil: sub.paidUntil };
  if (sub.paidUntil === null) {
    return sub.status === "active" ? { allowed: true, kind: "complimentary" } : { allowed: false, kind: "pending", paidUntil: null };
  }
  const daysLeft = daysBetween(today, sub.paidUntil);
  if (daysLeft < 0) return { allowed: false, kind: "expired", paidUntil: sub.paidUntil };
  return {
    allowed: true,
    kind: sub.status === "trial" ? "trial" : "active",
    paidUntil: sub.paidUntil,
    daysLeft,
    endingSoon: daysLeft <= RENEWAL_WARNING_DAYS,
  };
}
