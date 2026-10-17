import "server-only";
import { cache } from "react";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { platformSettings, subscriptions } from "@/lib/db/schema";
import { todayISO } from "@/lib/accomplishment";
import { accessFor } from "@/lib/access";

export { accessFor, RENEWAL_WARNING_DAYS, type AccessState } from "@/lib/access";

/**
 * Billing model: one paid plan ("Pro", unlimited). Customers pay you outside the
 * app; a platform admin records the payment, which sets `paidUntil`.
 */
export const PLAN_NAME = "Pro";
export const getWorkspaceAccess = cache(async (workspaceId: string) => {
  const [sub] = await db
    .select({ status: subscriptions.status, paidUntil: subscriptions.paidUntil })
    .from(subscriptions)
    .where(eq(subscriptions.workspaceId, workspaceId))
    .limit(1);
  return accessFor(sub);
});

/** Called when a workspace is created: trial (TRIAL_DAYS > 0) or awaiting payment. */
export async function createInitialSubscription(workspaceId: string) {
  const trialDays = Math.max(0, Number(process.env.TRIAL_DAYS ?? 0) || 0);
  const today = todayISO();
  const [y, m, d] = today.split("-").map(Number);
  const trialEnd = new Date(Date.UTC(y, m - 1, d + trialDays)).toISOString().slice(0, 10);
  await db
    .insert(subscriptions)
    .values(
      trialDays > 0
        ? { workspaceId, status: "trial", paidUntil: trialEnd, note: `${trialDays}-day trial` }
        : { workspaceId, status: "pending" },
    )
    .onConflictDoNothing();
}

export function isSuperAdmin(email: string | null | undefined) {
  if (!email) return false;
  const admins = (process.env.SUPER_ADMIN_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  return admins.includes(email.toLowerCase());
}

export const getPlatformSettings = cache(async () => {
  const [row] = await db.select().from(platformSettings).where(eq(platformSettings.id, "platform")).limit(1);
  return row ?? { id: "platform", price: null, currency: "USD", billingPeriod: "month", paymentInstructions: null, contact: null };
});
