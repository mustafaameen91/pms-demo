import "server-only";
import { and, eq, isNull } from "drizzle-orm";
import { requireWorkspaceById } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { projects, taskDependencies, taskStatuses, tasks } from "@/lib/db/schema";
import { isFinished } from "@/lib/dependencies";
import { canManageProject, taskEdits, type TaskEdit } from "@/lib/permissions";
import { canViewProject } from "@/lib/data/project-access";
import type { T } from "@/i18n/translate";

/** Unfinished predecessors of a task, and the latest end date among all its predecessors. */
export async function predecessorState(taskId: string) {
  const rows = await db
    .select({ number: tasks.number, title: tasks.title, dueDate: tasks.dueDate, category: taskStatuses.category })
    .from(taskDependencies)
    .innerJoin(tasks, and(eq(tasks.id, taskDependencies.dependsOnId), isNull(tasks.deletedAt)))
    .innerJoin(taskStatuses, eq(taskStatuses.id, tasks.statusId))
    .where(eq(taskDependencies.taskId, taskId));
  return { open: rows.filter((r) => !isFinished(r.category)), all: rows };
}

export const listTitles = (rows: { title: string }[], t: T) => rows.map((r) => `“${r.title}”`).join(t(", "));


/**
 * Loads a task, authorizes the current user, and works out what they may
 * change on it (see taskEdits in lib/permissions): managers everything,
 * assignees status/progress/sub-tasks, nobody starts or finishes a blocked task.
 * Returns null when the task doesn't exist or the person can't see the project.
 */
export async function authorizeTask(taskId: string, { includeDeleted = false } = {}) {
  const [task] = await db
    .select()
    .from(tasks)
    .where(and(eq(tasks.id, taskId), includeDeleted ? undefined : isNull(tasks.deletedAt)))
    .limit(1);
  if (!task) return null;
  const { user, role } = await requireWorkspaceById(task.workspaceId);
  const [project] = await db.select().from(projects).where(eq(projects.id, task.projectId)).limit(1);
  if (!project || !(await canViewProject(role, user.id, project))) return null;
  const [parent] = task.parentId
    ? await db.select({ assigneeId: tasks.assigneeId }).from(tasks).where(eq(tasks.id, task.parentId)).limit(1)
    : [];
  // A sub-task is blocked when its main task is.
  const { open: blockers } = await predecessorState(task.parentId ?? task.id);
  const manager = canManageProject(role, user.id, project);
  const assignee = task.assigneeId === user.id || parent?.assigneeId === user.id;
  const edits = taskEdits({ manager, assignee, blocked: blockers.length > 0 });
  return { task, user, project, manager, blockers, edits };
}

export type TaskAuth = NonNullable<Awaited<ReturnType<typeof authorizeTask>>>;

/** Why this edit isn't allowed, in the requester's language (null = allowed). */
export function denied(auth: TaskAuth, edit: TaskEdit, t: T): string | null {
  if (auth.edits.has(edit)) return null;
  if (auth.blockers.length > 0 && (auth.manager || taskEdits({ manager: false, assignee: true, blocked: false }).has(edit))) {
    return auth.blockers.length === 1
      ? t("Blocked until {titles} is finished.", { titles: listTitles(auth.blockers, t) })
      : t("Blocked until {titles} are finished.", { titles: listTitles(auth.blockers, t) });
  }
  return auth.manager || auth.edits.size > 0
    ? t("Only the project manager or admins can change this.")
    : t("You can only update tasks assigned to you.");
}
