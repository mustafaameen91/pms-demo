"use server";

import { refresh } from "next/cache";
import { and, eq, isNull, max, or, sql } from "drizzle-orm";
import { z } from "zod";
import { requireWorkspaceById } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { activities, member, projects, taskDependencies, taskStatuses, tasks } from "@/lib/db/schema";
import { isFinished, startsTooEarly, wouldCreateCycle } from "@/lib/dependencies";
import { defaultStatus, spawnNextOccurrence } from "@/lib/task-recurrence";
import { POSITION_STEP, PRIORITIES } from "@/lib/constants";
import { MAX_MONEY, optionalDecimal } from "@/lib/validation";
import { notify, projectContext } from "@/lib/notifications";
import { runAutomations } from "@/lib/automation-runner";

/** `warning`: the change was saved, but the user should know something (e.g. started while blocked). */
type Result<T = undefined> =
  | { ok: true; data?: T; warning?: string; info?: string }
  | { ok: false; error: string };

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

const isDone = (category: string) => category === "done" || category === "canceled";

/** Unfinished predecessors of a task, and the latest end date among all its predecessors. */
async function predecessorState(taskId: string) {
  const rows = await db
    .select({ number: tasks.number, title: tasks.title, dueDate: tasks.dueDate, category: taskStatuses.category })
    .from(taskDependencies)
    .innerJoin(tasks, and(eq(tasks.id, taskDependencies.dependsOnId), isNull(tasks.deletedAt)))
    .innerJoin(taskStatuses, eq(taskStatuses.id, tasks.statusId))
    .where(eq(taskDependencies.taskId, taskId));
  return { open: rows.filter((r) => !isFinished(r.category)), all: rows };
}

const listTitles = (rows: { title: string }[]) => rows.map((r) => `“${r.title}”`).join(", ");


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

  const created = await db.transaction(async (tx) => {
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
    return { id: task.id, number: taskCounter };
  });

  const notes = parentId ? [] : await runAutomations({ type: "task.created", projectId, taskId: created.id }, user.id);
  refresh();
  return { ok: true, data: { number: created.number }, ...(notes.length && { info: notes.join(" · ") }) };
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

  const notes = statusChanged && !task.parentId
    ? await runAutomations({ type: "task.status_changed", projectId: task.projectId, taskId, statusId }, user.id)
    : [];
  const repeat = statusChanged && status.category === "done" ? await spawnNextOccurrence(taskId, user.id) : undefined;
  const info = [repeat, ...notes].filter(Boolean).join(" · ");
  refresh();
  if (info) return { ok: true, info };
  if (statusChanged && status.category !== "todo" && status.category !== "backlog") {
    const { open } = await predecessorState(taskId);
    if (open.length) return { ok: true, warning: `Started before ${listTitles(open)} ${open.length === 1 ? "is" : "are"} finished.` };
  }
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
    isMilestone: z.boolean(),
    recurrence: z.enum(["daily", "weekly", "monthly", "yearly"]).nullable(),
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

  if (changes.recurrence !== undefined && changes.recurrence !== task.recurrence) {
    if (task.parentId) return { ok: false, error: "Sub-tasks can't repeat; set it on the main task" };
    set.recurrence = changes.recurrence;
    log.push({ type: "task.recurrence_changed", data: { to: changes.recurrence } });
  }
  if (changes.isMilestone !== undefined && changes.isMilestone !== task.isMilestone) {
    if (task.parentId) return { ok: false, error: "Only main tasks can be milestones" };
    set.isMilestone = changes.isMilestone;
    if (changes.isMilestone) {
      // A milestone is a single date with no weight: keep the end date, drop the rest.
      set.dueDate = set.dueDate !== undefined ? set.dueDate : (task.dueDate ?? task.startDate);
      set.startDate = null;
      set.weight = null;
    }
    log.push({ type: changes.isMilestone ? "task.made_milestone" : "task.unmade_milestone", data: {} });
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

  let info: string | undefined;
  if (set.statusId) {
    const notes = task.parentId
      ? []
      : await runAutomations({ type: "task.status_changed", projectId: task.projectId, taskId, statusId: set.statusId }, user.id);
    const [st] = await db.select({ category: taskStatuses.category }).from(taskStatuses).where(eq(taskStatuses.id, set.statusId));
    const repeat = st?.category === "done" ? await spawnNextOccurrence(taskId, user.id) : undefined;
    info = [repeat, ...notes].filter(Boolean).join(" · ") || undefined;
  }
  refresh();
  if (info) return { ok: true, info };

  // Saved; now tell the user if this breaks a dependency.
  const started =
    (set.statusId !== undefined && set.completedAt !== undefined && changes.statusId !== undefined) ||
    (set.progress !== undefined && set.progress > 0 && task.progress === 0);
  if (started || set.startDate) {
    const { open, all } = await predecessorState(taskId);
    if (started && open.length) {
      const [newStatus] = set.statusId
        ? await db.select({ category: taskStatuses.category }).from(taskStatuses).where(eq(taskStatuses.id, set.statusId))
        : [null];
      if (!newStatus || (newStatus.category !== "todo" && newStatus.category !== "backlog")) {
        return { ok: true, warning: `Started before ${listTitles(open)} ${open.length === 1 ? "is" : "are"} finished.` };
      }
    }
    const start = set.startDate ?? task.startDate;
    const clash = all.filter((p) => startsTooEarly(start, p.dueDate));
    if (set.startDate && clash.length) {
      return { ok: true, warning: `Starts before ${listTitles(clash)} ${clash.length === 1 ? "ends" : "end"}.` };
    }
  }
  return { ok: true };
}

/** "taskId can't start before dependsOnId is finished." Same project, no loops. */
export async function addDependency(taskId: string, dependsOnId: string): Promise<Result> {
  const auth = await authorizeTask(taskId);
  if (!auth) return { ok: false, error: "Task not found" };
  const { task, user } = auth;
  const [other] = await db
    .select()
    .from(tasks)
    .where(and(eq(tasks.id, dependsOnId), eq(tasks.projectId, task.projectId), isNull(tasks.deletedAt)))
    .limit(1);
  if (!other) return { ok: false, error: "That task isn't in this project." };
  const edges = await db
    .select({ taskId: taskDependencies.taskId, dependsOnId: taskDependencies.dependsOnId })
    .from(taskDependencies)
    .where(eq(taskDependencies.projectId, task.projectId));
  if (edges.some((e) => e.taskId === taskId && e.dependsOnId === dependsOnId)) return { ok: true };
  if (wouldCreateCycle(edges, taskId, dependsOnId)) {
    return { ok: false, error: `That would make a loop: “${other.title}” already waits on this task.` };
  }
  await db.transaction(async (tx) => {
    await tx.insert(taskDependencies).values({ workspaceId: task.workspaceId, projectId: task.projectId, taskId, dependsOnId });
    await tx.insert(activities).values({
      workspaceId: task.workspaceId,
      projectId: task.projectId,
      taskId,
      actorId: user.id,
      type: "task.dependency_added",
      data: { number: other.number, title: other.title },
    });
  });
  refresh();
  return startsTooEarly(task.startDate, other.dueDate)
    ? { ok: true, warning: `This task starts before “${other.title}” ends. Consider moving its start date.` }
    : { ok: true };
}

export async function removeDependency(taskId: string, dependsOnId: string): Promise<Result> {
  const auth = await authorizeTask(taskId);
  if (!auth) return { ok: false, error: "Task not found" };
  const { task, user } = auth;
  const [other] = await db.select({ number: tasks.number, title: tasks.title }).from(tasks).where(eq(tasks.id, dependsOnId)).limit(1);
  await db.transaction(async (tx) => {
    await tx
      .delete(taskDependencies)
      .where(and(eq(taskDependencies.taskId, taskId), eq(taskDependencies.dependsOnId, dependsOnId)));
    await tx.insert(activities).values({
      workspaceId: task.workspaceId,
      projectId: task.projectId,
      taskId,
      actorId: user.id,
      type: "task.dependency_removed",
      data: { number: other?.number, title: other?.title },
    });
  });
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
