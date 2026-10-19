"use server";

import { redirect } from "next/navigation";
import { refresh } from "next/cache";
import { and, eq, isNotNull, ne } from "drizzle-orm";
import { z } from "zod";
import { requireWorkspace, requireWorkspaceById } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { activities, expenses, member, projectTemplates, projects, taskDependencies, taskStatuses, tasks } from "@/lib/db/schema";
import { addDays, builtinTemplate, localizeBuiltinTemplate, templateDataSchema, templateLengthDays } from "@/lib/templates";
import { deleteStoredFile } from "@/lib/uploads";
import {
  CURRENCIES,
  DEFAULT_STATUSES,
  POSITION_STEP,
  PROJECT_COLORS,
  PROJECT_STATUSES,
} from "@/lib/constants";
import { canManageProject } from "@/lib/permissions";
import { getT } from "@/i18n/server";
import type { T } from "@/i18n/translate";

export type ProjectFormState =
  | { error?: string; fieldErrors?: Record<string, string>; saved?: boolean }
  | undefined;

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((v) => v || null)
    .nullable();

const optionalDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid date")
  .nullable()
  .or(z.literal("").transform(() => null));

const detailsSchema = z
  .object({
    name: z.string().trim().min(2, "Name must be at least 2 characters").max(60),
    color: z.enum(PROJECT_COLORS),
    description: optionalText(1000),
    client: optionalText(120),
    startDate: optionalDate,
    endDate: optionalDate,
    budget: z
      .string()
      .trim()
      .transform((v) => v.replace(/,/g, ""))
      .refine((v) => v === "" || /^\d{1,12}(\.\d{1,2})?$/.test(v), "Enter an amount like 15000 or 15000.50")
      .transform((v) => v || null)
      .nullable(),
    currency: z.enum(CURRENCIES),
  })
  .refine((d) => !d.startDate || !d.endDate || d.endDate >= d.startDate, {
    message: "End date must be on or after the start date",
    path: ["endDate"],
  });

const keySchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z][A-Z0-9]{1,5}$/, "2–6 letters or digits, starting with a letter");

function readDetails(formData: FormData) {
  const get = (k: string) => (formData.get(k) as string | null) ?? null;
  return {
    name: get("name"),
    color: get("color"),
    description: get("description") ?? "",
    client: get("client") ?? "",
    startDate: get("startDate") ?? "",
    endDate: get("endDate") ?? "",
    budget: get("budget") ?? "",
    currency: get("currency") ?? "USD",
  };
}

function fieldErrorsOf(error: z.ZodError, t: T) {
  const fieldErrors: Record<string, string> = {};
  for (const issue of error.issues) fieldErrors[String(issue.path[0])] ??= t(issue.message);
  return { fieldErrors };
}

export async function createProject(
  _prev: ProjectFormState,
  formData: FormData,
): Promise<ProjectFormState> {
  const t = await getT();
  const details = detailsSchema.safeParse(readDetails(formData));
  const key = keySchema.safeParse(formData.get("key"));
  if (!details.success || !key.success) {
    return {
      fieldErrors: {
        ...(details.success ? {} : fieldErrorsOf(details.error, t).fieldErrors),
        ...(key.success ? {} : { key: t(key.error.issues[0].message) }),
      },
    };
  }

  const { user, workspace } = await requireWorkspace(String(formData.get("workspaceSlug")));

  const [existing] = await db
    .select({ id: projects.id })
    .from(projects)
    .where(and(eq(projects.workspaceId, workspace.id), eq(projects.key, key.data)))
    .limit(1);
  if (existing) return { fieldErrors: { key: t("Key {key} is already used in this workspace", { key: key.data }) } };

  const template = await resolveTemplate(String(formData.get("template") ?? ""), workspace.id);
  if (template === "invalid") return { error: t("That template is no longer available. Choose another one.") };

  // With a template and a start date but no end date, finish when the template's last task does.
  const length = template ? templateLengthDays(template) : 0;
  const endDate =
    details.data.endDate ?? (template && details.data.startDate && length > 0 ? addDays(details.data.startDate, length - 1) : null);

  await db.transaction(async (tx) => {
    const [project] = await tx
      .insert(projects)
      .values({
        workspaceId: workspace.id,
        key: key.data,
        ...details.data,
        endDate,
        leadId: user.id,
        createdById: user.id,
      })
      .returning({ id: projects.id });

    const statusRows = await tx
      .insert(taskStatuses)
      .values(
        (template?.statuses ?? DEFAULT_STATUSES).map((s, i) => ({
          workspaceId: workspace.id,
          projectId: project.id,
          // Default and built-in columns are named in the creator's language; after that they're the team's data.
          name: !template || template.builtin ? t(s.name) : s.name,
          category: s.category,
          color: s.color,
          position: (i + 1) * POSITION_STEP,
        })),
      )
      .returning({ id: taskStatuses.id, category: taskStatuses.category });

    if (template && template.tasks.length > 0) {
      // New tasks go in the first "to do" column (or the first column).
      const startStatus = statusRows.find((s) => s.category === "todo") ?? statusRows[0];
      const start = details.data.startDate;
      let number = 0;
      const ids: string[] = [];
      for (const [i, task] of template.tasks.entries()) {
        const startDate = start && task.startOffset !== undefined ? addDays(start, task.startOffset) : null;
        const dueDate = startDate && task.duration ? addDays(startDate, task.duration - 1) : null;
        const [main] = await tx
          .insert(tasks)
          .values({
            workspaceId: workspace.id,
            projectId: project.id,
            number: ++number,
            statusId: startStatus.id,
            title: task.title,
            description: task.description ?? null,
            // Milestones are one date with no weight.
            weight: !task.milestone && task.weight !== undefined ? task.weight.toFixed(2) : null,
            startDate: task.milestone ? null : startDate,
            dueDate: task.milestone ? (dueDate ?? startDate) : dueDate,
            isMilestone: task.milestone ?? false,
            reporterId: user.id,
            position: (i + 1) * POSITION_STEP,
          })
          .returning({ id: tasks.id });
        ids.push(main.id);
        for (const [j, title] of (task.subtasks ?? []).entries()) {
          await tx.insert(tasks).values({
            workspaceId: workspace.id,
            projectId: project.id,
            parentId: main.id,
            number: ++number,
            statusId: startStatus.id,
            title,
            reporterId: user.id,
            position: (j + 1) * POSITION_STEP,
          });
        }
      }
      await tx.update(projects).set({ taskCounter: number }).where(eq(projects.id, project.id));
      const edges = template.tasks.flatMap((task, i) =>
        (task.dependsOn ?? []).map((d) => ({
          workspaceId: workspace.id,
          projectId: project.id,
          taskId: ids[i],
          dependsOnId: ids[d],
        })),
      );
      if (edges.length) await tx.insert(taskDependencies).values(edges).onConflictDoNothing();
    }

    await tx.insert(activities).values({
      workspaceId: workspace.id,
      projectId: project.id,
      actorId: user.id,
      type: "project.created",
      data: { name: details.data.name, ...(template && { template: template.name }) },
    });
  });

  redirect(`/w/${workspace.slug}/p/${key.data}`);
}

/** Loads a project and checks the current user may manage it. */
async function authorizeProject(projectId: string) {
  const [project] = await db.select().from(projects).where(eq(projects.id, projectId)).limit(1);
  if (!project) throw new Error((await getT())("Project not found"));
  const { user, role, slug } = await requireWorkspaceById(project.workspaceId);
  return { project, user, role, slug, canManage: canManageProject(role, user.id, project) };
}

const updateSchema = z.object({
  status: z.enum(PROJECT_STATUSES.map((s) => s.value) as [string, ...string[]]),
  leadId: z.string().min(1).nullable(),
});

export async function updateProject(
  _prev: ProjectFormState,
  formData: FormData,
): Promise<ProjectFormState> {
  const t = await getT();
  const { project, user, canManage } = await authorizeProject(String(formData.get("projectId")));
  if (!canManage) return { error: t("Only workspace admins or the project manager can edit this project.") };

  const details = detailsSchema.safeParse(readDetails(formData));
  const extra = updateSchema.safeParse({
    status: formData.get("status"),
    leadId: (formData.get("leadId") as string) || null,
  });
  if (!details.success) return fieldErrorsOf(details.error, t);
  if (!extra.success) return fieldErrorsOf(extra.error, t);

  if (extra.data.leadId) {
    const [isMember] = await db
      .select({ id: member.id })
      .from(member)
      .where(and(eq(member.organizationId, project.workspaceId), eq(member.userId, extra.data.leadId)))
      .limit(1);
    if (!isMember) return { fieldErrors: { leadId: t("Project manager must be a workspace member") } };
  }

  const changes = {
    ...details.data,
    status: extra.data.status as typeof project.status,
    leadId: extra.data.leadId,
  };
  // Record which fields changed, for the activity history.
  const changed = (Object.keys(changes) as (keyof typeof changes)[]).filter((k) =>
    k === "budget"
      ? (changes.budget === null ? null : Number(changes.budget)) !==
        (project.budget === null ? null : Number(project.budget))
      : String(changes[k] ?? "") !== String(project[k] ?? ""),
  );
  if (changed.length === 0) return { saved: true };

  await db.transaction(async (tx) => {
    await tx.update(projects).set(changes).where(eq(projects.id, project.id));
    await tx.insert(activities).values({
      workspaceId: project.workspaceId,
      projectId: project.id,
      actorId: user.id,
      type: "project.updated",
      data: { fields: changed },
    });
  });

  refresh();
  return { saved: true };
}

export async function setProjectArchived(projectId: string, archived: boolean) {
  const t = await getT();
  const { project, user, canManage, slug } = await authorizeProject(projectId);
  if (!canManage) return { ok: false as const, error: t("You don't have permission to archive this project.") };

  await db.transaction(async (tx) => {
    await tx
      .update(projects)
      .set({ archivedAt: archived ? new Date() : null })
      .where(eq(projects.id, project.id));
    await tx.insert(activities).values({
      workspaceId: project.workspaceId,
      projectId: project.id,
      actorId: user.id,
      type: archived ? "project.archived" : "project.restored",
      data: {},
    });
  });

  if (archived) redirect(`/w/${slug}`);
  refresh();
  return { ok: true as const };
}

export async function deleteProject(projectId: string, confirmKey: string) {
  const t = await getT();
  const { project, role, slug, user } = await authorizeProject(projectId);
  if (role !== "owner" && role !== "admin") {
    return { ok: false as const, error: t("Only workspace owners and admins can delete projects.") };
  }
  if (confirmKey.trim().toUpperCase() !== project.key) {
    return { ok: false as const, error: t("Type {key} to confirm.", { key: project.key }) };
  }
  // Statuses, tasks, expenses, activity etc. cascade with the project; receipt files don't.
  const receipts = await db
    .select({ path: expenses.receiptPath })
    .from(expenses)
    .where(and(eq(expenses.projectId, project.id), isNotNull(expenses.receiptPath)));
  await db.transaction(async (tx) => {
    await tx.delete(projects).where(eq(projects.id, project.id));
    // Kept in the workspace audit log (no project link: the project is gone).
    await tx.insert(activities).values({
      workspaceId: project.workspaceId,
      actorId: user.id,
      type: "project.deleted",
      data: { name: project.name, key: project.key },
    });
  });
  await Promise.all(receipts.map((r) => deleteStoredFile(r.path)));
  redirect(`/w/${slug}`);
}

/** Changing the key renames every task ID (WEB-12 → SITE-12), so it's a separate, explicit action. */
export async function changeProjectKey(projectId: string, newKey: string) {
  const t = await getT();
  const { project, canManage, slug } = await authorizeProject(projectId);
  if (!canManage) return { ok: false as const, error: t("You don't have permission to change the key.") };
  const key = keySchema.safeParse(newKey);
  if (!key.success) return { ok: false as const, error: t(key.error.issues[0].message) };
  if (key.data === project.key) return { ok: true as const };

  const [taken] = await db
    .select({ id: projects.id })
    .from(projects)
    .where(
      and(eq(projects.workspaceId, project.workspaceId), eq(projects.key, key.data), ne(projects.id, project.id)),
    )
    .limit(1);
  if (taken) return { ok: false as const, error: t("Key {key} is already used in this workspace", { key: key.data }) };

  await db.update(projects).set({ key: key.data }).where(eq(projects.id, project.id));
  redirect(`/w/${slug}/p/${key.data}/settings`);
}

/** "builtin:<id>" or "custom:<id>" → template data; "" → none; unknown → "invalid". */
async function resolveTemplate(value: string, workspaceId: string) {
  if (!value) return null;
  const [kind, id] = value.split(":");
  if (kind === "builtin") {
    const found = builtinTemplate(id);
    // Built-in templates come in the creator's language (column names, tasks, sub-tasks).
    const tpl = found && localizeBuiltinTemplate(found, await getT());
    return tpl ? { name: tpl.name, builtin: true, ...tpl.data } : "invalid";
  }
  if (kind === "custom" && id) {
    const [row] = await db
      .select({ name: projectTemplates.name, data: projectTemplates.data })
      .from(projectTemplates)
      .where(and(eq(projectTemplates.id, id), eq(projectTemplates.workspaceId, workspaceId)))
      .limit(1);
    const parsed = row ? templateDataSchema.safeParse(row.data) : null;
    return parsed?.success ? { name: row!.name, builtin: false, ...parsed.data } : "invalid";
  }
  return "invalid";
}
