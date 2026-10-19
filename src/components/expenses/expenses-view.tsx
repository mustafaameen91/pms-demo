"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { AlertTriangle, FileText, Link2, Loader2, Paperclip, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { deleteExpense, saveExpense } from "@/lib/actions/expenses";
import type { BudgetSummary } from "@/lib/budget";
import type { ProjectExpense } from "@/lib/data/expenses";
import { CATEGORY_FOR_RESOURCE, EXPENSE_CATEGORIES, type ResourceType } from "@/lib/constants";
import { todayISO } from "@/lib/accomplishment";
import { cn, formatDate, formatMoney } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { FieldError } from "@/components/projects/project-fields";
import { nativeSelectClass } from "@/components/resources/resource-fields";
import { useT } from "@/i18n/client";
import { ApprovalBadge, DecisionButtons } from "./approval";

type ProjectInfo = {
  id: string;
  key: string;
  currency: string;
  slug: string;
  approvalThreshold: string | null;
  isApprover: boolean;
};
type TaskOption = { id: string; number: number; title: string };
type UsageOption = { id: string; name: string; role: string | null; type: ResourceType; taskId: string | null };
type ExpenseRow = Omit<ProjectExpense, "hasReceipt" | "createdById"> & { hasReceipt: boolean; canEdit: boolean };

const categoryLabel = (v: string) => EXPENSE_CATEGORIES.find((c) => c.value === v)?.label ?? v;

export function ExpensesView({
  project,
  summary,
  tasks,
  usages,
  expenses,
}: {
  project: ProjectInfo;
  summary: BudgetSummary;
  tasks: TaskOption[];
  usages: UsageOption[];
  expenses: ExpenseRow[];
}) {
  const t = useT();
  const [dialog, setDialog] = useState<{ open: boolean; expense?: ExpenseRow }>({ open: false });
  const money = (v: number) => formatMoney(v, project.currency, t.intl);
  const taskById = new Map(tasks.map((task) => [task.id, task]));
  const usageById = new Map(usages.map((u) => [u.id, u]));
  const overTasks = summary.tasks.filter((line) => line.overBudget);
  const taskLines = summary.tasks.filter((line) => line.budget !== null || line.actual > 0);
  const pct = summary.usedPct === null ? null : Math.min(100, summary.usedPct);
  const base = `/w/${project.slug}/p/${project.key}`;

  return (
    // grid-cols-1 = minmax(0, 1fr): wide tables scroll inside their box instead of widening the page.
    <div className="grid grid-cols-1 gap-6">
      {(summary.overBudget || overTasks.length > 0) && (
        <div role="alert" className="grid gap-1 rounded-xl border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm">
          {summary.overBudget && (
            <p className="flex gap-2 font-medium text-destructive">
              <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
              {t("Project is over budget by {amount}.", { amount: money(-(summary.remaining ?? 0)) })}
            </p>
          )}
          {overTasks.map((line) => {
            const task = taskById.get(line.taskId);
            return (
              <p key={line.taskId} className="flex gap-2 text-destructive">
                <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
                {t("{task} is over its budget by {amount}.", {
                  task: task ? `${project.key}-${task.number} ${task.title}` : t("A task"),
                  amount: money(-(line.remaining ?? 0)),
                })}
              </p>
            );
          })}
        </div>
      )}

      {/* KPI row */}
      <section aria-label={t("Budget summary")} className="rounded-xl border bg-card p-5 sm:p-6">
        <dl className="grid gap-5 sm:grid-cols-3">
          <div>
            <dt className="text-sm text-muted-foreground">{t("Budget")}</dt>
            <dd className="mt-1 text-2xl font-semibold">{summary.budget === null ? "—" : money(summary.budget)}</dd>
            {summary.budget === null && (
              <p className="mt-0.5 text-xs text-muted-foreground">
                <Link href={`${base}/settings`} className="text-primary underline-offset-4 hover:underline">
                  {t("Set a budget")}
                </Link>{" "}
                {t("to track spending against it")}
              </p>
            )}
          </div>
          <div>
            <dt className="text-sm text-muted-foreground">{t("Spent")}</dt>
            <dd className={cn("mt-1 text-2xl font-semibold", summary.overBudget && "text-destructive")}>
              {money(summary.actual)}
            </dd>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {t("Resources {resources} · Other expenses {other}", { resources: money(summary.resourceCost), other: money(summary.otherExpenses) })}
            </p>
            {summary.pendingApproval > 0 && (
              <p className="mt-0.5 text-xs text-amber-800 dark:text-amber-300">
                {t("+ {amount} waiting for approval (not counted yet)", { amount: money(summary.pendingApproval) })}
              </p>
            )}
          </div>
          <div>
            <dt className="text-sm text-muted-foreground">{t("Remaining")}</dt>
            <dd
              className={cn(
                "mt-1 text-2xl font-semibold",
                summary.remaining !== null && summary.remaining < 0 && "text-destructive",
              )}
            >
              {summary.remaining === null ? "—" : money(summary.remaining)}
            </dd>
            {summary.usedPct !== null && (
              <p className="mt-0.5 text-xs text-muted-foreground">{t("{pct}% of budget used", { pct: String(summary.usedPct) })}</p>
            )}
          </div>
        </dl>
        {pct !== null && (
          <div
            role="meter"
            aria-label={t("Budget used")}
            aria-valuenow={summary.usedPct ?? 0}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuetext={t("{pct}% of budget used", { pct: String(summary.usedPct) })}
            className={cn("mt-5 h-2.5 overflow-hidden rounded-full", summary.overBudget ? "bg-destructive/15" : "bg-primary/15")}
          >
            <div
              className={cn("h-full rounded-full", summary.overBudget ? "bg-destructive" : "bg-primary")}
              style={{ width: `${pct}%` }}
            />
          </div>
        )}
      </section>

      {/* Budget by task */}
      {taskLines.length > 0 && (
        <section aria-labelledby="by-task" className="overflow-hidden rounded-xl border bg-card">
          <h2 id="by-task" className="border-b px-4 py-3 font-semibold">
            {t("Budget by task")}
          </h2>
          <div className="relative overflow-x-auto">
            <table className="w-full min-w-[760px] text-sm">
              <thead className="text-start text-xs text-muted-foreground">
                <tr className="border-b bg-muted/40">
                  <th scope="col" className="py-2 pe-3 ps-4 font-medium">{t("Task")}</th>
                  <th scope="col" className="px-3 py-2 text-end font-medium">{t("Budget")}</th>
                  <th scope="col" className="px-3 py-2 text-end font-medium">{t("Resources")}</th>
                  <th scope="col" className="px-3 py-2 text-end font-medium">{t("Expenses")}</th>
                  <th scope="col" className="px-3 py-2 text-end font-medium">{t("Spent")}</th>
                  <th scope="col" className="py-2 pe-4 ps-3 text-end font-medium">{t("Remaining")}</th>
                </tr>
              </thead>
              <tbody>
                {taskLines.map((line) => {
                  const task = taskById.get(line.taskId);
                  return (
                    <tr key={line.taskId} className="border-b last:border-b-0">
                      <td className="py-2.5 pe-3 ps-4">
                        <Link href={`${base}?task=${project.key}-${task?.number}`} className="hover:underline">
                          <span className="font-mono text-xs text-muted-foreground">
                            {project.key}-{task?.number}
                          </span>{" "}
                          {task?.title}
                        </Link>
                      </td>
                      <td className="px-3 py-2.5 text-end tabular-nums">{line.budget === null ? "—" : money(line.budget)}</td>
                      <td className="px-3 py-2.5 text-end text-muted-foreground tabular-nums">{money(line.resourceCost)}</td>
                      <td className="px-3 py-2.5 text-end text-muted-foreground tabular-nums">{money(line.otherExpenses)}</td>
                      <td className={cn("px-3 py-2.5 text-end font-medium tabular-nums", line.overBudget && "text-destructive")}>
                        {money(line.actual)}
                      </td>
                      <td className="py-2.5 pe-4 ps-3 text-end tabular-nums">
                        {line.remaining === null ? (
                          <span className="text-muted-foreground">{t("No budget")}</span>
                        ) : line.overBudget ? (
                          <span className="inline-flex items-center gap-1 font-medium text-destructive">
                            <AlertTriangle className="size-3.5" aria-hidden />
                            {t("Over by {amount}", { amount: money(-line.remaining) })}
                          </span>
                        ) : (
                          money(line.remaining)
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* Resource payments */}
      {summary.resources.some((r) => r.usedCost > 0 || r.paid > 0) && (
        <section aria-labelledby="payments" className="overflow-hidden rounded-xl border bg-card">
          <div className="flex flex-wrap items-baseline justify-between gap-2 border-b px-4 py-3">
            <h2 id="payments" className="font-semibold">
              {t("Resource costs & payments")}
            </h2>
            <p className="text-xs text-muted-foreground">
              {t("Counted automatically from used quantities")} ·{" "}
              <Link href={`${base}/resources`} className="text-primary underline-offset-4 hover:underline">
                {t("Resources tab")}
              </Link>
            </p>
          </div>
          <div className="relative overflow-x-auto">
            <table className="w-full min-w-[600px] text-sm">
              <thead className="text-start text-xs text-muted-foreground">
                <tr className="border-b bg-muted/40">
                  <th scope="col" className="py-2 pe-3 ps-4 font-medium">{t("Resource")}</th>
                  <th scope="col" className="px-3 py-2 text-end font-medium">{t("Cost so far")}</th>
                  <th scope="col" className="px-3 py-2 text-end font-medium">{t("Paid")}</th>
                  <th scope="col" className="py-2 pe-4 ps-3 text-end font-medium">{t("Still owed")}</th>
                </tr>
              </thead>
              <tbody>
                {summary.resources
                  .filter((r) => r.usedCost > 0 || r.paid > 0)
                  .map((r) => {
                    const u = usageById.get(r.usageId);
                    return (
                      <tr key={r.usageId} className="border-b last:border-b-0">
                        <td className="py-2.5 pe-3 ps-4">
                          {u?.name}
                          {u?.role && <span className="text-muted-foreground"> · {u.role}</span>}
                        </td>
                        <td className="px-3 py-2.5 text-end tabular-nums">{money(r.usedCost)}</td>
                        <td className="px-3 py-2.5 text-end text-muted-foreground tabular-nums">{money(r.paid)}</td>
                        <td className={cn("py-2.5 pe-4 ps-3 text-end tabular-nums", r.owed > 0 && "font-medium")}>
                          {money(r.owed)}
                        </td>
                      </tr>
                    );
                  })}
              </tbody>
              <tfoot>
                <tr className="border-t bg-muted/40 text-xs">
                  <th scope="row" className="py-2 pe-3 ps-4 text-start font-medium">{t("Total")}</th>
                  <td className="px-3 py-2 text-end font-medium tabular-nums">{money(summary.resourceCost)}</td>
                  <td className="px-3 py-2 text-end font-medium tabular-nums">{money(summary.paidToResources)}</td>
                  <td className="py-2 pe-4 ps-3 text-end font-medium tabular-nums">{money(summary.owedToResources)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </section>
      )}

      {/* Expense list */}
      {project.isApprover && expenses.some((e) => e.approvalStatus === "pending") && (
        <section aria-labelledby="approve-heading" className="overflow-hidden rounded-xl border border-amber-500/40 bg-card">
          <h2 id="approve-heading" className="border-b bg-amber-500/10 px-4 py-3 font-semibold">
            {t("Waiting for your approval")}
          </h2>
          <ul className="divide-y">
            {expenses
              .filter((e) => e.approvalStatus === "pending")
              .map((e) => (
                <li key={e.id} className="flex flex-wrap items-center gap-3 px-4 py-3 text-sm">
                  <div className="min-w-0 flex-1">
                    <p className="font-medium">
                      {e.description} · <span className="tabular-nums">{formatMoney(e.amount, project.currency, t.intl)}</span>
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {formatDate(e.date, t.intl)} · {t("requested by {name}", { name: e.createdByName ?? t("someone") })}
                      {e.payee && ` · ${t("paid to {name}", { name: e.payee })}`}
                    </p>
                  </div>
                  <DecisionButtons expenseId={e.id} label={e.description} />
                </li>
              ))}
          </ul>
        </section>
      )}

      <section aria-labelledby="expense-list" className="overflow-hidden rounded-xl border bg-card">
        <div className="flex items-center justify-between gap-3 border-b px-4 py-3">
          <h2 id="expense-list" className="font-semibold">
            {t("Expenses & payments")} <span className="text-xs font-normal text-muted-foreground">{expenses.length}</span>
          </h2>
          <Button onClick={() => setDialog({ open: true })}>
            <Plus className="size-4" />
            {t("Add expense")}
          </Button>
        </div>
        {expenses.length === 0 ? (
          <p className="px-4 py-10 text-center text-sm text-muted-foreground">
            {t("No expenses yet. Record payments for permits, transport, fees, or payments to your suppliers and workers.")}
          </p>
        ) : (
          <div className="relative overflow-x-auto">
            <table className="w-full min-w-[820px] text-sm">
              <thead className="text-start text-xs text-muted-foreground">
                <tr className="border-b bg-muted/40">
                  <th scope="col" className="py-2 pe-3 ps-4 font-medium">{t("Date")}</th>
                  <th scope="col" className="px-3 py-2 font-medium">{t("Description")}</th>
                  <th scope="col" className="px-3 py-2 font-medium">{t("Category")}</th>
                  <th scope="col" className="px-3 py-2 font-medium">{t("Task")}</th>
                  <th scope="col" className="px-3 py-2 text-end font-medium">{t("Amount")}</th>
                  <th scope="col" className="py-2 pe-4 ps-3"><span className="sr-only">{t("Receipt and actions")}</span></th>
                </tr>
              </thead>
              <tbody>
                {expenses.map((e) => (
                  <tr key={e.id} className="border-b last:border-b-0">
                    <td className="py-2.5 pe-3 ps-4 whitespace-nowrap text-muted-foreground tabular-nums">{formatDate(e.date, t.intl)}</td>
                    <td className="px-3 py-2.5">
                      <div className="font-medium">{e.description}</div>
                      <div className="flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
                        {e.projectResourceId && (
                          <span className="inline-flex items-center gap-1 rounded bg-accent px-1.5 py-0.5 font-medium text-accent-foreground">
                            <Link2 className="size-3" aria-hidden />
                            {t("Payment · {name}", { name: e.resourceName ?? t("removed resource") })}
                          </span>
                        )}
                        {e.payee && <span>{t("Paid to {name}", { name: e.payee })}</span>}
                        {e.createdByName && <span>{t("Added by {name}", { name: e.createdByName })}</span>}
                      </div>
                      <ApprovalBadge status={e.approvalStatus} decidedBy={e.decidedByName} note={e.decisionNote} />
                    </td>
                    <td className="px-3 py-2.5 whitespace-nowrap">{t(categoryLabel(e.category))}</td>
                    <td className="max-w-48 truncate px-3 py-2.5 text-muted-foreground">
                      {e.taskNumber && !e.taskDeleted ? `${project.key}-${e.taskNumber} ${e.taskTitle}` : "—"}
                    </td>
                    <td
                      className={cn(
                        "px-3 py-2.5 text-end font-medium whitespace-nowrap tabular-nums",
                        e.approvalStatus !== "approved" && "text-muted-foreground line-through decoration-1",
                      )}
                      title={e.approvalStatus !== "approved" ? t("Not counted in spending") : undefined}
                    >
                      {formatMoney(e.amount, project.currency, t.intl)}
                    </td>
                    <td className="py-2 pe-4 ps-3">
                      <div className="flex justify-end gap-1">
                        {e.hasReceipt && (
                          <Button variant="ghost" size="sm" asChild>
                            <a href={`/api/files/receipts/${e.id}`} target="_blank" rel="noreferrer" aria-label={t("Open receipt for {name}", { name: e.description })}>
                              <Paperclip className="size-4" />
                              {t("Receipt")}
                            </a>
                          </Button>
                        )}
                        {e.canEdit && (
                          <Button variant="ghost" size="sm" onClick={() => setDialog({ open: true, expense: e })} aria-label={t("Edit {name}", { name: e.description })}>
                            <Pencil className="size-4" />
                            {t("Edit")}
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <ExpenseDialog
        open={dialog.open}
        onOpenChange={(open) => setDialog((d) => ({ ...d, open }))}
        expense={dialog.expense}
        project={project}
        tasks={tasks}
        usages={usages}
      />
    </div>
  );
}

function ExpenseDialog({
  open,
  onOpenChange,
  expense,
  project,
  tasks,
  usages,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  expense?: ExpenseRow;
  project: ProjectInfo;
  tasks: TaskOption[];
  usages: UsageOption[];
}) {
  const t = useT();
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{expense ? t("Edit expense") : t("Add expense")}</DialogTitle>
          <DialogDescription>{t("Amounts are in {currency}.", { currency: project.currency })}</DialogDescription>
        </DialogHeader>
        {open && (
          <ExpenseForm
            key={expense?.id ?? "new"}
            expense={expense}
            project={project}
            tasks={tasks}
            usages={usages}
            onDone={() => onOpenChange(false)}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function ExpenseForm({
  expense,
  project,
  tasks,
  usages,
  onDone,
}: {
  expense?: ExpenseRow;
  project: ProjectInfo;
  tasks: TaskOption[];
  usages: UsageOption[];
  onDone: () => void;
}) {
  const t = useT();
  const [usageId, setUsageId] = useState(expense?.projectResourceId ?? "");
  const [category, setCategory] = useState<string>(expense?.category ?? "other");
  const [taskId, setTaskId] = useState(expense?.taskId && !expense.taskDeleted ? expense.taskId : "");
  const [removeReceipt, setRemoveReceipt] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [pending, startTransition] = useTransition();

  function pickUsage(id: string) {
    setUsageId(id);
    const u = usages.find((x) => x.id === id);
    if (u) {
      setCategory(CATEGORY_FOR_RESOURCE[u.type]);
      if (u.taskId && !taskId) setTaskId(u.taskId);
    }
  }

  return (
    <form
      className="grid gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        const data = new FormData(e.currentTarget);
        data.set("projectId", project.id);
        if (expense) data.set("expenseId", expense.id);
        if (removeReceipt) data.set("removeReceipt", "1");
        startTransition(async () => {
          const result = await saveExpense(data);
          if (!result.ok) {
            setErrors(result.fieldErrors ?? {});
            if (!result.fieldErrors) toast.error(result.error);
            return;
          }
          if ("pending" in result && result.pending) {
            toast.success(t("Sent for approval — it counts once a manager approves it"));
          } else {
            toast.success(expense ? t("Expense updated") : t("Expense added"));
          }
          onDone();
        });
      }}
    >
      <div className="grid items-start gap-4 sm:grid-cols-2">
        <div className="grid gap-1.5">
          <Label htmlFor="exp-date">
            {t("Date")} <span aria-hidden className="text-destructive">*</span>
          </Label>
          <Input id="exp-date" name="date" type="date" defaultValue={expense?.date ?? todayISO()} required aria-invalid={Boolean(errors.date)} />
          <FieldError message={errors.date} />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="exp-amount">
            {t("Amount ({currency})", { currency: project.currency })} <span aria-hidden className="text-destructive">*</span>
          </Label>
          <Input
            id="exp-amount"
            name="amount"
            inputMode="decimal"
            defaultValue={expense ? String(Number(expense.amount)) : ""}
            placeholder="0"
            required
            className="tabular-nums"
            aria-invalid={Boolean(errors.amount)}
          />
          <FieldError message={errors.amount} />
          {project.approvalThreshold && !project.isApprover && (
            <p className="text-xs text-muted-foreground">
              {t("Above {amount} needs a manager's approval.", {
                amount: formatMoney(project.approvalThreshold, project.currency, t.intl),
              })}
            </p>
          )}
        </div>
      </div>

      <div className="grid gap-1.5">
        <Label htmlFor="exp-description">
          {t("What was it for?")} <span aria-hidden className="text-destructive">*</span>
        </Label>
        <Input
          id="exp-description"
          name="description"
          defaultValue={expense?.description}
          placeholder={t("Building permit fee")}
          maxLength={300}
          required
          aria-invalid={Boolean(errors.description)}
        />
        <FieldError message={errors.description} />
      </div>

      <div className="grid gap-1.5">
        <Label htmlFor="exp-usage">{t("Payment for a project resource?")}</Label>
        <select id="exp-usage" name="projectResourceId" value={usageId} onChange={(e) => pickUsage(e.target.value)} className={nativeSelectClass}>
          <option value="">{t("No — a separate expense")}</option>
          {usages.map((u) => (
            <option key={u.id} value={u.id}>
              {u.name}
              {u.role ? ` (${u.role})` : ""}
            </option>
          ))}
        </select>
        <p className={cn("text-xs", usageId ? "text-foreground" : "text-muted-foreground")}>
          {usageId
            ? t(
                "Recorded as a payment. This resource's cost is already counted from its used quantity, so this amount won't be added to spending again — it reduces what's still owed.",
              )
            : t("Separate expenses (permits, transport, fees…) are added to the project's spending.")}
        </p>
      </div>

      <div className="grid items-start gap-4 sm:grid-cols-2">
        <div className="grid gap-1.5">
          <Label htmlFor="exp-category">{t("Category")}</Label>
          <select id="exp-category" name="category" value={category} onChange={(e) => setCategory(e.target.value)} className={nativeSelectClass}>
            {EXPENSE_CATEGORIES.map((c) => (
              <option key={c.value} value={c.value}>
                {t(c.label)}
              </option>
            ))}
          </select>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="exp-task">{t("Task")}</Label>
          <select id="exp-task" name="taskId" value={taskId} onChange={(e) => setTaskId(e.target.value)} className={nativeSelectClass}>
            <option value="">{t("Whole project")}</option>
            {tasks.map((task) => (
              <option key={task.id} value={task.id}>
                #{task.number} {task.title}
              </option>
            ))}
          </select>
          <FieldError message={errors.taskId} />
        </div>
      </div>

      {!usageId && (
        <div className="grid gap-1.5">
          <Label htmlFor="exp-payee">
            {t("Paid to")} <span className="font-normal text-muted-foreground">{t("(optional)")}</span>
          </Label>
          <Input id="exp-payee" name="payee" defaultValue={expense?.payee ?? ""} placeholder={t("Municipality")} maxLength={120} />
        </div>
      )}

      <div className="grid gap-1.5">
        <Label htmlFor="exp-receipt">{t("Receipt")}</Label>
        {expense?.hasReceipt && !removeReceipt ? (
          <div className="flex items-center gap-2 rounded-lg border px-3 py-2 text-sm">
            <FileText className="size-4 text-muted-foreground" aria-hidden />
            <a href={`/api/files/receipts/${expense.id}`} target="_blank" rel="noreferrer" className="min-w-0 flex-1 truncate hover:underline">
              {expense.receiptName ?? t("Receipt")}
            </a>
            <Button type="button" variant="ghost" size="sm" onClick={() => setRemoveReceipt(true)}>
              {t("Remove")}
            </Button>
          </div>
        ) : null}
        <Input
          id="exp-receipt"
          name="receipt"
          type="file"
          accept="application/pdf,image/jpeg,image/png,image/webp"
          aria-describedby="exp-receipt-help"
          aria-invalid={Boolean(errors.receipt)}
          className="cursor-pointer file:me-3 file:cursor-pointer"
        />
        <p id="exp-receipt-help" className="text-xs text-muted-foreground">
          {expense?.hasReceipt && !removeReceipt ? `${t("Choosing a file replaces the current receipt.")} ` : ""}
          {t("PDF, JPG, PNG or WebP, up to 8 MB.")}
        </p>
        <FieldError message={errors.receipt} />
      </div>

      <DialogFooter className={cn(expense && "sm:justify-between")}>
        {expense && (
          <Button
            type="button"
            variant={confirmDelete ? "destructive" : "ghost"}
            disabled={pending}
            onClick={() => {
              if (!confirmDelete) {
                setConfirmDelete(true);
                return;
              }
              startTransition(async () => {
                const result = await deleteExpense(expense.id);
                if (!result.ok) {
                  toast.error(result.error);
                  return;
                }
                toast.success(t("Expense deleted"));
                onDone();
              });
            }}
          >
            <Trash2 className="size-4" />
            {confirmDelete ? t("Click again to delete") : t("Delete")}
          </Button>
        )}
        <div className="flex gap-2">
          <Button type="button" variant="ghost" onClick={onDone}>
            {t("Cancel")}
          </Button>
          <Button type="submit" disabled={pending}>
            {pending && <Loader2 className="size-4 animate-spin" />}
            {expense ? t("Save") : t("Add expense")}
          </Button>
        </div>
      </DialogFooter>
    </form>
  );
}
