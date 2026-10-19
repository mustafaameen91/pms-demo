"use server";

import { refresh } from "next/cache";
import { and, asc, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import { requireWorkspace, requireWorkspaceById } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { projectTemplates, projects, taskDependencies, taskStatuses, tasks } from "@/lib/db/schema";
import { canManageProject } from "@/lib/permissions";
import { daysBetween } from "@/lib/schedule";
import { templateDataSchema, templateLengthDays, type TemplateData } from "@/lib/templates";
import { getT } from "@/i18n/server";

type Result = { ok: true } | { ok: false; error: string };

export type CustomTemplateSummary = {
  id: string;
  name: string;
  description: string | null;
  taskCount: number;
  lengthDays: number;
  tasks: { title: string; weight?: number }[];
};

/** Saved templates of a workspace, for the "New project" picker. */
export async function listWorkspaceTemplates(slug: string): Promise<CustomTemplateSummary[]> {
  const { workspace } = await requireWorkspace(slug);
  const rows = await db
    .select()
    .from(projectTemplates)
    .where(eq(projectTemplates.workspaceId, workspace.id))
    .orderBy(asc(projectTemplates.name));
  return rows.flatMap((r) => {
    const parsed = templateDataSchema.safeParse(r.data);
    if (!parsed.success) return [];
    return [
      {
        id: r.id,
        name: r.name,
        description: r.description,
        taskCount: parsed.data.tasks.length,
        lengthDays: templateLengthDays(parsed.data),
        tasks: parsed.data.tasks.map((t) => ({ title: t.title, weight: t.weight })),
      },
    ];
  });
}

const saveSchema = z.object({
  name: z.string().trim().min(2, "Give the template a name").max(80),
  description: z.string().trim().max(300).optional(),
});

/**
 * Snapshot of a project's workflow and main tasks (weights, sub-task titles,
 * timing relative to the project start). People, progress and money are not copied.
 */
export async function saveProjectAsTemplate(projectId: string, input: z.input<typeof saveSchema>): Promise<Result> {
  const t = await getT();
  const parsed = saveSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: t(parsed.error.issues[0].message) };
  const [project] = await db.select().from(projects).where(eq(projects.id, projectId)).limit(1);
  if (!project) return { ok: false, error: t("Project not found") };
  const { user, role } = await requireWorkspaceById(project.workspaceId);
  if (!canManageProject(role, user.id, project)) {
    return { ok: false, error: t("Only admins or the project manager can save templates.") };
  }

  const [statuses, rows, edges] = await Promise.all([
    db.select().from(taskStatuses).where(eq(taskStatuses.projectId, projectId)).orderBy(asc(taskStatuses.position)),
    db
      .select()
      .from(tasks)
      .where(and(eq(tasks.projectId, projectId), isNull(tasks.deletedAt)))
      .orderBy(asc(tasks.position)),
    db.select().from(taskDependencies).where(eq(taskDependencies.projectId, projectId)),
  ]);
  const main = rows.filter((t) => !t.parentId);
  if (main.length === 0) return { ok: false, error: t("Add some tasks to the project first.") };

  // Offsets are measured from the project start, or from the earliest task start.
  const starts = main.map((t) => t.startDate).filter(Boolean) as string[];
  const origin = project.startDate ?? (starts.length ? starts.sort()[0] : null);
  const sortDate = (t: (typeof main)[number]) => t.startDate ?? t.dueDate ?? "9999";
  const ordered = [...main].sort((a, b) => sortDate(a).localeCompare(sortDate(b)));
  const indexOf = new Map(ordered.map((t, i) => [t.id, i]));

  const data: TemplateData = {
    statuses: statuses.map((s) => ({ name: s.name, category: s.category, color: s.color })),
    tasks: ordered.map((t) => {
      const start = t.startDate ?? t.dueDate;
      const end = t.dueDate ?? t.startDate;
      return {
        title: t.title,
        ...(t.description && { description: t.description }),
        ...(t.weight !== null && { weight: Number(t.weight) }),
        ...(origin && start && { startOffset: Math.max(0, daysBetween(origin, start)) }),
        ...(start && end && { duration: Math.max(1, daysBetween(start, end) + 1) }),
        subtasks: rows.filter((s) => s.parentId === t.id).map((s) => s.title),
        ...(t.isMilestone && { milestone: true }),
        ...(() => {
          const deps = edges
            .filter((e) => e.taskId === t.id && indexOf.has(e.dependsOnId))
            .map((e) => indexOf.get(e.dependsOnId)!);
          return deps.length ? { dependsOn: deps } : {};
        })(),
      };
    }),
  };
  const valid = templateDataSchema.safeParse(data);
  if (!valid.success) return { ok: false, error: t("This project can't be saved as a template (too many tasks or columns).") };

  await db.insert(projectTemplates).values({
    workspaceId: project.workspaceId,
    name: parsed.data.name,
    description: parsed.data.description || null,
    data: valid.data,
    createdById: user.id,
  });
  refresh();
  return { ok: true };
}

export async function deleteTemplate(slug: string, templateId: string): Promise<Result> {
  const t = await getT();
  const { user, workspace } = await requireWorkspace(slug);
  const [row] = await db
    .select()
    .from(projectTemplates)
    .where(and(eq(projectTemplates.id, templateId), eq(projectTemplates.workspaceId, workspace.id)))
    .limit(1);
  if (!row) return { ok: false, error: t("Template not found") };
  if (row.createdById !== user.id && workspace.role !== "owner" && workspace.role !== "admin") {
    return { ok: false, error: t("Only the person who saved it or an admin can delete this template.") };
  }
  await db.delete(projectTemplates).where(eq(projectTemplates.id, templateId));
  refresh();
  return { ok: true };
}
