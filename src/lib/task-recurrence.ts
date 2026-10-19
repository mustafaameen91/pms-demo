import "server-only";
import { and, asc, eq, isNull, max, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { activities, projects, taskStatuses, tasks } from "@/lib/db/schema";
import { nextOccurrence, type Recurrence } from "@/lib/recurrence";
import { todayISO } from "@/lib/accomplishment";
import { formatDate } from "@/lib/utils";
import { POSITION_STEP } from "@/lib/constants";

/** First "To do"-type status, falling back to the first column. */
export async function defaultStatus(projectId: string) {
  const statuses = await db
    .select()
    .from(taskStatuses)
    .where(eq(taskStatuses.projectId, projectId))
    .orderBy(asc(taskStatuses.position));
  return statuses.find((s) => s.category === "todo") ?? statuses[0] ?? null;
}

/**
 * When a repeating task is finished, create its next occurrence (once).
 * Copies title, description, priority, assignee, budget and sub-tasks;
 * progress starts at 0 and weight is left empty (it would exceed 100%).
 */
export async function spawnNextOccurrence(taskId: string, actorId: string | null): Promise<string | undefined> {
  const [task] = await db.select().from(tasks).where(eq(tasks.id, taskId)).limit(1);
  if (!task?.recurrence || task.recurrenceNextId || task.deletedAt) return;
  const status = await defaultStatus(task.projectId);
  if (!status) return;
  const dates = nextOccurrence(task, task.recurrence as Recurrence, todayISO());
  const subtasks = await db
    .select({ title: tasks.title })
    .from(tasks)
    .where(and(eq(tasks.parentId, taskId), isNull(tasks.deletedAt)))
    .orderBy(asc(tasks.position));

  const result = await db.transaction(async (tx) => {
    // Claim the spawn first so two quick "done" clicks can't create two copies.
    const claimed = await tx
      .update(tasks)
      .set({ recurrenceNextId: "pending" })
      .where(and(eq(tasks.id, taskId), isNull(tasks.recurrenceNextId)))
      .returning({ id: tasks.id });
    if (claimed.length === 0) return null;
    const [{ taskCounter }] = await tx
      .update(projects)
      .set({ taskCounter: sql`${projects.taskCounter} + ${1 + subtasks.length}` })
      .where(eq(projects.id, task.projectId))
      .returning({ taskCounter: projects.taskCounter });
    const firstNumber = taskCounter - subtasks.length;
    const [{ maxPos }] = await tx
      .select({ maxPos: max(tasks.position) })
      .from(tasks)
      .where(and(eq(tasks.projectId, task.projectId), eq(tasks.statusId, status.id)));
    const [next] = await tx
      .insert(tasks)
      .values({
        workspaceId: task.workspaceId,
        projectId: task.projectId,
        number: firstNumber,
        statusId: status.id,
        title: task.title,
        description: task.description,
        priority: task.priority,
        assigneeId: task.assigneeId,
        reporterId: actorId,
        budget: task.budget,
        isMilestone: task.isMilestone,
        recurrence: task.recurrence,
        position: (maxPos ?? 0) + POSITION_STEP,
        ...dates,
      })
      .returning({ id: tasks.id, number: tasks.number });
    for (const [i, sub] of subtasks.entries()) {
      await tx.insert(tasks).values({
        workspaceId: task.workspaceId,
        projectId: task.projectId,
        parentId: next.id,
        number: firstNumber + 1 + i,
        statusId: status.id,
        title: sub.title,
        reporterId: actorId,
        position: (i + 1) * POSITION_STEP,
      });
    }
    await tx.update(tasks).set({ recurrenceNextId: next.id }).where(eq(tasks.id, taskId));
    await tx.insert(activities).values({
      workspaceId: task.workspaceId,
      projectId: task.projectId,
      taskId,
      actorId,
      type: "task.recurred",
      data: { number: next.number, dueDate: dates.dueDate },
    });
    return next;
  });
  if (!result) return;
  const [project] = await db.select({ key: projects.key }).from(projects).where(eq(projects.id, task.projectId)).limit(1);
  return `Repeats: ${project.key}-${result.number} created, due ${formatDate(dates.dueDate)}`;
}
