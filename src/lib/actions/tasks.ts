"use server";

import { refreshPage } from "@/lib/refresh-page";
import { and, eq, isNull, max, or, sql } from "drizzle-orm";
import { z } from "zod";
import { requireWorkspaceById } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { activities, member, projects, taskDependencies, taskStatuses, tasks } from "@/lib/db/schema";
import { startsTooEarly, wouldCreateCycle } from "@/lib/dependencies";
import { defaultStatus, spawnNextOccurrence } from "@/lib/task-recurrence";
import { POSITION_STEP, PRIORITIES } from "@/lib/constants";
import { MAX_MONEY, optionalDecimal } from "@/lib/validation";
import { notify, projectContext } from "@/lib/notifications";
import { runAutomations } from "@/lib/automation-runner";
import { canManageProject, type TaskEdit } from "@/lib/permissions";
import { addToTeam } from "@/lib/data/project-access";
import { authorizeTask, denied, listTitles, predecessorState } from "@/lib/task-access";
import { getT } from "@/i18n/server";
import type { T } from "@/i18n/translate";

/** `warning`: the change was saved, but the user should know something (e.g. started while blocked). */
type Result<T = undefined> =
  | { ok: true; data?: T; warning?: string; info?: string }
  | { ok: false; error: string };

async function statusInProject(statusId: string, projectId: string) {
  const [status] = await db
    .select()
    .from(taskStatuses)
    .where(and(eq(taskStatuses.id, statusId), eq(taskStatuses.projectId, projectId)))
    .limit(1);
  return status ?? null;
}

const isDone = (category: string) => category === "done" || category === "canceled";

/** "Started before “A” is finished." — saved, but a predecessor isn't done yet. */
const startedEarly = (open: { title: string }[], t: T) =>
  open.length === 1
    ? t("Started before {titles} is finished.", { titles: listTitles(open, t) })
    : t("Started before {titles} are finished.", { titles: listTitles(open, t) });


const createSchema = z.object({
  projectId: z.string().min(1),
  statusId: z.string().min(1).optional(),
  parentId: z.string().min(1).optional(),
  title: z.string().trim().min(1, "Title is required").max(300),
});

export async function createTask(input: z.input<typeof createSchema>): Promise<Result<{ number: number }>> {
  const t = await getT();
  const parsed = createSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: t(parsed.error.issues[0].message) };
  const { projectId, parentId, title } = parsed.data;

  const [project] = await db.select().from(projects).where(eq(projects.id, projectId)).limit(1);
  if (!project) return { ok: false, error: t("Project not found") };
  const { user, role } = await requireWorkspaceById(project.workspaceId);

  if (parentId) {
    const parentAuth = await authorizeTask(parentId);
    if (!parentAuth || parentAuth.task.projectId !== projectId) return { ok: false, error: t("Parent task not found") };
    if (parentAuth.task.parentId) return { ok: false, error: t("Sub-tasks can't have their own sub-tasks") };
    const no = denied(parentAuth, "subtasks", t);
    if (no) return { ok: false, error: no };
  } else if (!canManageProject(role, user.id, project)) {
    return { ok: false, error: t("Only the project manager or admins can add tasks.") };
  }

  const status = parsed.data.statusId
    ? await statusInProject(parsed.data.statusId, projectId)
    : await defaultStatus(projectId);
  if (!status) return { ok: false, error: t("Invalid status") };

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

  const notes = parentId ? [] : await runAutomations({ type: "task.created", projectId, taskId: created.id }, user.id, t);
  refreshPage();
  return { ok: true, data: { number: created.number }, ...(notes.length && { info: notes.join(" · ") }) };
}

/** Drag & drop: move to a status and/or a new position (fractional index). */
export async function moveTask(taskId: string, statusId: string, position: number): Promise<Result> {
  const t = await getT();
  if (!Number.isFinite(position)) return { ok: false, error: t("Invalid position") };
  const auth = await authorizeTask(taskId);
  if (!auth) return { ok: false, error: t("Task not found") };
  const { task, user } = auth;
  const no = denied(auth, "status", t);
  if (no) return { ok: false, error: no };
  const status = await statusInProject(statusId, task.projectId);
  if (!status) return { ok: false, error: t("Invalid status") };

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
    ? await runAutomations({ type: "task.status_changed", projectId: task.projectId, taskId, statusId }, user.id, t)
    : [];
  const repeat = statusChanged && status.category === "done" ? await spawnNextOccurrence(taskId, user.id, t) : undefined;
  const info = [repeat, ...notes].filter(Boolean).join(" · ");
  refreshPage();
  if (info) return { ok: true, info };
  if (statusChanged && status.category !== "todo" && status.category !== "backlog") {
    const { open } = await predecessorState(taskId);
    if (open.length) return { ok: true, warning: startedEarly(open, t) };
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

/** Which permission each task field needs. */
const PATCH_EDIT = {
  title: "title",
  description: "description",
  statusId: "status",
  priority: "priority",
  assigneeId: "assignee",
  startDate: "dates",
  dueDate: "dates",
  weight: "weight",
  progress: "progress",
  budget: "budget",
  isMilestone: "milestone",
  recurrence: "recurrence",
} as const satisfies Record<keyof NonNullable<z.infer<typeof updateSchema>>, TaskEdit>;

const sameNumber = (a: string | null, b: string | null) =>
  (a === null ? null : Number(a)) === (b === null ? null : Number(b));

export async function updateTask(taskId: string, patch: TaskPatch): Promise<Result> {
  const t = await getT();
  const parsed = updateSchema.safeParse(patch);
  if (!parsed.success) return { ok: false, error: t(parsed.error.issues[0].message) };
  const changes = parsed.data;
  const auth = await authorizeTask(taskId);
  if (!auth) return { ok: false, error: t("Task not found") };
  const { task, user } = auth;

  // Every field that actually changes must be allowed for this person on this task.
  for (const [key, value] of Object.entries(changes) as [keyof typeof PATCH_EDIT, unknown][]) {
    if (value === undefined) continue;
    const current = task[key];
    const same =
      key === "weight" || key === "budget"
        ? sameNumber(value as string | null, current as string | null)
        : value === current || (key === "description" && (value || null) === current);
    if (same) continue;
    const no = denied(auth, PATCH_EDIT[key], t);
    if (no) return { ok: false, error: no };
  }

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
    if (!status) return { ok: false, error: t("Invalid status") };
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
      if (!isMember) return { ok: false, error: t("Assignee is not a member of this workspace") };
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
  if (start && end && end < start) return { ok: false, error: t("End date must be on or after the start date") };

  if (changes.weight !== undefined && !sameNumber(changes.weight, task.weight)) {
    if (task.parentId) return { ok: false, error: t("Weight is set on main tasks, not sub-tasks") };
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
    if (task.parentId) return { ok: false, error: t("Sub-tasks can't repeat; set it on the main task") };
    set.recurrence = changes.recurrence;
    log.push({ type: "task.recurrence_changed", data: { to: changes.recurrence } });
  }
  if (changes.isMilestone !== undefined && changes.isMilestone !== task.isMilestone) {
    if (task.parentId) return { ok: false, error: t("Only main tasks can be milestones") };
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
    // Assigning someone brings them onto the project team so they can see it.
    await addToTeam(task.projectId, task.workspaceId, newAssignee);
    const ctx = await projectContext(task.projectId);
    if (ctx) {
      await notify({
        workspaceId: task.workspaceId,
        userIds: [newAssignee],
        actorId: user.id,
        type: "task.assigned",
        title: (tr) => tr("{name} assigned you {ref} {title}", { name: user.name, ref: `${ctx.key}-${task.number}`, title: set.title ?? task.title }),
        body: (tr) => tr("Project: {name}", { name: ctx.name }),
        link: `/w/${ctx.slug}/p/${ctx.key}?task=${ctx.key}-${task.number}`,
        email: true,
      });
    }
  }

  let info: string | undefined;
  if (set.statusId) {
    const notes = task.parentId
      ? []
      : await runAutomations({ type: "task.status_changed", projectId: task.projectId, taskId, statusId: set.statusId }, user.id, t);
    const [st] = await db.select({ category: taskStatuses.category }).from(taskStatuses).where(eq(taskStatuses.id, set.statusId));
    const repeat = st?.category === "done" ? await spawnNextOccurrence(taskId, user.id, t) : undefined;
    info = [repeat, ...notes].filter(Boolean).join(" · ") || undefined;
  }
  refreshPage();
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
        return { ok: true, warning: startedEarly(open, t) };
      }
    }
    const start = set.startDate ?? task.startDate;
    const clash = all.filter((p) => startsTooEarly(start, p.dueDate));
    if (set.startDate && clash.length) {
      return {
        ok: true,
        warning:
          clash.length === 1
            ? t("Starts before {titles} ends.", { titles: listTitles(clash, t) })
            : t("Starts before {titles} end.", { titles: listTitles(clash, t) }),
      };
    }
  }
  return { ok: true };
}

/** "taskId can't start before dependsOnId is finished." Same project, no loops. */
export async function addDependency(taskId: string, dependsOnId: string): Promise<Result> {
  const t = await getT();
  const auth = await authorizeTask(taskId);
  if (!auth) return { ok: false, error: t("Task not found") };
  const { task, user } = auth;
  const no = denied(auth, "dependencies", t);
  if (no) return { ok: false, error: no };
  const [other] = await db
    .select()
    .from(tasks)
    .where(and(eq(tasks.id, dependsOnId), eq(tasks.projectId, task.projectId), isNull(tasks.deletedAt)))
    .limit(1);
  if (!other) return { ok: false, error: t("That task isn't in this project.") };
  const edges = await db
    .select({ taskId: taskDependencies.taskId, dependsOnId: taskDependencies.dependsOnId })
    .from(taskDependencies)
    .where(eq(taskDependencies.projectId, task.projectId));
  if (edges.some((e) => e.taskId === taskId && e.dependsOnId === dependsOnId)) return { ok: true };
  if (wouldCreateCycle(edges, taskId, dependsOnId)) {
    return { ok: false, error: t("That would make a loop: “{title}” already waits on this task.", { title: other.title }) };
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
  refreshPage();
  return startsTooEarly(task.startDate, other.dueDate)
    ? { ok: true, warning: t("This task starts before “{title}” ends. Consider moving its start date.", { title: other.title }) }
    : { ok: true };
}

export async function removeDependency(taskId: string, dependsOnId: string): Promise<Result> {
  const t = await getT();
  const auth = await authorizeTask(taskId);
  if (!auth) return { ok: false, error: t("Task not found") };
  const { task, user } = auth;
  const no = denied(auth, "dependencies", t);
  if (no) return { ok: false, error: no };
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
  refreshPage();
  return { ok: true };
}

/** Soft-deletes a task and its sub-tasks; restoreTask() undoes it. */
export async function deleteTask(taskId: string): Promise<Result> {
  const t = await getT();
  const auth = await authorizeTask(taskId);
  if (!auth) return { ok: false, error: t("Task not found") };
  const { task, user } = auth;
  const no = denied(auth, "delete", t);
  if (no) return { ok: false, error: no };
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

  refreshPage();
  return { ok: true };
}

export async function restoreTask(taskId: string): Promise<Result> {
  const t = await getT();
  const auth = await authorizeTask(taskId, { includeDeleted: true });
  if (!auth) return { ok: false, error: t("Task not found") };
  const { task, user } = auth;
  if (!auth.manager) return { ok: false, error: t("Only the project manager or admins can change this.") };
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

  refreshPage();
  return { ok: true };
}
