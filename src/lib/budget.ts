/**
 * Budget vs actual for a project, shared by every screen that shows money.
 *
 * Actual spending = resource costs (used qty × price, counted automatically)
 *                 + expenses NOT linked to a resource.
 * Expenses linked to a resource are payments for it: they reduce what is still
 * owed, but are not added to spending again (that would count it twice).
 * Only approved expenses count; pending and rejected ones are ignored.
 *
 * Cash advances (loans given from the project's budget) count as spent the day
 * they're given: what's still out with the person is added to spending. As
 * receipts bought with it are approved they count as normal expenses instead,
 * and cash brought back simply stops counting — it's back in the budget.
 */

export type BudgetUsage = {
  id: string;
  taskId: string | null;
  usedQty: string | number;
  plannedQty: string | number;
  unitCost: string | number;
};

export type BudgetExpense = {
  amount: string | number;
  taskId: string | null;
  projectResourceId: string | null;
  /** Pending / rejected expenses don't count. Missing = approved. */
  approvalStatus?: "approved" | "pending" | "rejected";
  /** The cash advance it was bought with, if any. */
  loanId?: string | null;
};

/** A cash advance given from this project's budget, and the cash already brought back. */
export type BudgetAdvance = { id: string; amount: string | number; returned: string | number };

export type BudgetTask = { id: string; budget: string | number | null };

export type TaskBudgetLine = {
  taskId: string;
  budget: number | null;
  resourceCost: number;
  otherExpenses: number;
  actual: number;
  remaining: number | null;
  overBudget: boolean;
};

export type ResourcePaymentLine = { usageId: string; usedCost: number; paid: number; owed: number };

export type BudgetSummary = {
  budget: number | null;
  resourceCost: number;
  plannedResourceCost: number;
  otherExpenses: number;
  actual: number;
  remaining: number | null;
  /** actual / budget × 100, or null without a budget. */
  usedPct: number | null;
  overBudget: boolean;
  paidToResources: number;
  owedToResources: number;
  /** Total of expenses waiting for approval (not counted in `actual`). */
  pendingApproval: number;
  /** Cash advances still out with people, not yet accounted for by approved receipts (part of `actual`). */
  advancesOut: number;
  tasks: TaskBudgetLine[];
  resources: ResourcePaymentLine[];
};

const n = (v: string | number | null | undefined) => (v === null || v === undefined || v === "" ? 0 : Number(v));
const cents = (v: number) => Math.round(v * 100) / 100;

export function computeBudget(
  projectBudget: string | number | null,
  usages: BudgetUsage[],
  expenses: BudgetExpense[],
  tasks: BudgetTask[] = [],
  advances: BudgetAdvance[] = [],
): BudgetSummary {
  const budget = projectBudget === null || projectBudget === "" ? null : Number(projectBudget);
  const allExpenses = expenses;
  expenses = allExpenses.filter((e) => (e.approvalStatus ?? "approved") === "approved");

  const paidByUsage = new Map<string, number>();
  for (const e of expenses) {
    if (e.projectResourceId) paidByUsage.set(e.projectResourceId, (paidByUsage.get(e.projectResourceId) ?? 0) + n(e.amount));
  }

  const resources = usages.map((u) => {
    const usedCost = cents(n(u.usedQty) * n(u.unitCost));
    const paid = cents(paidByUsage.get(u.id) ?? 0);
    return { usageId: u.id, usedCost, paid, owed: cents(Math.max(0, usedCost - paid)) };
  });

  const resourceCost = cents(resources.reduce((s, r) => s + r.usedCost, 0));
  const plannedResourceCost = cents(usages.reduce((s, u) => s + n(u.plannedQty) * n(u.unitCost), 0));
  const otherExpenses = cents(expenses.filter((e) => !e.projectResourceId).reduce((s, e) => s + n(e.amount), 0));
  const receiptsByAdvance = new Map<string, number>();
  for (const e of expenses) {
    if (e.loanId) receiptsByAdvance.set(e.loanId, (receiptsByAdvance.get(e.loanId) ?? 0) + n(e.amount));
  }
  const advancesOut = cents(
    advances.reduce((s, a) => s + Math.max(0, n(a.amount) - n(a.returned) - (receiptsByAdvance.get(a.id) ?? 0)), 0),
  );
  const actual = cents(resourceCost + otherExpenses + advancesOut);
  // Payments only count against resources that exist in this project.
  const paidToResources = cents(resources.reduce((s, r) => s + r.paid, 0));

  const taskLines = tasks.map((t) => {
    const taskBudget = t.budget === null || t.budget === "" ? null : Number(t.budget);
    const taskResourceCost = cents(
      usages.filter((u) => u.taskId === t.id).reduce((s, u) => s + n(u.usedQty) * n(u.unitCost), 0),
    );
    const taskOther = cents(
      expenses.filter((e) => e.taskId === t.id && !e.projectResourceId).reduce((s, e) => s + n(e.amount), 0),
    );
    const taskActual = cents(taskResourceCost + taskOther);
    return {
      taskId: t.id,
      budget: taskBudget,
      resourceCost: taskResourceCost,
      otherExpenses: taskOther,
      actual: taskActual,
      remaining: taskBudget === null ? null : cents(taskBudget - taskActual),
      overBudget: taskBudget !== null && taskActual > taskBudget,
    };
  });

  return {
    budget,
    resourceCost,
    plannedResourceCost,
    otherExpenses,
    actual,
    remaining: budget === null ? null : cents(budget - actual),
    usedPct: budget ? Math.round((actual / budget) * 1000) / 10 : null,
    overBudget: budget !== null && actual > budget,
    paidToResources,
    owedToResources: cents(resources.reduce((s, r) => s + r.owed, 0)),
    advancesOut,
    pendingApproval: cents(allExpenses.filter((e) => e.approvalStatus === "pending").reduce((s, e) => s + n(e.amount), 0)),
    tasks: taskLines,
    resources,
  };
}
