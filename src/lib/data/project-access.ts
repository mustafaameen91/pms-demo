import "server-only";
import { cache } from "react";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { member, projectMembers, projects } from "@/lib/db/schema";
import type { WorkspaceRole } from "@/lib/auth/session";
import { canSeeProject, isWorkspaceAdmin } from "@/lib/permissions";
import { getProjectByKey } from "@/lib/data/projects";

export async function isOnTeam(projectId: string, userId: string) {
  const [row] = await db
    .select({ userId: projectMembers.userId })
    .from(projectMembers)
    .where(and(eq(projectMembers.projectId, projectId), eq(projectMembers.userId, userId)))
    .limit(1);
  return Boolean(row);
}

/** Can this person see this project at all? */
export async function canViewProject(role: WorkspaceRole, userId: string, project: { id: string; leadId: string | null }) {
  if (isWorkspaceAdmin(role) || project.leadId === userId) return true;
  return canSeeProject(role, userId, project, await isOnTeam(project.id, userId));
}

/** Projects a non-admin can see (ids), or null = all of them. */
export async function visibleProjectIds(workspaceId: string, userId: string, role: WorkspaceRole): Promise<Set<string> | null> {
  if (isWorkspaceAdmin(role)) return null;
  const [team, led] = await Promise.all([
    db.select({ id: projectMembers.projectId }).from(projectMembers).where(and(eq(projectMembers.workspaceId, workspaceId), eq(projectMembers.userId, userId))),
    db.select({ id: projects.id }).from(projects).where(and(eq(projects.workspaceId, workspaceId), eq(projects.leadId, userId))),
  ]);
  return new Set([...team, ...led].map((r) => r.id));
}

/** Adds a workspace member to a project's team (no-op if already there or not a member). */
export async function addToTeam(projectId: string, workspaceId: string, userId: string | null | undefined) {
  if (!userId) return;
  const [m] = await db
    .select({ id: member.id })
    .from(member)
    .where(and(eq(member.organizationId, workspaceId), eq(member.userId, userId)))
    .limit(1);
  if (!m) return;
  await db.insert(projectMembers).values({ projectId, workspaceId, userId }).onConflictDoNothing();
}

/** A project by key, only if this person can see it (null otherwise — pages show "not found"). */
export const getVisibleProjectByKey = cache(
  async (workspace: { id: string; role: WorkspaceRole }, userId: string, key: string) => {
    const project = await getProjectByKey(workspace.id, key);
    if (!project) return null;
    return (await canViewProject(workspace.role, userId, project)) ? project : null;
  },
);
