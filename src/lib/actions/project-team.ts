"use server";

import { refresh } from "next/cache";
import { and, eq } from "drizzle-orm";
import { requireWorkspaceById } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { activities, member, projectMembers, projects, user } from "@/lib/db/schema";
import { canManageProject } from "@/lib/permissions";
import { addToTeam } from "@/lib/data/project-access";
import { getT } from "@/i18n/server";

type Result = { ok: true } | { ok: false; error: string };

async function manage(projectId: string) {
  const [project] = await db.select().from(projects).where(eq(projects.id, projectId)).limit(1);
  if (!project) return null;
  const { user: me, role } = await requireWorkspaceById(project.workspaceId);
  return canManageProject(role, me.id, project) ? { project, me } : null;
}

async function nameOf(userId: string) {
  const [row] = await db.select({ name: user.name }).from(user).where(eq(user.id, userId)).limit(1);
  return row?.name ?? "";
}

/** Adds a workspace member to the project team so they can see and work in it. */
export async function addProjectMember(projectId: string, userId: string): Promise<Result> {
  const t = await getT();
  const auth = await manage(projectId);
  if (!auth) return { ok: false, error: t("Only the project manager or admins can change the team.") };
  const [m] = await db
    .select({ id: member.id })
    .from(member)
    .where(and(eq(member.organizationId, auth.project.workspaceId), eq(member.userId, userId)))
    .limit(1);
  if (!m) return { ok: false, error: t("That person isn't a member of this workspace.") };
  await addToTeam(projectId, auth.project.workspaceId, userId);
  await db.insert(activities).values({
    workspaceId: auth.project.workspaceId,
    projectId,
    actorId: auth.me.id,
    type: "project.member_added",
    data: { name: await nameOf(userId) },
  });
  refresh();
  return { ok: true };
}

/** Removes someone from the team. Their tasks stay assigned; they just can't open the project any more. */
export async function removeProjectMember(projectId: string, userId: string): Promise<Result> {
  const t = await getT();
  const auth = await manage(projectId);
  if (!auth) return { ok: false, error: t("Only the project manager or admins can change the team.") };
  if (auth.project.leadId === userId) return { ok: false, error: t("The project manager is always on the team. Change the manager first.") };
  await db.delete(projectMembers).where(and(eq(projectMembers.projectId, projectId), eq(projectMembers.userId, userId)));
  await db.insert(activities).values({
    workspaceId: auth.project.workspaceId,
    projectId,
    actorId: auth.me.id,
    type: "project.member_removed",
    data: { name: await nameOf(userId) },
  });
  refresh();
  return { ok: true };
}
