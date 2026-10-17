"use server";

import { randomBytes } from "node:crypto";
import { refresh } from "next/cache";
import { and, eq, isNull } from "drizzle-orm";
import { requireWorkspaceById } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { activities, projectShares, projects } from "@/lib/db/schema";
import { canManageProject } from "@/lib/permissions";

type Result = { ok: true } | { ok: false; error: string };

async function authorize(projectId: string) {
  const [project] = await db.select().from(projects).where(eq(projects.id, projectId)).limit(1);
  if (!project) return null;
  const { user, role } = await requireWorkspaceById(project.workspaceId);
  if (!canManageProject(role, user.id, project)) return null;
  return { project, user };
}

/** Creates a new client link (any previous link for the project stops working). */
export async function createShareLink(projectId: string, showBudget: boolean): Promise<Result> {
  const auth = await authorize(projectId);
  if (!auth) return { ok: false, error: "Only admins or the project manager can share a project." };
  // 32 random bytes: unguessable, URL-safe.
  const token = randomBytes(32).toString("base64url");
  await db.transaction(async (tx) => {
    await tx
      .update(projectShares)
      .set({ revokedAt: new Date() })
      .where(and(eq(projectShares.projectId, projectId), isNull(projectShares.revokedAt)));
    await tx.insert(projectShares).values({
      workspaceId: auth.project.workspaceId,
      projectId,
      token,
      showBudget,
      createdById: auth.user.id,
    });
    await tx.insert(activities).values({
      workspaceId: auth.project.workspaceId,
      projectId,
      actorId: auth.user.id,
      type: "share.created",
      data: { showBudget },
    });
  });
  refresh();
  return { ok: true };
}

export async function setShareBudgetVisible(projectId: string, showBudget: boolean): Promise<Result> {
  const auth = await authorize(projectId);
  if (!auth) return { ok: false, error: "Not allowed" };
  await db
    .update(projectShares)
    .set({ showBudget })
    .where(and(eq(projectShares.projectId, projectId), isNull(projectShares.revokedAt)));
  refresh();
  return { ok: true };
}

export async function revokeShareLink(projectId: string): Promise<Result> {
  const auth = await authorize(projectId);
  if (!auth) return { ok: false, error: "Not allowed" };
  await db.transaction(async (tx) => {
    await tx
      .update(projectShares)
      .set({ revokedAt: new Date() })
      .where(and(eq(projectShares.projectId, projectId), isNull(projectShares.revokedAt)));
    await tx.insert(activities).values({
      workspaceId: auth.project.workspaceId,
      projectId,
      actorId: auth.user.id,
      type: "share.revoked",
      data: {},
    });
  });
  refresh();
  return { ok: true };
}
