import { fail, json, requireMobileWorkspace, runAction } from "@/lib/mobile/api";
import { listMyExpenses } from "@/lib/data/my-work";
import { listLoans } from "@/lib/data/loans";
import { saveExpense } from "@/lib/actions/expenses";
import { EXPENSE_CATEGORIES } from "@/lib/constants";

/** GET → the expenses I added (with their approval) and my open cash advances to put receipts against. */
export async function GET(request: Request, ctx: RouteContext<"/api/mobile/v1/w/[slug]/expenses">) {
  const authed = await requireMobileWorkspace(request, (await ctx.params).slug);
  if (authed instanceof Response) return authed;
  const { user, workspace, t } = authed;
  const [mine, loans] = await Promise.all([listMyExpenses(workspace.id, user.id), listLoans(workspace.id, { borrowerUserId: user.id })]);
  return json({
    categories: EXPENSE_CATEGORIES.map((c) => ({ value: c.value, label: t(c.label) })),
    advances: loans
      .filter((l) => l.projectId && !l.paidOff && Number(l.open) > 0)
      .map((l) => ({ id: l.id, projectId: l.projectId, projectName: l.projectName, currency: l.currency, amount: l.amount, open: l.open, reason: l.reason })),
    expenses: mine.map((e) => ({
      id: e.id,
      date: e.date,
      amount: e.amount,
      currency: e.currency,
      category: e.category,
      description: e.description,
      payee: e.payee,
      project: { id: e.projectId, key: e.projectKey, name: e.projectName },
      advance: e.loanId !== null,
      receiptUrl: e.hasReceipt ? `/api/files/receipts/${e.id}` : null,
      status: e.approvalStatus,
      decidedBy: e.decidedByName,
      decisionNote: e.decisionNote,
    })),
  });
}

/**
 * POST multipart { projectId, date, amount, category, description, payee?, taskId?, loanId?, receipt? }
 * → add an expense (a receipt photo is optional). Above the project's limit it waits for approval.
 */
export async function POST(request: Request, ctx: RouteContext<"/api/mobile/v1/w/[slug]/expenses">) {
  const authed = await requireMobileWorkspace(request, (await ctx.params).slug);
  if (authed instanceof Response) return authed;
  const form = await request.formData().catch(() => null);
  if (!form) return fail(400, "invalid", authed.t("Describe what was paid for"));
  // New expenses only from the phone; editing stays on the website for now.
  form.delete("expenseId");
  form.delete("removeReceipt");
  return runAction(authed.t, () => saveExpense(form), 201);
}
