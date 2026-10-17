import type { WorkspaceRole } from "@/lib/auth/session";

/** Workspace owners/admins manage every project; members only the ones they lead. */
export function canManageProject(
  role: WorkspaceRole,
  userId: string,
  project: { leadId: string | null },
) {
  return role === "owner" || role === "admin" || project.leadId === userId;
}
