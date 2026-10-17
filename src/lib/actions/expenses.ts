"use server";

import { refresh } from "next/cache";
import { and, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import { requireWorkspaceById } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { activities, expenses, projectResources, projects, tasks } from "@/lib/db/schema";
import { EXPENSE_CATEGORIES } from "@/lib/constants";
import { canManageProject } from "@/lib/permissions";
import { deleteStoredFile, saveReceipt } from "@/lib/uploads";
import { MAX_MONEY, optionalDecimal } from "@/lib/validation";
import { checkOverBudget } from "@/lib/budget-alerts";

export type ExpenseResult = { ok: true } | { ok: false; error: string; fieldErrors?: Record<string, string> };

const expenseSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Choose a date"),
  amount: optionalDecimal(MAX_MONEY, "Enter a valid amount").refine((v) => v !== null && Number(v) > 0, {
    message: "Enter an amount greater than 0",
  }),
  category: z.enum(EXPENSE_CATEGORIES.map((c) => c.value) as [string, ...string[]]),
  description: z.string().trim().min(1, "Describe what was paid for").max(300),
  payee: z
    .string()
    .trim()
    .max(120)
    .nullish()
    .transform((v) => v || null),
  taskId: z.string().nullish().transform((v) => v || null),
  projectResourceId: z.string().nullish().transform((v) => v || null),
});

type Category = (typeof expenses.$inferInsert)["category"];

function fieldErrorsOf(error: z.ZodError): ExpenseResult {
  const fieldErrors: Record<string, string> = {};
  for (const issue of error.issues) fieldErrors[String(issue.path[0])] ??= issue.message;
  return { ok: false, error: error.issues[0].message, fieldErrors };
}

async function loadProject(projectId: string) {
  const [project] = await db.select().from(projects).where(eq(projects.id, projectId)).limit(1);
  if (!project) return null;
  return { project, ...(await requireWorkspaceById(project.workspaceId)) };
}

/** Create (no expenseId) or update an expense. Accepts an optional receipt file. */
export async function saveExpense(formData: FormData): Promise<ExpenseResult> {
  const projectId = String(formData.get("projectId") ?? "");
  const expenseId = String(formData.get("expenseId") ?? "") || null;
  const auth = await loadProject(projectId);
  if (!auth) return { ok: false, error: "Project not found" };
  const { project, user, role } = auth;

  const parsed = expenseSchema.safeParse({
    date: formData.get("date"),
    amount: formData.get("amount"),
    category: formData.get("category"),
    description: formData.get("description"),
    payee: formData.get("payee"),
    taskId: formData.get("taskId"),
    projectResourceId: formData.get("projectResourceId"),
  });
  if (!parsed.success) return fieldErrorsOf(parsed.error);
  const data = parsed.data;

  // Linked task / resource must belong to this project.
  if (data.taskId) {
    const [task] = await db
      .select({ id: tasks.id })
      .from(tasks)
      .where(and(eq(tasks.id, data.taskId), eq(tasks.projectId, projectId), isNull(tasks.deletedAt)))
      .limit(1);
    if (!task) return { ok: false, error: "Task not found", fieldErrors: { taskId: "Task not found" } };
  }
  if (data.projectResourceId) {
    const [usage] = await db
      .select({ id: projectResources.id })
      .from(projectResources)
      .where(and(eq(projectResources.id, data.projectResourceId), eq(projectResources.projectId, projectId)))
      .limit(1);
    if (!usage) {
      return { ok: false, error: "Resource not found", fieldErrors: { projectResourceId: "Resource not found" } };
    }
  }

  let existing: typeof expenses.$inferSelect | undefined;
  if (expenseId) {
    [existing] = await db
      .select()
      .from(expenses)
      .where(and(eq(expenses.id, expenseId), eq(expenses.projectId, projectId)))
      .limit(1);
    if (!existing) return { ok: false, error: "Expense not found" };
    if (existing.createdById !== user.id && !canManageProject(role, user.id, project)) {
      return { ok: false, error: "Only the person who added it, the project manager or admins can edit this expense." };
    }
  }

  // Receipt: new upload replaces the old file; "removeReceipt" clears it.
  const file = formData.get("receipt");
  let receipt: { receiptPath: string | null; receiptName: string | null; receiptType: string | null } | undefined;
  if (file instanceof File && file.size > 0) {
    const saved = await saveReceipt(project.workspaceId, file);
    if ("error" in saved) return { ok: false, error: saved.error, fieldErrors: { receipt: saved.error } };
    receipt = { receiptPath: saved.path, receiptName: saved.name, receiptType: saved.type };
  } else if (formData.get("removeReceipt") === "1") {
    receipt = { receiptPath: null, receiptName: null, receiptType: null };
  }

  const values = { ...data, category: data.category as Category, amount: data.amount! };
  try {
    await db.transaction(async (tx) => {
      if (existing) {
        await tx
          .update(expenses)
          .set({ ...values, ...receipt })
          .where(eq(expenses.id, existing.id));
      } else {
        await tx.insert(expenses).values({
          ...values,
          ...receipt,
          workspaceId: project.workspaceId,
          projectId,
          createdById: user.id,
        });
      }
      await tx.insert(activities).values({
        workspaceId: project.workspaceId,
        projectId,
        taskId: data.taskId,
        actorId: user.id,
        type: existing ? "expense.updated" : "expense.added",
        data: { description: data.description, amount: values.amount },
      });
    });
  } catch (error) {
    // Don't leave an orphaned upload behind.
    if (receipt?.receiptPath) await deleteStoredFile(receipt.receiptPath);
    throw error;
  }
  if (existing && receipt) await deleteStoredFile(existing.receiptPath);
  await checkOverBudget(projectId, user.id);

  refresh();
  return { ok: true };
}

export async function deleteExpense(expenseId: string): Promise<ExpenseResult> {
  const [expense] = await db.select().from(expenses).where(eq(expenses.id, expenseId)).limit(1);
  if (!expense) return { ok: false, error: "Expense not found" };
  const auth = await loadProject(expense.projectId);
  if (!auth) return { ok: false, error: "Project not found" };
  const { project, user, role } = auth;
  if (expense.createdById !== user.id && !canManageProject(role, user.id, project)) {
    return { ok: false, error: "Only the person who added it, the project manager or admins can delete this expense." };
  }

  await db.transaction(async (tx) => {
    await tx.delete(expenses).where(eq(expenses.id, expenseId));
    await tx.insert(activities).values({
      workspaceId: expense.workspaceId,
      projectId: expense.projectId,
      actorId: user.id,
      type: "expense.deleted",
      data: { description: expense.description, amount: expense.amount },
    });
  });
  await deleteStoredFile(expense.receiptPath);
  refresh();
  return { ok: true };
}
