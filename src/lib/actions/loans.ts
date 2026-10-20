"use server";

import { refresh } from "next/cache";
import { and, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import { requireWorkspace, requireWorkspaceById } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { activities, loanRepayments, loanRequests, loans, member, organization, resources, user } from "@/lib/db/schema";
import { CURRENCIES } from "@/lib/constants";
import { REPAYMENT_METHODS, checkRepayment, loanBalance } from "@/lib/loans";
import { isWorkspaceAdmin } from "@/lib/permissions";
import { notify, projectManagers } from "@/lib/notifications";
import { todayISO } from "@/lib/accomplishment";
import { formatMoney } from "@/lib/utils";
import { getT } from "@/i18n/server";

type Result<T = undefined> = { ok: true; data?: T } | { ok: false; error: string; fieldErrors?: Record<string, string> };

const ADMINS_ONLY = "Only workspace owners and admins can manage loans.";

const money = z
  .string()
  .trim()
  .transform((v) => v.replace(/,/g, ""))
  .refine((v) => /^\d+(\.\d{1,2})?$/.test(v) && Number(v) > 0, "Enter an amount greater than 0")
  .refine((v) => Number(v) < 1e12, "That amount is too large");
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Choose a date");
const currency = z.enum(CURRENCIES as unknown as [string, ...string[]]);

function fieldErrors(error: z.ZodError, t: (s: string) => string): Result<never> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) out[String(issue.path[0])] ??= t(issue.message);
  return { ok: false, error: t(error.issues[0].message), fieldErrors: out };
}

async function log(workspaceId: string, actorId: string, type: string, data: Record<string, unknown>) {
  await db.insert(activities).values({ workspaceId, actorId, type, data });
}

/** Name of a loan's borrower and, for members, their user id (workers have no account to notify). */
async function borrowerOf(loan: { borrowerUserId: string | null; borrowerResourceId: string | null }) {
  if (loan.borrowerUserId) {
    const [u] = await db.select({ name: user.name }).from(user).where(eq(user.id, loan.borrowerUserId)).limit(1);
    return { name: u?.name ?? "", userId: loan.borrowerUserId };
  }
  const [r] = await db.select({ name: resources.name }).from(resources).where(eq(resources.id, loan.borrowerResourceId!)).limit(1);
  return { name: r?.name ?? "", userId: null };
}

async function slugOf(workspaceId: string) {
  const [w] = await db.select({ slug: organization.slug }).from(organization).where(eq(organization.id, workspaceId)).limit(1);
  return w?.slug ?? "";
}

const loanSchema = z.object({
  // "user:<id>" for a member, "worker:<id>" for a worker from the resource library.
  borrower: z.string().regex(/^(user|worker):.+$/, "Choose who is borrowing"),
  amount: money,
  currency,
  issuedOn: isoDate,
  reason: z.string().trim().max(500).optional().transform((v) => v || null),
});
export type LoanInput = z.input<typeof loanSchema>;

/** Checks the borrower belongs to this workspace (a member, or an active worker). */
async function resolveBorrower(workspaceId: string, borrower: string) {
  const [kind, id] = [borrower.slice(0, borrower.indexOf(":")), borrower.slice(borrower.indexOf(":") + 1)];
  if (kind === "user") {
    const [m] = await db
      .select({ id: member.id })
      .from(member)
      .where(and(eq(member.organizationId, workspaceId), eq(member.userId, id)))
      .limit(1);
    return m ? { borrowerUserId: id, borrowerResourceId: null } : null;
  }
  const [r] = await db
    .select({ id: resources.id })
    .from(resources)
    .where(and(eq(resources.id, id), eq(resources.workspaceId, workspaceId), eq(resources.type, "labor"), isNull(resources.archivedAt)))
    .limit(1);
  return r ? { borrowerUserId: null, borrowerResourceId: id } : null;
}

/** Owners/admins lend money to a member or a worker. */
export async function createLoan(slug: string, input: LoanInput): Promise<Result<{ id: string }>> {
  const t = await getT();
  const { user: me, workspace } = await requireWorkspace(slug);
  if (!isWorkspaceAdmin(workspace.role)) return { ok: false, error: t(ADMINS_ONLY) };
  const parsed = loanSchema.safeParse(input);
  if (!parsed.success) return fieldErrors(parsed.error, t);
  const d = parsed.data;
  const borrower = await resolveBorrower(workspace.id, d.borrower);
  if (!borrower) return { ok: false, error: t("Choose who is borrowing"), fieldErrors: { borrower: t("Choose who is borrowing") } };

  const [loan] = await db
    .insert(loans)
    .values({ workspaceId: workspace.id, ...borrower, amount: d.amount, currency: d.currency, issuedOn: d.issuedOn, reason: d.reason, createdById: me.id })
    .returning({ id: loans.id });
  const who = await borrowerOf(borrower);
  await log(workspace.id, me.id, "loan.created", { borrower: who.name, amount: d.amount, currency: d.currency });
  if (who.userId) {
    await notify({
      workspaceId: workspace.id,
      userIds: [who.userId],
      actorId: me.id,
      type: "loan",
      title: (tr) => tr("You received a loan of {amount}", { amount: formatMoney(d.amount, d.currency, tr.intl) }),
      body: d.reason,
      link: `/w/${workspace.slug}/loans/${loan.id}`,
      email: true,
    });
  }
  refresh();
  return { ok: true, data: { id: loan.id } };
}

async function adminLoan(loanId: string) {
  const [loan] = await db.select().from(loans).where(eq(loans.id, loanId)).limit(1);
  if (!loan) return null;
  const { user: me, role } = await requireWorkspaceById(loan.workspaceId);
  return isWorkspaceAdmin(role) ? { loan, me } : null;
}

/** Keeps "paid off" in step with the repayments, and tells the borrower when it's done. */
async function syncPaidOff(loanId: string) {
  const [loan] = await db.select().from(loans).where(eq(loans.id, loanId)).limit(1);
  const repayments = await db.select({ amount: loanRepayments.amount }).from(loanRepayments).where(eq(loanRepayments.loanId, loanId));
  const b = loanBalance(loan.amount, repayments);
  if (b.paidOff && !loan.paidOffAt) await db.update(loans).set({ paidOffAt: new Date() }).where(eq(loans.id, loanId));
  if (!b.paidOff && loan.paidOffAt) await db.update(loans).set({ paidOffAt: null }).where(eq(loans.id, loanId));
  return { loan, balance: b, justPaidOff: b.paidOff && !loan.paidOffAt };
}

const repaymentSchema = z.object({
  amount: z.string().trim().transform((v) => v.replace(/,/g, "")),
  paidOn: isoDate,
  method: z.enum(REPAYMENT_METHODS.map((m) => m.value) as [string, ...string[]]),
  note: z.string().trim().max(300).optional().transform((v) => v || null),
});
export type RepaymentInput = z.input<typeof repaymentSchema>;

/** Records a repayment of any amount up to what's still owed. */
export async function recordRepayment(loanId: string, input: RepaymentInput): Promise<Result<{ paidOff: boolean }>> {
  const t = await getT();
  const auth = await adminLoan(loanId);
  if (!auth) return { ok: false, error: t(ADMINS_ONLY) };
  const parsed = repaymentSchema.safeParse(input);
  if (!parsed.success) return fieldErrors(parsed.error, t);
  const d = parsed.data;

  const existing = await db.select({ amount: loanRepayments.amount }).from(loanRepayments).where(eq(loanRepayments.loanId, loanId));
  const before = loanBalance(auth.loan.amount, existing);
  const problem = checkRepayment(d.amount, before.balance);
  if (problem) {
    const msg = t(problem, { balance: formatMoney(before.balance, auth.loan.currency, t.intl) });
    return { ok: false, error: msg, fieldErrors: { amount: msg } };
  }
  if (d.paidOn < auth.loan.issuedOn) {
    const msg = t("A repayment can't be before the loan was given ({date}).", { date: auth.loan.issuedOn });
    return { ok: false, error: msg, fieldErrors: { paidOn: msg } };
  }

  await db.insert(loanRepayments).values({ workspaceId: auth.loan.workspaceId, loanId, amount: d.amount, paidOn: d.paidOn, method: d.method, note: d.note, recordedById: auth.me.id });
  const { balance, justPaidOff } = await syncPaidOff(loanId);
  const who = await borrowerOf(auth.loan);
  await log(auth.loan.workspaceId, auth.me.id, "loan.repayment_recorded", {
    borrower: who.name,
    amount: d.amount,
    currency: auth.loan.currency,
    balance: balance.balance,
  });
  if (who.userId) {
    const slug = await slugOf(auth.loan.workspaceId);
    await notify({
      workspaceId: auth.loan.workspaceId,
      userIds: [who.userId],
      actorId: auth.me.id,
      type: "loan",
      title: (tr) =>
        justPaidOff
          ? tr("Your loan is fully repaid")
          : tr("Repayment of {amount} recorded", { amount: formatMoney(d.amount, auth.loan.currency, tr.intl) }),
      body: (tr) => tr("Remaining: {balance}", { balance: formatMoney(balance.balance, auth.loan.currency, tr.intl) }),
      link: `/w/${slug}/loans/${loanId}`,
      email: true,
    });
  }
  refresh();
  return { ok: true, data: { paidOff: balance.paidOff } };
}

/** Removes a repayment entered by mistake; the balance goes back up. */
export async function deleteRepayment(repaymentId: string): Promise<Result> {
  const t = await getT();
  const [rep] = await db.select().from(loanRepayments).where(eq(loanRepayments.id, repaymentId)).limit(1);
  if (!rep) return { ok: false, error: t("Not found") };
  const auth = await adminLoan(rep.loanId);
  if (!auth) return { ok: false, error: t(ADMINS_ONLY) };
  await db.delete(loanRepayments).where(eq(loanRepayments.id, repaymentId));
  await syncPaidOff(rep.loanId);
  const who = await borrowerOf(auth.loan);
  await log(auth.loan.workspaceId, auth.me.id, "loan.repayment_deleted", { borrower: who.name, amount: rep.amount, currency: auth.loan.currency });
  refresh();
  return { ok: true };
}

/** A loan can only be deleted while nothing has been repaid (otherwise remove the repayments first). */
export async function deleteLoan(loanId: string): Promise<Result> {
  const t = await getT();
  const auth = await adminLoan(loanId);
  if (!auth) return { ok: false, error: t(ADMINS_ONLY) };
  const [rep] = await db.select({ id: loanRepayments.id }).from(loanRepayments).where(eq(loanRepayments.loanId, loanId)).limit(1);
  if (rep) return { ok: false, error: t("This loan has repayments. Remove them first if it was entered by mistake.") };
  const who = await borrowerOf(auth.loan);
  await db.delete(loans).where(eq(loans.id, loanId));
  await log(auth.loan.workspaceId, auth.me.id, "loan.deleted", { borrower: who.name, amount: auth.loan.amount, currency: auth.loan.currency });
  refresh();
  return { ok: true };
}

// --- Requests from members ---

const requestSchema = z.object({
  amount: money,
  currency,
  reason: z.string().trim().min(3, "Say what the loan is for").max(500),
});
export type LoanRequestInput = z.input<typeof requestSchema>;

/** A member asks for a loan; owners and admins get it to approve or reject. */
export async function requestLoan(slug: string, input: LoanRequestInput): Promise<Result> {
  const t = await getT();
  const { user: me, workspace } = await requireWorkspace(slug);
  const parsed = requestSchema.safeParse(input);
  if (!parsed.success) return fieldErrors(parsed.error, t);
  const d = parsed.data;
  const pending = await db
    .select({ id: loanRequests.id })
    .from(loanRequests)
    .where(and(eq(loanRequests.workspaceId, workspace.id), eq(loanRequests.userId, me.id), eq(loanRequests.status, "pending")));
  if (pending.length >= 3) return { ok: false, error: t("You already have requests waiting. Wait for an answer first.") };

  await db.insert(loanRequests).values({ workspaceId: workspace.id, userId: me.id, amount: d.amount, currency: d.currency, reason: d.reason });
  await log(workspace.id, me.id, "loan.requested", { amount: d.amount, currency: d.currency });
  await notify({
    workspaceId: workspace.id,
    userIds: (await projectManagers(workspace.id, null)).filter(Boolean),
    actorId: me.id,
    type: "loan.request",
    title: (tr) => tr("{name} asks for a loan of {amount}", { name: me.name, amount: formatMoney(d.amount, d.currency, tr.intl) }),
    body: d.reason,
    link: `/w/${workspace.slug}/loans`,
    email: true,
  });
  refresh();
  return { ok: true };
}

const decisionSchema = z.object({
  decision: z.enum(["approved", "rejected"]),
  note: z.string().trim().max(500).optional().transform((v) => v || null),
  // When approving, the amount actually lent (defaults to what was asked).
  amount: money.optional(),
});

/** Approve (creates the loan, dated today) or reject (reason required). */
export async function decideLoanRequest(requestId: string, input: z.input<typeof decisionSchema>): Promise<Result> {
  const t = await getT();
  const [req] = await db.select().from(loanRequests).where(eq(loanRequests.id, requestId)).limit(1);
  if (!req) return { ok: false, error: t("Not found") };
  const { user: me, role } = await requireWorkspaceById(req.workspaceId);
  if (!isWorkspaceAdmin(role)) return { ok: false, error: t(ADMINS_ONLY) };
  if (req.status !== "pending") return { ok: false, error: t("This request was already answered.") };
  const parsed = decisionSchema.safeParse(input);
  if (!parsed.success) return fieldErrors(parsed.error, t);
  const d = parsed.data;
  if (d.decision === "rejected" && !d.note) return { ok: false, error: t("Give a reason for rejecting"), fieldErrors: { note: t("Give a reason for rejecting") } };

  const amount = d.amount ?? req.amount;
  const slug = await slugOf(req.workspaceId);
  let loanId: string | null = null;
  await db.transaction(async (tx) => {
    // Claim the request so two admins can't both approve it.
    const claimed = await tx
      .update(loanRequests)
      .set({ status: d.decision, decidedById: me.id, decidedAt: new Date(), decisionNote: d.note })
      .where(and(eq(loanRequests.id, requestId), eq(loanRequests.status, "pending")))
      .returning({ id: loanRequests.id });
    if (claimed.length === 0) return;
    if (d.decision === "approved") {
      const [loan] = await tx
        .insert(loans)
        .values({ workspaceId: req.workspaceId, borrowerUserId: req.userId, amount, currency: req.currency, issuedOn: todayISO(), reason: req.reason, requestId, createdById: me.id })
        .returning({ id: loans.id });
      loanId = loan.id;
    }
  });
  const [requester] = await db.select({ name: user.name }).from(user).where(eq(user.id, req.userId)).limit(1);
  await log(req.workspaceId, me.id, d.decision === "approved" ? "loan.request_approved" : "loan.request_rejected", {
    borrower: requester?.name ?? "",
    amount,
    currency: req.currency,
    note: d.note,
  });
  await notify({
    workspaceId: req.workspaceId,
    userIds: [req.userId],
    actorId: me.id,
    type: "loan",
    title: (tr) =>
      d.decision === "approved"
        ? tr("Your loan request was approved: {amount}", { amount: formatMoney(amount, req.currency, tr.intl) })
        : tr("Your loan request was rejected"),
    body: d.note,
    link: loanId ? `/w/${slug}/loans/${loanId}` : `/w/${slug}/loans`,
    email: true,
  });
  refresh();
  return { ok: true };
}

/** The requester can withdraw a request that hasn't been answered yet. */
export async function cancelLoanRequest(requestId: string): Promise<Result> {
  const t = await getT();
  const [req] = await db.select().from(loanRequests).where(eq(loanRequests.id, requestId)).limit(1);
  if (!req) return { ok: false, error: t("Not found") };
  const { user: me } = await requireWorkspaceById(req.workspaceId);
  if (req.userId !== me.id) return { ok: false, error: t("Not allowed") };
  if (req.status !== "pending") return { ok: false, error: t("This request was already answered.") };
  await db.delete(loanRequests).where(eq(loanRequests.id, requestId));
  refresh();
  return { ok: true };
}
