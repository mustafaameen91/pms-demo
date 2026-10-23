"use server";

import { refreshPage } from "@/lib/refresh-page";
import { and, eq, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import { requireWorkspaceById } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { activities, member, projectRisks, projects, tasks } from "@/lib/db/schema";
import { canManageProject } from "@/lib/permissions";
import { addToTeam, canViewProject } from "@/lib/data/project-access";
import { notify, projectManagers } from "@/lib/notifications";
import { RISK_CATEGORIES, RISK_STATUSES, riskScore } from "@/lib/risks";
import { getT } from "@/i18n/server";
import type { T } from "@/i18n/translate";

type Result = { ok: true } | { ok: false; error: string; fieldErrors?: Record<string, string> };

const scale = z.coerce.number().int().min(1, "Choose 1–5").max(5, "Choose 1–5");
const riskSchema = z.object({
  title: z.string().trim().min(3, "Describe the risk in a few words").max(200),
  description: z.string().trim().max(2000).optional().transform((v) => v || null),
  category: z.enum(RISK_CATEGORIES.map((c) => c.value) as [string, ...string[]]),
  likelihood: scale,
  impact: scale,
  mitigation: z.string().trim().max(2000).optional().transform((v) => v || null),
  status: z.enum(RISK_STATUSES.map((s) => s.value) as [string, ...string[]]),
  ownerId: z.string().optional().transform((v) => v || null),
  taskId: z.string().optional().transform((v) => v || null),
});
export type RiskInput = z.input<typeof riskSchema>;

function fieldErrors(error: z.ZodError, t: T): Result {
  const out: Record<string, string> = {};
  for (const issue of error.issues) out[String(issue.path[0])] ??= t(issue.message);
  return { ok: false, error: t(error.issues[0].message), fieldErrors: out };
}

/** The project, if the current user can see it. */
async function loadProject(projectId: string) {
  const [project] = await db.select().from(projects).where(eq(projects.id, projectId)).limit(1);
  if (!project) return null;
  const auth = await requireWorkspaceById(project.workspaceId);
  if (!(await canViewProject(auth.role, auth.user.id, project))) return null;
  return { project, ...auth, manager: canManageProject(auth.role, auth.user.id, project) };
}

/**
 * Add (riskId null) or edit a risk.
 * Anyone on the project can raise a risk. The manager and admins edit any risk and choose
 * its owner; the owner and the person who raised it can update it (but not reassign it).
 */
export async function saveRisk(projectId: string, riskId: string | null, input: RiskInput): Promise<Result> {
  const t = await getT();
  const auth = await loadProject(projectId);
  if (!auth) return { ok: false, error: t("Project not found") };
  const { project, user, manager, slug } = auth;
  const parsed = riskSchema.safeParse(input);
  if (!parsed.success) return fieldErrors(parsed.error, t);
  const d = parsed.data;

  let existing: typeof projectRisks.$inferSelect | undefined;
  if (riskId) {
    [existing] = await db
      .select()
      .from(projectRisks)
      .where(and(eq(projectRisks.id, riskId), eq(projectRisks.projectId, projectId)))
      .limit(1);
    if (!existing) return { ok: false, error: t("Risk not found") };
    if (!manager && existing.ownerId !== user.id && existing.createdById !== user.id) {
      return { ok: false, error: t("Only the project manager, admins, or the risk's owner can change this risk.") };
    }
  }
  // Only managers pick the owner; others keep whatever it was.
  const ownerId = manager ? d.ownerId : (existing?.ownerId ?? null);
  if (ownerId && ownerId !== existing?.ownerId) {
    const [m] = await db
      .select({ id: member.id })
      .from(member)
      .where(and(eq(member.organizationId, project.workspaceId), eq(member.userId, ownerId)))
      .limit(1);
    if (!m) return { ok: false, error: t("That person isn't a member of this workspace."), fieldErrors: { ownerId: t("That person isn't a member of this workspace.") } };
  }
  if (d.taskId) {
    const [task] = await db
      .select({ id: tasks.id })
      .from(tasks)
      .where(and(eq(tasks.id, d.taskId), eq(tasks.projectId, projectId), isNull(tasks.deletedAt)))
      .limit(1);
    if (!task) return { ok: false, error: t("Task not found"), fieldErrors: { taskId: t("Task not found") } };
  }

  const values = {
    title: d.title,
    description: d.description,
    category: d.category,
    likelihood: d.likelihood,
    impact: d.impact,
    mitigation: d.mitigation,
    status: d.status,
    ownerId,
    taskId: d.taskId,
    closedAt: d.status === "closed" ? (existing?.closedAt ?? new Date()) : null,
  };
  const score = riskScore(d.likelihood, d.impact);
  let number = existing?.number ?? 0;
  await db.transaction(async (tx) => {
    if (existing) {
      await tx.update(projectRisks).set({ ...values, updatedAt: new Date() }).where(eq(projectRisks.id, existing.id));
    } else {
      // Lock the project row so two people adding at once don't get the same number.
      await tx.execute(sql`select 1 from ${projects} where ${projects.id} = ${projectId} for update`);
      const [{ next }] = await tx
        .select({ next: sql<number>`coalesce(max(${projectRisks.number}), 0) + 1`.mapWith(Number) })
        .from(projectRisks)
        .where(eq(projectRisks.projectId, projectId));
      number = next;
      await tx.insert(projectRisks).values({ ...values, number, workspaceId: project.workspaceId, projectId, createdById: user.id });
    }
    const type = !existing
      ? "risk.created"
      : existing.status !== "closed" && d.status === "closed"
        ? "risk.closed"
        : existing.status === "closed" && d.status !== "closed"
          ? "risk.reopened"
          : "risk.updated";
    await tx.insert(activities).values({
      workspaceId: project.workspaceId,
      projectId,
      taskId: d.taskId,
      actorId: user.id,
      type,
      data: { number, title: d.title, score, ...(existing && existing.status !== d.status ? { status: d.status } : {}) },
    });
  });

  const link = `/w/${slug}/p/${project.key}/risks`;
  if (ownerId && ownerId !== existing?.ownerId) {
    await addToTeam(projectId, project.workspaceId, ownerId);
    await notify({
      workspaceId: project.workspaceId,
      userIds: [ownerId],
      actorId: user.id,
      type: "risk",
      title: (tr) => tr("{name} made you the owner of risk R-{number}: “{title}”", { name: user.name, number: String(number), title: d.title }),
      body: d.mitigation,
      link,
      email: true,
    });
  }
  // A team member raised a risk: the people who manage the project hear about it.
  if (!existing && !manager) {
    await notify({
      workspaceId: project.workspaceId,
      userIds: await projectManagers(project.workspaceId, project.leadId),
      actorId: user.id,
      type: "risk",
      title: (tr) => tr("{name} raised a risk on {project}: “{title}”", { name: user.name, project: project.name, title: d.title }),
      body: d.description,
      link,
      email: true,
    });
  }
  refreshPage();
  return { ok: true };
}

/** Removes a risk entered by mistake (closing it keeps the history; this doesn't). */
export async function deleteRisk(riskId: string): Promise<Result> {
  const t = await getT();
  const [risk] = await db.select().from(projectRisks).where(eq(projectRisks.id, riskId)).limit(1);
  if (!risk) return { ok: false, error: t("Risk not found") };
  const auth = await loadProject(risk.projectId);
  if (!auth) return { ok: false, error: t("Project not found") };
  if (!auth.manager) return { ok: false, error: t("Only the project manager or admins can delete a risk. Close it instead.") };
  await db.transaction(async (tx) => {
    await tx.delete(projectRisks).where(eq(projectRisks.id, riskId));
    await tx.insert(activities).values({
      workspaceId: risk.workspaceId,
      projectId: risk.projectId,
      actorId: auth.user.id,
      type: "risk.deleted",
      data: { number: risk.number, title: risk.title },
    });
  });
  refreshPage();
  return { ok: true };
}
