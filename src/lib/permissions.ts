import type { WorkspaceRole } from "@/lib/auth/session";

/** Workspace owners/admins manage every project; members only the ones they lead. */
export function canManageProject(
  role: WorkspaceRole,
  userId: string,
  project: { leadId: string | null },
) {
  return role === "owner" || role === "admin" || project.leadId === userId;
}

export const isWorkspaceAdmin = (role: WorkspaceRole) => role === "owner" || role === "admin";

/** Owners/admins see every project; others see the ones they manage or are on the team of. */
export function canSeeProject(
  role: WorkspaceRole,
  userId: string,
  project: { leadId: string | null },
  onTeam: boolean,
) {
  return canManageProject(role, userId, project) || onTeam;
}

/** Things a person can change on a task. */
export type TaskEdit =
  | "title"
  | "description"
  | "status"
  | "progress"
  | "priority"
  | "assignee"
  | "dates"
  | "weight"
  | "budget"
  | "milestone"
  | "recurrence"
  | "fields"
  | "subtasks"
  | "dependencies"
  | "delete";

const ALL: TaskEdit[] = [
  "title", "description", "status", "progress", "priority", "assignee", "dates", "weight",
  "budget", "milestone", "recurrence", "fields", "subtasks", "dependencies", "delete",
];
/** What a manager may still do while a task is blocked: plan it, fix its dependencies, or remove it. */
const PLANNING: TaskEdit[] = ["priority", "assignee", "dates", "weight", "dependencies", "delete"];
/** What a member may do on a task assigned to them (or a sub-task of one). */
const ASSIGNEE: TaskEdit[] = ["status", "progress", "subtasks"];

/**
 * What this person may change on this task (pure). Comments are always allowed
 * for anyone who can see the project, so they aren't listed here.
 * - manager: everything; while blocked only planning.
 * - assignee (member): status, progress, sub-tasks; nothing while blocked.
 * - other members: nothing.
 */
export function taskEdits({ manager, assignee, blocked }: { manager: boolean; assignee: boolean; blocked: boolean }): Set<TaskEdit> {
  if (manager) return new Set(blocked ? PLANNING : ALL);
  if (assignee && !blocked) return new Set(ASSIGNEE);
  return new Set();
}
