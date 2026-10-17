"use server";

import { refresh } from "next/cache";
import { and, eq, max, sql } from "drizzle-orm";
import { z } from "zod";
import { requireWorkspaceById } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { activities, member, projects, taskStatuses, tasks } from "@/lib/db/schema";
import { POSITION_STEP, PRIORITIES } from "@/lib/constants";

type Result<T = undefined> = { ok: true; data?: T } | { ok: false; error: string };

/** Loads a task and authorizes the current user against its workspace. */
async function authorizeTask(taskId: string) {
  const [task] = await db.select().from(tasks).where(eq(tasks.id, taskId)).limit(1);
  if (!task) throw new Error("Task not found");
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

const createSchema = z.object({
  projectId: z.string().min(1),
  statusId: z.string().min(1),
  title: z.string().trim().min(1, "Title is required").max(300),
});

export async function createTask(input: z.input<typeof createSchema>): Promise<Result<{ number: number }>> {
  const parsed = createSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
  const { projectId, statusId, title } = parsed.data;

  const [project] = await db.select().from(projects).where(eq(projects.id, projectId)).limit(1);
  if (!project) return { ok: false, error: "Project not found" };
  const { user } = await requireWorkspaceById(project.workspaceId);
  const status = await statusInProject(statusId, projectId);
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
      .where(and(eq(tasks.projectId, projectId), eq(tasks.statusId, statusId)));

    const [task] = await tx
      .insert(tasks)
      .values({
        workspaceId: project.workspaceId,
        projectId,
        number: taskCounter,
        statusId,
        title,
        reporterId: user.id,
        position: (maxPos ?? 0) + POSITION_STEP,
        completedAt: status.category === "done" ? new Date() : null,
      })
      .returning({ id: tasks.id });

    await tx.insert(activities).values({
      workspaceId: project.workspaceId,
      projectId,
      taskId: task.id,
      actorId: user.id,
      type: "task.created",
      data: { title },
    });
    return taskCounter;
  });

  refresh();
  return { ok: true, data: { number } };
}

/** Drag & drop: move to a status and/or a new position (fractional index). */
export async function moveTask(taskId: string, statusId: string, position: number): Promise<Result> {
  if (!Number.isFinite(position)) return { ok: false, error: "Invalid position" };
  const { task, user } = await authorizeTask(taskId);
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
          completedAt: status.category === "done" ? new Date() : null,
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

const updateSchema = z
  .object({
    title: z.string().trim().min(1, "Title is required").max(300),
    description: z.string().max(20000).nullable(),
    statusId: z.string().min(1),
    priority: z.enum(PRIORITIES.map((p) => p.value) as [string, ...string[]]),
    assigneeId: z.string().min(1).nullable(),
    dueDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .nullable(),
  })
  .partial();

export type TaskPatch = z.input<typeof updateSchema>;

export async function updateTask(taskId: string, patch: TaskPatch): Promise<Result> {
  const parsed = updateSchema.safeParse(patch);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
  const changes = parsed.data;
  const { task, user } = await authorizeTask(taskId);

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
    set.completedAt = status.category === "done" ? new Date() : null;
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
  if (changes.dueDate !== undefined && changes.dueDate !== task.dueDate) {
    set.dueDate = changes.dueDate;
    log.push({ type: "task.due_date_changed", data: { from: task.dueDate, to: changes.dueDate } });
  }

  if (log.length === 0) return { ok: true };

  await db.transaction(async (tx) => {
    await tx.update(tasks).set(set).where(eq(tasks.id, taskId));
    await tx.insert(activities).values(
      log.map((entry) => ({
        workspaceId: task.workspaceId,
        projectId: task.projectId,
        taskId,
        actorId: user.id,
        ...entry,
      })),
    );
  });

  refresh();
  return { ok: true };
}
