"use server";

import { notFound } from "next/navigation";
import { refresh } from "next/cache";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { requireUser } from "@/lib/auth/session";
import { isSuperAdmin } from "@/lib/billing";
import { db } from "@/lib/db";
import { activities, organization, payments, platformSettings, subscriptions } from "@/lib/db/schema";
import { CURRENCIES } from "@/lib/constants";
import { todayISO } from "@/lib/accomplishment";
import { MAX_MONEY, optionalDecimal } from "@/lib/validation";

type Result = { ok: true } | { ok: false; error: string; fieldErrors?: Record<string, string> };

/** Platform admins only; everyone else gets a 404, so the page isn't advertised. */
async function requireSuperAdmin() {
  const user = await requireUser();
  if (!isSuperAdmin(user.email)) notFound();
  return user;
}

function fail(error: z.ZodError): Result {
  const fieldErrors: Record<string, string> = {};
  for (const issue of error.issues) fieldErrors[String(issue.path[0])] ??= issue.message;
  return { ok: false, error: error.issues[0].message, fieldErrors };
}

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Choose a date");

const paymentSchema = z.object({
  workspaceId: z.string().min(1),
  amount: optionalDecimal(MAX_MONEY, "Enter a valid amount").refine((v) => v !== null && Number(v) > 0, "Enter an amount"),
  currency: z.enum(CURRENCIES),
  method: z.string().trim().min(1, "Choose a method").max(40),
  reference: z.string().trim().max(120).optional().transform((v) => v || null),
  note: z.string().trim().max(500).optional().transform((v) => v || null),
  coversUntil: isoDate,
});

/** Records a payment received outside the app and extends the workspace to `coversUntil`. */
export async function recordPayment(input: z.input<typeof paymentSchema>): Promise<Result> {
  const admin = await requireSuperAdmin();
  const parsed = paymentSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error);
  const d = parsed.data;
  if (d.coversUntil < todayISO()) return { ok: false, error: "Paid-until date is in the past", fieldErrors: { coversUntil: "Must be today or later" } };

  const [ws] = await db.select({ id: organization.id }).from(organization).where(eq(organization.id, d.workspaceId)).limit(1);
  if (!ws) return { ok: false, error: "Workspace not found" };

  await db.transaction(async (tx) => {
    await tx.insert(payments).values({ ...d, amount: d.amount!, recordedById: admin.id });
    await tx
      .insert(subscriptions)
      .values({ workspaceId: d.workspaceId, status: "active", paidUntil: d.coversUntil })
      .onConflictDoUpdate({
        target: subscriptions.workspaceId,
        set: { status: "active", paidUntil: d.coversUntil },
      });
    await tx.insert(activities).values({
      workspaceId: d.workspaceId,
      actorId: admin.id,
      type: "subscription.payment_recorded",
      data: { amount: d.amount, currency: d.currency, method: d.method, coversUntil: d.coversUntil },
    });
  });
  refresh();
  return { ok: true };
}

const statusSchema = z.object({
  workspaceId: z.string().min(1),
  action: z.enum(["complimentary", "cancel", "pending"]),
});

/** Manual status changes: give free access, lock (cancel), or reset to awaiting payment. */
export async function setSubscriptionStatus(input: z.input<typeof statusSchema>): Promise<Result> {
  const admin = await requireSuperAdmin();
  const parsed = statusSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error);
  const { workspaceId, action } = parsed.data;
  const values =
    action === "complimentary"
      ? { status: "active" as const, paidUntil: null, note: "Complimentary" }
      : action === "cancel"
        ? { status: "cancelled" as const }
        : { status: "pending" as const, paidUntil: null };
  await db.transaction(async (tx) => {
    await tx
      .insert(subscriptions)
      .values({ workspaceId, ...values })
      .onConflictDoUpdate({ target: subscriptions.workspaceId, set: values });
    await tx.insert(activities).values({
      workspaceId,
      actorId: admin.id,
      type: `subscription.${action}`,
      data: {},
    });
  });
  refresh();
  return { ok: true };
}

const settingsSchema = z.object({
  price: optionalDecimal(MAX_MONEY, "Enter a valid price"),
  currency: z.enum(CURRENCIES),
  billingPeriod: z.enum(["month", "year"]),
  paymentInstructions: z.string().trim().max(3000).optional().transform((v) => v || null),
  contact: z.string().trim().max(500).optional().transform((v) => v || null),
});

export async function savePlatformSettings(input: z.input<typeof settingsSchema>): Promise<Result> {
  await requireSuperAdmin();
  const parsed = settingsSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error);
  await db
    .insert(platformSettings)
    .values({ id: "platform", ...parsed.data })
    .onConflictDoUpdate({ target: platformSettings.id, set: parsed.data });
  refresh();
  return { ok: true };
}
