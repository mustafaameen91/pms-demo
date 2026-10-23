import "server-only";
import { and, desc, eq, gte, isNull, lte } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { db } from "@/lib/db";
import { expenses, projects, tasks, timeEntries, user } from "@/lib/db/schema";

// One person's own records across a workspace (the phone app's "my hours" and
// "my expenses"). The person is the filter, so no further authorization is needed.

const decider = alias(user, "decider");

/** My hours between two dates (inclusive), newest first. */
export async function listMyTimeEntries(workspaceId: string, userId: string, from: string, to: string) {
  return db
    .select({
      id: timeEntries.id,
      date: timeEntries.date,
      projectId: timeEntries.projectId,
      projectKey: projects.key,
      projectName: projects.name,
      taskId: timeEntries.taskId,
      taskNumber: tasks.number,
      taskTitle: tasks.title,
      quantity: timeEntries.quantity,
      note: timeEntries.note,
      status: timeEntries.status,
      decisionNote: timeEntries.decisionNote,
      deciderName: decider.name,
    })
    .from(timeEntries)
    .innerJoin(projects, eq(projects.id, timeEntries.projectId))
    .leftJoin(tasks, and(eq(tasks.id, timeEntries.taskId), isNull(tasks.deletedAt)))
    .leftJoin(decider, eq(decider.id, timeEntries.decidedById))
    .where(
      and(
        eq(timeEntries.workspaceId, workspaceId),
        eq(timeEntries.userId, userId),
        eq(timeEntries.unit, "hour"),
        gte(timeEntries.date, from),
        lte(timeEntries.date, to),
      ),
    )
    .orderBy(desc(timeEntries.date), desc(timeEntries.createdAt));
}

/** The expenses I added (newest first), with where each stands. */
export async function listMyExpenses(workspaceId: string, userId: string, limit = 50) {
  return db
    .select({
      id: expenses.id,
      date: expenses.date,
      amount: expenses.amount,
      category: expenses.category,
      description: expenses.description,
      payee: expenses.payee,
      projectId: expenses.projectId,
      projectKey: projects.key,
      projectName: projects.name,
      currency: projects.currency,
      loanId: expenses.loanId,
      hasReceipt: expenses.receiptPath,
      approvalStatus: expenses.approvalStatus,
      decidedByName: decider.name,
      decisionNote: expenses.decisionNote,
    })
    .from(expenses)
    .innerJoin(projects, eq(projects.id, expenses.projectId))
    .leftJoin(decider, eq(decider.id, expenses.decidedById))
    .where(and(eq(expenses.workspaceId, workspaceId), eq(expenses.createdById, userId)))
    .orderBy(desc(expenses.createdAt))
    .limit(limit);
}
