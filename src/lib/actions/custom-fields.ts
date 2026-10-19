"use server";

import { refresh } from "next/cache";
import { and, eq, isNull, max, sql } from "drizzle-orm";
import { z } from "zod";
import { requireWorkspaceById } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { activities, customFields, projects, tasks } from "@/lib/db/schema";
import { FIELD_TYPES, parseFieldValue, type FieldDef } from "@/lib/custom-fields";
import { POSITION_STEP } from "@/lib/constants";
import { canManageProject } from "@/lib/permissions";
import { getT } from "@/i18n/server";

type Result = { ok: true } | { ok: false; error: string };

async function manage(projectId: string) {
  const [project] = await db.select().from(projects).where(eq(projects.id, projectId)).limit(1);
  if (!project) return null;
  const { user, role } = await requireWorkspaceById(project.workspaceId);
  return canManageProject(role, user.id, project) ? { project, user } : null;
}

const fieldSchema = z.object({
  name: z.string().trim().min(1, "Name the field").max(60),
  type: z.enum(FIELD_TYPES.map((t) => t.value) as [string, ...string[]]),
  options: z.array(z.string().trim().min(1).max(60)).max(30).optional(),
});

const toOptions = (labels: string[] | undefined) =>
  [...new Set(labels ?? [])].map((label) => ({ id: Math.random().toString(36).slice(2, 10), label }));

export async function createCustomField(projectId: string, input: z.input<typeof fieldSchema>): Promise<Result> {
  const t = await getT();
  const auth = await manage(projectId);
  if (!auth) return { ok: false, error: t("Only admins or the project manager can change fields.") };
  const parsed = fieldSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: t(parsed.error.issues[0].message) };
  if (parsed.data.type === "select" && (parsed.data.options?.length ?? 0) < 2) {
    return { ok: false, error: t("A choice field needs at least 2 options") };
  }
  const existing = await db.select({ n: sql<number>`count(*)`.mapWith(Number) }).from(customFields).where(eq(customFields.projectId, projectId));
  if (existing[0].n >= 20) return { ok: false, error: t("At most 20 custom fields per project") };
  const [{ maxPos }] = await db.select({ maxPos: max(customFields.position) }).from(customFields).where(eq(customFields.projectId, projectId));
  await db.insert(customFields).values({
    workspaceId: auth.project.workspaceId,
    projectId,
    name: parsed.data.name,
    type: parsed.data.type as FieldDef["type"],
    options: parsed.data.type === "select" ? toOptions(parsed.data.options) : null,
    position: (maxPos ?? 0) + POSITION_STEP,
  });
  refresh();
  return { ok: true };
}

export async function renameCustomField(fieldId: string, name: string): Promise<Result> {
  const t = await getT();
  const [field] = await db.select().from(customFields).where(eq(customFields.id, fieldId)).limit(1);
  if (!field?.projectId || !(await manage(field.projectId))) return { ok: false, error: t("Not allowed") };
  const parsed = z.string().trim().min(1).max(60).safeParse(name);
  if (!parsed.success) return { ok: false, error: t("Name the field") };
  await db.update(customFields).set({ name: parsed.data }).where(eq(customFields.id, fieldId));
  refresh();
  return { ok: true };
}

/** Deletes the field and removes its values from every task. */
export async function deleteCustomField(fieldId: string): Promise<Result> {
  const t = await getT();
  const [field] = await db.select().from(customFields).where(eq(customFields.id, fieldId)).limit(1);
  if (!field?.projectId || !(await manage(field.projectId))) return { ok: false, error: t("Not allowed") };
  await db.transaction(async (tx) => {
    await tx
      .update(tasks)
      .set({ customFields: sql`${tasks.customFields} - ${fieldId}` })
      .where(eq(tasks.projectId, field.projectId!));
    await tx.delete(customFields).where(eq(customFields.id, fieldId));
  });
  refresh();
  return { ok: true };
}

/** Sets one field's value on a task (any member who can edit tasks). */
export async function setTaskField(taskId: string, fieldId: string, raw: unknown): Promise<Result> {
  const t = await getT();
  const [task] = await db.select().from(tasks).where(and(eq(tasks.id, taskId), isNull(tasks.deletedAt))).limit(1);
  if (!task) return { ok: false, error: t("Task not found") };
  const { user } = await requireWorkspaceById(task.workspaceId);
  const [field] = await db
    .select()
    .from(customFields)
    .where(and(eq(customFields.id, fieldId), eq(customFields.projectId, task.projectId)))
    .limit(1);
  if (!field) return { ok: false, error: t("Field not found") };
  const parsed = parseFieldValue(field as FieldDef, raw, t);
  if ("error" in parsed) return { ok: false, error: parsed.error };
  const current = task.customFields?.[fieldId] ?? null;
  if (current === parsed.value) return { ok: true };

  const next = { ...task.customFields };
  if (parsed.value === null) delete next[fieldId];
  else next[fieldId] = parsed.value;
  await db.transaction(async (tx) => {
    await tx.update(tasks).set({ customFields: next }).where(eq(tasks.id, taskId));
    await tx.insert(activities).values({
      workspaceId: task.workspaceId,
      projectId: task.projectId,
      taskId,
      actorId: user.id,
      type: "task.field_changed",
      data: { field: field.name },
    });
  });
  refresh();
  return { ok: true };
}
