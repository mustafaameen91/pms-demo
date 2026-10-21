"use server";

import { refresh } from "next/cache";
import { and, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import { requireWorkspace, requireWorkspaceById } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { activities, projectResources, projects, resources, tasks } from "@/lib/db/schema";
import { CURRENCIES, RESOURCE_TYPES } from "@/lib/constants";
import { MAX_MONEY, MAX_QTY, decimalOrZero, optionalDecimal } from "@/lib/validation";
import { checkOverBudget } from "@/lib/budget-alerts";
import { getT } from "@/i18n/server";
import type { T } from "@/i18n/translate";
import { canManageProject, isWorkspaceAdmin } from "@/lib/permissions";

const ADMINS_ONLY = "Only workspace owners and admins can change the resource library.";
const MANAGERS_ONLY = "Only the project manager or admins can change this project's resources.";

type Result<T = undefined> = { ok: true; data?: T } | { ok: false; error: string; fieldErrors?: Record<string, string> };

function fail(error: z.ZodError, t: T): Result<never> {
  const fieldErrors: Record<string, string> = {};
  for (const issue of error.issues) fieldErrors[String(issue.path[0])] ??= t(issue.message);
  return { ok: false, error: t(error.issues[0].message), fieldErrors };
}

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullish()
    .transform((v) => v || null);

const resourceSchema = z.object({
  type: z.enum(RESOURCE_TYPES.map((t) => t.value) as [string, ...string[]]),
  name: z.string().trim().min(1, "Name is required").max(120),
  unit: z.string().trim().min(1, "Unit is required").max(30),
  unitCost: optionalDecimal(MAX_MONEY, "Enter a valid price"),
  currency: z.enum(CURRENCIES),
  role: optionalText(120),
  phone: optionalText(40),
  notes: optionalText(1000),
});

export type ResourceInput = z.input<typeof resourceSchema>;
type ResourceTypeValue = (typeof resources.$inferInsert)["type"];

// --- Library ---

export async function createResource(workspaceSlug: string, input: ResourceInput): Promise<Result<{ id: string }>> {
  const t = await getT();
  const parsed = resourceSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error, t);
  const { user, workspace } = await requireWorkspace(workspaceSlug);
  if (!isWorkspaceAdmin(workspace.role)) return { ok: false, error: t(ADMINS_ONLY) };
  const [row] = await db
    .insert(resources)
    .values({
      ...parsed.data,
      type: parsed.data.type as ResourceTypeValue,
      workspaceId: workspace.id,
      createdById: user.id,
    })
    .returning({ id: resources.id });
  refresh();
  return { ok: true, data: { id: row.id } };
}

async function authorizeResource(resourceId: string) {
  const [resource] = await db.select().from(resources).where(eq(resources.id, resourceId)).limit(1);
  if (!resource) return null;
  const auth = await requireWorkspaceById(resource.workspaceId);
  return { resource, ...auth };
}

export async function updateResource(resourceId: string, input: ResourceInput): Promise<Result> {
  const t = await getT();
  const parsed = resourceSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error, t);
  const auth = await authorizeResource(resourceId);
  if (!auth) return { ok: false, error: t("Resource not found") };
  if (!isWorkspaceAdmin(auth.role)) return { ok: false, error: t(ADMINS_ONLY) };
  await db
    .update(resources)
    .set({ ...parsed.data, type: parsed.data.type as ResourceTypeValue })
    .where(eq(resources.id, resourceId));
  refresh();
  return { ok: true };
}

/** Archiving hides it from the library and pickers; projects already using it keep it. */
export async function setResourceArchived(resourceId: string, archived: boolean): Promise<Result> {
  const t = await getT();
  const auth = await authorizeResource(resourceId);
  if (!auth) return { ok: false, error: t("Resource not found") };
  if (auth.role !== "owner" && auth.role !== "admin") {
    return { ok: false, error: t("Only workspace owners and admins can archive resources.") };
  }
  await db
    .update(resources)
    .set({ archivedAt: archived ? new Date() : null })
    .where(eq(resources.id, resourceId));
  refresh();
  return { ok: true };
}

// --- Project resources ---

const usageSchema = z.object({
  taskId: z.string().min(1).nullish().transform((v) => v || null),
  plannedQty: decimalOrZero(MAX_QTY, "Enter a valid quantity"),
  usedQty: decimalOrZero(MAX_QTY, "Enter a valid quantity"),
  unitCost: decimalOrZero(MAX_MONEY, "Enter a valid price"),
  notes: optionalText(1000),
});

export type UsageInput = z.input<typeof usageSchema>;

/** Using resources on a project is the project manager's (or an admin's) job. */
async function authorizeProject(projectId: string) {
  const [project] = await db.select().from(projects).where(eq(projects.id, projectId)).limit(1);
  if (!project) return null;
  const auth = await requireWorkspaceById(project.workspaceId);
  return canManageProject(auth.role, auth.user.id, project) ? { project, ...auth } : null;
}

async function taskBelongsToProject(taskId: string, projectId: string) {
  const [task] = await db
    .select({ id: tasks.id })
    .from(tasks)
    .where(and(eq(tasks.id, taskId), eq(tasks.projectId, projectId), isNull(tasks.deletedAt)))
    .limit(1);
  return Boolean(task);
}

/**
 * Adds a resource to a project. Pass `resourceId` to use a library item, or
 * `newResource` to create one in the library at the same time.
 */
export async function addProjectResource(
  projectId: string,
  source: { resourceId: string } | { newResource: ResourceInput },
  usage: UsageInput,
): Promise<Result> {
  const t = await getT();
  const auth = await authorizeProject(projectId);
  if (!auth) return { ok: false, error: t(MANAGERS_ONLY) };
  const { project, user } = auth;

  const parsedUsage = usageSchema.safeParse(usage);
  if (!parsedUsage.success) return fail(parsedUsage.error, t);
  if (parsedUsage.data.taskId && !(await taskBelongsToProject(parsedUsage.data.taskId, projectId))) {
    return { ok: false, error: t("Task not found in this project"), fieldErrors: { taskId: t("Task not found") } };
  }

  let resourceId: string;
  let resourceName: string;
  if ("resourceId" in source) {
    const [resource] = await db
      .select()
      .from(resources)
      .where(and(eq(resources.id, source.resourceId), eq(resources.workspaceId, project.workspaceId)))
      .limit(1);
    if (!resource) return { ok: false, error: t("Resource not found") };
    resourceId = resource.id;
    resourceName = resource.name;
  } else {
    const parsed = resourceSchema.safeParse(source.newResource);
    if (!parsed.success) return fail(parsed.error, t);
    const [row] = await db
      .insert(resources)
      .values({
        ...parsed.data,
        type: parsed.data.type as ResourceTypeValue,
        workspaceId: project.workspaceId,
        createdById: user.id,
      })
      .returning({ id: resources.id, name: resources.name });
    resourceId = row.id;
    resourceName = row.name;
  }

  await db.transaction(async (tx) => {
    await tx.insert(projectResources).values({
      workspaceId: project.workspaceId,
      projectId,
      resourceId,
      ...parsedUsage.data,
    });
    await tx.insert(activities).values({
      workspaceId: project.workspaceId,
      projectId,
      actorId: user.id,
      type: "resource.added",
      data: { name: resourceName, plannedQty: parsedUsage.data.plannedQty },
    });
  });
  await checkOverBudget(projectId, user.id);

  refresh();
  return { ok: true };
}

async function authorizeUsage(usageId: string) {
  const [usage] = await db.select().from(projectResources).where(eq(projectResources.id, usageId)).limit(1);
  if (!usage) return null;
  const auth = await authorizeProject(usage.projectId);
  return auth ? { usage, ...auth } : null;
}

export async function updateProjectResource(usageId: string, input: UsageInput): Promise<Result> {
  const t = await getT();
  const parsed = usageSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error, t);
  const auth = await authorizeUsage(usageId);
  if (!auth) return { ok: false, error: t(MANAGERS_ONLY) };
  if (parsed.data.taskId && !(await taskBelongsToProject(parsed.data.taskId, auth.usage.projectId))) {
    return { ok: false, error: t("Task not found in this project"), fieldErrors: { taskId: t("Task not found") } };
  }
  // A worker on timesheets: used quantity comes from attendance, not this form.
  const { usedQty, ...rest } = parsed.data;
  await db
    .update(projectResources)
    .set(auth.usage.fromTimesheets ? rest : { ...rest, usedQty })
    .where(eq(projectResources.id, usageId));
  await checkOverBudget(auth.usage.projectId, auth.user.id);
  refresh();
  return { ok: true };
}

export async function removeProjectResource(usageId: string): Promise<Result> {
  const t = await getT();
  const auth = await authorizeUsage(usageId);
  if (!auth) return { ok: false, error: t(MANAGERS_ONLY) };
  const [resource] = await db
    .select({ name: resources.name })
    .from(resources)
    .where(eq(resources.id, auth.usage.resourceId))
    .limit(1);
  await db.transaction(async (tx) => {
    await tx.delete(projectResources).where(eq(projectResources.id, usageId));
    await tx.insert(activities).values({
      workspaceId: auth.usage.workspaceId,
      projectId: auth.usage.projectId,
      actorId: auth.user.id,
      type: "resource.removed",
      data: { name: resource?.name },
    });
  });
  refresh();
  return { ok: true };
}
