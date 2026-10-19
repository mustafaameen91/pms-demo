import "server-only";
import { and, asc, desc, eq } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { db } from "@/lib/db";
import { expenses, projectResources, projects, resources, tasks, user } from "@/lib/db/schema";

export async function getProjectExpenses(projectId: string) {
  const linkedResource = alias(resources, "linked_resource");
  const decider = alias(user, "decider");
  return db
    .select({
      id: expenses.id,
      date: expenses.date,
      amount: expenses.amount,
      category: expenses.category,
      description: expenses.description,
      payee: expenses.payee,
      taskId: expenses.taskId,
      taskNumber: tasks.number,
      taskTitle: tasks.title,
      taskDeleted: tasks.deletedAt,
      projectResourceId: expenses.projectResourceId,
      resourceName: linkedResource.name,
      hasReceipt: expenses.receiptPath,
      receiptName: expenses.receiptName,
      createdById: expenses.createdById,
      createdByName: user.name,
      approvalStatus: expenses.approvalStatus,
      decidedByName: decider.name,
      decidedAt: expenses.decidedAt,
      decisionNote: expenses.decisionNote,
    })
    .from(expenses)
    .leftJoin(tasks, eq(tasks.id, expenses.taskId))
    .leftJoin(projectResources, eq(projectResources.id, expenses.projectResourceId))
    .leftJoin(linkedResource, eq(linkedResource.id, projectResources.resourceId))
    .leftJoin(user, eq(user.id, expenses.createdById))
    .leftJoin(decider, eq(decider.id, expenses.decidedById))
    .where(eq(expenses.projectId, projectId))
    .orderBy(desc(expenses.date), desc(expenses.createdAt));
}

export type ProjectExpense = Awaited<ReturnType<typeof getProjectExpenses>>[number];

/** Expense amounts for every project in a workspace, grouped by project id. */
export async function getWorkspaceExpenses(workspaceId: string) {
  const rows = await db
    .select({
      projectId: expenses.projectId,
      amount: expenses.amount,
      taskId: expenses.taskId,
      projectResourceId: expenses.projectResourceId,
      approvalStatus: expenses.approvalStatus,
    })
    .from(expenses)
    .where(eq(expenses.workspaceId, workspaceId));
  const map = new Map<string, typeof rows>();
  for (const r of rows) map.set(r.projectId, [...(map.get(r.projectId) ?? []), r]);
  return map;
}

/** Expenses waiting for approval that this user may decide, across the workspace. */
export async function listPendingApprovals(workspaceId: string, userId: string, isAdmin: boolean) {
  const rows = await db
    .select({
      id: expenses.id,
      date: expenses.date,
      amount: expenses.amount,
      description: expenses.description,
      payee: expenses.payee,
      createdAt: expenses.createdAt,
      requesterName: user.name,
      requesterId: expenses.createdById,
      projectName: projects.name,
      projectKey: projects.key,
      currency: projects.currency,
      threshold: projects.approvalThreshold,
      leadId: projects.leadId,
    })
    .from(expenses)
    .innerJoin(projects, eq(projects.id, expenses.projectId))
    .leftJoin(user, eq(user.id, expenses.createdById))
    .where(and(eq(expenses.workspaceId, workspaceId), eq(expenses.approvalStatus, "pending")))
    .orderBy(asc(expenses.createdAt));
  return rows.filter((r) => isAdmin || r.leadId === userId);
}
