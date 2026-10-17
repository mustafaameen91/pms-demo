"use server";

import { refresh } from "next/cache";
import { and, asc, eq, isNull, max, or, sql } from "drizzle-orm";
import { z } from "zod";
import { requireWorkspaceById } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { activities, member, projects, taskStatuses, tasks } from "@/lib/db/schema";
import { POSITION_STEP, PRIORITIES } from "@/lib/constants";
import { MAX_MONEY, optionalDecimal } from "@/lib/validation";
import { notify, projectContext } from "@/lib/notifications";

type Result<T = undefined> = { ok: true; data?: T } | { ok: false; error: string };

/** Loads a task and authorizes the current user against its workspace. */
async function authorizeTask(taskId: string, { includeDeleted = false } = {}) {
  const [task] = await db
    .select()
    .from(tasks)
    .where(and(eq(tasks.id, taskId), includeDeleted ? undefined : isNull(tasks.deletedAt)))
    .limit(1);
  if (!task) return null;
  const { user } = await requireWorkspaceById(task.workspaceId);
  return { task, user };
}

async function statusInProject(statusId: string, projectId: string) {
  const [status] = await db
    .select()
    .from(taskStatuses)
    .where(and(eq(taskStatuses.id, statusId), eq(taskStatuses.projectId, projectId)))
    .limit(1);
  return status ?? null;
}

/** First "To do"-type status, falling back to the first column. */
async function defaultStatus(projectId: string) {
  const statuses = await db
    .select()
    .from(taskStatuses)
    .where(eq(taskStatuses.projectId, projectId))
    .orderBy(asc(taskStatuses.position));
  return statuses.find((s) => s.category === "todo") ?? statuses[0] ?? null;
}

const isDone = (category: string) => category === "done" || category === "canceled";

const createSchema = z.object({
  projectId: z.string().min(1),
  statusId: z.string().min(1).optional(),
  parentId: z.string().min(1).optional(),
  title: z.string().trim().min(1, "Title is required").max(300),
});

export async function createTask(input: z.input<typeof createSchema>): Promise<Result<{ number: number }>> {
  const parsed = createSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
  const { projectId, parentId, title } = parsed.data;

  const [project] = await db.select().from(projects).where(eq(projects.id, projectId)).limit(1);
  if (!project) return { ok: false, error: "Project not found" };
  const { user } = await requireWorkspaceById(project.workspaceId);

  if (parentId) {
    const [parent] = await db
      .select({ parentId: tasks.parentId })
      .from(tasks)
      .where(and(eq(tasks.id, parentId), eq(tasks.projectId, projectId), isNull(tasks.deletedAt)))
      .limit(1);
    if (!parent) return { ok: false, error: "Parent task not found" };
    if (parent.parentId) return { ok: false, error: "Sub-tasks can't have their own sub-tasks" };
  }

  const status = parsed.data.statusId
    ? await statusInProject(parsed.data.statusId, projectId)
    : await defaultStatus(projectId);
  if (!status) return { ok: false, error: "Invalid status" };

  const number = await db.transaction(async (tx) => {
    // Atomic counter: concurrent creates can't get the same task number.
    const [{ taskCounter }] = await tx
      .update(projects)
      .set({ taskCounter: sql`${projects.taskCounter} + 1` })
      .where(eq(projects.id, projectId))
      .returning({ taskCounter: projects.taskCounter });

    const [{ maxPos }] = await tx
      .select({ maxPos: max(tasks.position) })
      .from(tasks)
      .where(and(eq(tasks.projectId, projectId), eq(tasks.statusId, status.id)));

    const done = isDone(status.category);
    const [task] = await tx
      .insert(tasks)
      .values({
        workspaceId: project.workspaceId,
        projectId,
        parentId: parentId ?? null,
        number: taskCounter,
        statusId: status.id,
        title,
        reporterId: user.id,
        position: (maxPos ?? 0) + POSITION_STEP,
        progress: done ? 100 : 0,
        completedAt: done ? new Date() : null,
      })
      .returning({ id: tasks.id });

    await tx.insert(activities).values({
      workspaceId: project.workspaceId,
      projectId,
      taskId: parentId ?? task.id,
      actorId: user.id,
      type: parentId ? "subtask.created" : "task.created",
      data: { title, number: taskCounter },
    });
    return taskCounter;
  });

  refresh();
  return { ok: true, data: { number } };
}

/** Drag & drop: move to a status and/or a new position (fractional index). */
export async function moveTask(taskId: string, statusId: string, position: number): Promise<Result> {
  if (!Number.isFinite(position)) return { ok: false, error: "Invalid position" };
  const auth = await authorizeTask(taskId);
  if (!auth) return { ok: false, error: "Task not found" };
  const { task, user } = auth;
  const status = await statusInProject(statusId, task.projectId);
  if (!status) return { ok: false, error: "Invalid status" };

  const statusChanged = task.statusId !== statusId;
  await db.transaction(async (tx) => {
    await tx
      .update(tasks)
      .set({
        statusId,
        position,
        ...(statusChanged && {
          completedAt: isDone(status.category) ? new Date() : null,
          ...(isDone(status.category) && { progress: 100 }),
        }),
      })
      .where(eq(tasks.id, taskId));

    if (statusChanged) {
      await tx.insert(activities).values({
        workspaceId: task.workspaceId,
        projectId: task.projectId,
        taskId,
        actorId: user.id,
        type: "task.status_changed",
        data: { from: task.statusId, to: statusId, toName: status.name },
      });
    }
  });

  refresh();
  return { ok: true };
}

const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .nullable();

const updateSchema = z
  .object({
    title: z.string().trim().min(1, "Title is required").max(300),
    description: z.string().max(20000).nullable(),
    statusId: z.string().min(1),
    priority: z.enum(PRIORITIES.map((p) => p.value) as [string, ...string[]]),
    assigneeId: z.string().min(1).nullable(),
    startDate: isoDate,
    dueDate: isoDate,
    weight: optionalDecimal(100, "Weight must be between 0 and 100%"),
    progress: z.number().int().min(0, "Progress must be 0–100%").max(100, "Progress must be 0–100%"),
    budget: optionalDecimal(MAX_MONEY, "Enter a valid amount"),
  })
  .partial();

export type TaskPatch = z.input<typeof updateSchema>;

const sameNumber = (a: string | null, b: string | null) =>
  (a === null ? null : Number(a)) === (b === null ? null : Number(b));

export async function updateTask(taskId: string, patch: TaskPatch): Promise<Result> {
  const parsed = updateSchema.safeParse(patch);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
  const changes = parsed.data;
  const auth = await authorizeTask(taskId);
  if (!auth) return { ok: false, error: "Task not found" };
  const { task, user } = auth;

  const set: Partial<typeof tasks.$inferInsert> = {};
  const log: { type: string; data: Record<string, unknown> }[] = [];

  if (changes.title !== undefined && changes.title !== task.title) {
    set.title = changes.title;
    log.push({ type: "task.renamed", data: { from: task.title, to: changes.title } });
  }
  if (changes.description !== undefined && changes.description !== task.description) {
    set.description = changes.description || null;
    log.push({ type: "task.description_changed", data: {} });
  }
  if (changes.statusId !== undefined && changes.statusId !== task.statusId) {
    const status = await statusInProject(changes.statusId, task.projectId);
    if (!status) return { ok: false, error: "Invalid status" };
    const [{ maxPos }] = await db
      .select({ maxPos: max(tasks.position) })
      .from(tasks)
      .where(and(eq(tasks.projectId, task.projectId), eq(tasks.statusId, status.id)));
    set.statusId = status.id;
    set.position = (maxPos ?? 0) + POSITION_STEP;
    set.completedAt = isDone(status.category) ? new Date() : null;
    // Finishing a task means it's 100% done.
    if (isDone(status.category) && changes.progress === undefined) set.progress = 100;
    log.push({ type: "task.status_changed", data: { from: task.statusId, to: status.id, toName: status.name } });
  }
  if (changes.priority !== undefined && changes.priority !== task.priority) {
    set.priority = changes.priority as typeof task.priority;
    log.push({ type: "task.priority_changed", data: { from: task.priority, to: changes.priority } });
  }
  if (changes.assigneeId !== undefined && changes.assigneeId !== task.assigneeId) {
    if (changes.assigneeId) {
      const [isMember] = await db
        .select({ id: member.id })
        .from(member)
        .where(and(eq(member.organizationId, task.workspaceId), eq(member.userId, changes.assigneeId)))
        .limit(1);
      if (!isMember) return { ok: false, error: "Assignee is not a member of this workspace" };
    }
    set.assigneeId = changes.assigneeId;
    log.push({ type: "task.assignee_changed", data: { from: task.assigneeId, to: changes.assigneeId } });
  }
  if (changes.startDate !== undefined && changes.startDate !== task.startDate) {
    set.startDate = changes.startDate;
    log.push({ type: "task.start_date_changed", data: { from: task.startDate, to: changes.startDate } });
  }
  if (changes.dueDate !== undefined && changes.dueDate !== task.dueDate) {
    set.dueDate = changes.dueDate;
    log.push({ type: "task.due_date_changed", data: { from: task.dueDate, to: changes.dueDate } });
  }
  const start = set.startDate !== undefined ? set.startDate : task.startDate;
  const end = set.dueDate !== undefined ? set.dueDate : task.dueDate;
  if (start && end && end < start) return { ok: false, error: "End date must be on or after the start date" };

  if (changes.weight !== undefined && !sameNumber(changes.weight, task.weight)) {
    if (task.parentId) return { ok: false, error: "Weight is set on main tasks, not sub-tasks" };
    set.weight = changes.weight;
    log.push({ type: "task.weight_changed", data: { from: task.weight, to: changes.weight } });
  }
  if (changes.progress !== undefined && changes.progress !== (set.progress ?? task.progress)) {
    set.progress = changes.progress;
    log.push({ type: "task.progress_changed", data: { from: task.progress, to: changes.progress } });
  }
  if (changes.budget !== undefined && !sameNumber(changes.budget, task.budget)) {
    set.budget = changes.budget;
    log.push({ type: "task.budget_changed", data: { from: task.budget, to: changes.budget } });
  }

  if (Object.keys(set).length === 0) return { ok: true };

  const newAssignee = set.assigneeId !== undefined ? set.assigneeId : undefined;

  await db.transaction(async (tx) => {
    await tx.update(tasks).set(set).where(eq(tasks.id, taskId));
    if (log.length) {
      await tx.insert(activities).values(
        log.map((entry) => ({
          workspaceId: task.workspaceId,
          projectId: task.projectId,
          taskId,
          actorId: user.id,
          ...entry,
        })),
      );
    }
  });

  if (newAssignee) {
    const ctx = await projectContext(task.projectId);
    if (ctx) {
      await notify({
        workspaceId: task.workspaceId,
        userIds: [newAssignee],
        actorId: user.id,
        type: "task.assigned",
        title: `${user.name} assigned you ${ctx.key}-${task.number} ${set.title ?? task.title}`,
        body: `Project: ${ctx.name}`,
        link: `/w/${ctx.slug}/p/${ctx.key}?task=${ctx.key}-${task.number}`,
        email: true,
      });
    }
  }

  refresh();
  return { ok: true };
}

/** Soft-deletes a task and its sub-tasks; restoreTask() undoes it. */
export async function deleteTask(taskId: string): Promise<Result> {
  const auth = await authorizeTask(taskId);
  if (!auth) return { ok: false, error: "Task not found" };
  const { task, user } = auth;
  const now = new Date();

  await db.transaction(async (tx) => {
    await tx
      .update(tasks)
      .set({ deletedAt: now })
      .where(and(or(eq(tasks.id, taskId), eq(tasks.parentId, taskId)), isNull(tasks.deletedAt)));
    await tx.insert(activities).values({
      workspaceId: task.workspaceId,
      projectId: task.projectId,
      taskId: task.parentId ?? taskId,
      actorId: user.id,
      type: task.parentId ? "subtask.deleted" : "task.deleted",
      data: { title: task.title, number: task.number },
    });
  });

  refresh();
  return { ok: true };
}

export async function restoreTask(taskId: string): Promise<Result> {
  const auth = await authorizeTask(taskId, { includeDeleted: true });
  if (!auth) return { ok: false, error: "Task not found" };
  const { task, user } = auth;
  if (!task.deletedAt) return { ok: true };

  await db.transaction(async (tx) => {
    // Bring back the task plus the sub-tasks that were deleted together with it.
    await tx
      .update(tasks)
      .set({ deletedAt: null })
      .where(and(or(eq(tasks.id, taskId), eq(tasks.parentId, taskId)), eq(tasks.deletedAt, task.deletedAt!)));
    await tx.insert(activities).values({
      workspaceId: task.workspaceId,
      projectId: task.projectId,
      taskId: task.parentId ?? taskId,
      actorId: user.id,
      type: task.parentId ? "subtask.restored" : "task.restored",
      data: { title: task.title, number: task.number },
    });
  });

  refresh();
  return { ok: true };
}
