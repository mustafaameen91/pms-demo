"use server";

import { redirect } from "next/navigation";
import { refresh } from "next/cache";
import { and, eq, isNotNull, ne } from "drizzle-orm";
import { z } from "zod";
import { requireWorkspace, requireWorkspaceById } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { activities, expenses, member, projects, taskStatuses } from "@/lib/db/schema";
import { deleteStoredFile } from "@/lib/uploads";
import {
  CURRENCIES,
  DEFAULT_STATUSES,
  POSITION_STEP,
  PROJECT_COLORS,
  PROJECT_STATUSES,
} from "@/lib/constants";
import { canManageProject } from "@/lib/permissions";

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

function fieldErrorsOf(error: z.ZodError) {
  const fieldErrors: Record<string, string> = {};
  for (const issue of error.issues) fieldErrors[String(issue.path[0])] ??= issue.message;
  return { fieldErrors };
}

export async function createProject(
  _prev: ProjectFormState,
  formData: FormData,
): Promise<ProjectFormState> {
  const details = detailsSchema.safeParse(readDetails(formData));
  const key = keySchema.safeParse(formData.get("key"));
  if (!details.success || !key.success) {
    return {
      fieldErrors: {
        ...(details.success ? {} : fieldErrorsOf(details.error).fieldErrors),
        ...(key.success ? {} : { key: key.error.issues[0].message }),
      },
    };
  }

  const { user, workspace } = await requireWorkspace(String(formData.get("workspaceSlug")));

  const [existing] = await db
    .select({ id: projects.id })
    .from(projects)
    .where(and(eq(projects.workspaceId, workspace.id), eq(projects.key, key.data)))
    .limit(1);
  if (existing) return { fieldErrors: { key: `Key ${key.data} is already used in this workspace` } };

  await db.transaction(async (tx) => {
    const [project] = await tx
      .insert(projects)
      .values({
        workspaceId: workspace.id,
        key: key.data,
        ...details.data,
        leadId: user.id,
        createdById: user.id,
      })
      .returning({ id: projects.id });

    await tx.insert(taskStatuses).values(
      DEFAULT_STATUSES.map((s, i) => ({
        workspaceId: workspace.id,
        projectId: project.id,
        name: s.name,
        category: s.category,
        color: s.color,
        position: (i + 1) * POSITION_STEP,
      })),
    );

    await tx.insert(activities).values({
      workspaceId: workspace.id,
      projectId: project.id,
      actorId: user.id,
      type: "project.created",
      data: { name: details.data.name },
    });
  });

  redirect(`/w/${workspace.slug}/p/${key.data}`);
}

/** Loads a project and checks the current user may manage it. */
async function authorizeProject(projectId: string) {
  const [project] = await db.select().from(projects).where(eq(projects.id, projectId)).limit(1);
  if (!project) throw new Error("Project not found");
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
  const { project, user, canManage } = await authorizeProject(String(formData.get("projectId")));
  if (!canManage) return { error: "Only workspace admins or the project manager can edit this project." };

  const details = detailsSchema.safeParse(readDetails(formData));
  const extra = updateSchema.safeParse({
    status: formData.get("status"),
    leadId: (formData.get("leadId") as string) || null,
  });
  if (!details.success) return fieldErrorsOf(details.error);
  if (!extra.success) return fieldErrorsOf(extra.error);

  if (extra.data.leadId) {
    const [isMember] = await db
      .select({ id: member.id })
      .from(member)
      .where(and(eq(member.organizationId, project.workspaceId), eq(member.userId, extra.data.leadId)))
      .limit(1);
    if (!isMember) return { fieldErrors: { leadId: "Project manager must be a workspace member" } };
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
  const { project, user, canManage, slug } = await authorizeProject(projectId);
  if (!canManage) return { ok: false as const, error: "You don't have permission to archive this project." };

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
  const { project, role, slug } = await authorizeProject(projectId);
  if (role !== "owner" && role !== "admin") {
    return { ok: false as const, error: "Only workspace owners and admins can delete projects." };
  }
  if (confirmKey.trim().toUpperCase() !== project.key) {
    return { ok: false as const, error: `Type ${project.key} to confirm.` };
  }
  // Statuses, tasks, expenses, activity etc. cascade with the project; receipt files don't.
  const receipts = await db
    .select({ path: expenses.receiptPath })
    .from(expenses)
    .where(and(eq(expenses.projectId, project.id), isNotNull(expenses.receiptPath)));
  await db.delete(projects).where(eq(projects.id, project.id));
  await Promise.all(receipts.map((r) => deleteStoredFile(r.path)));
  redirect(`/w/${slug}`);
}

/** Changing the key renames every task ID (WEB-12 → SITE-12), so it's a separate, explicit action. */
export async function changeProjectKey(projectId: string, newKey: string) {
  const { project, canManage, slug } = await authorizeProject(projectId);
  if (!canManage) return { ok: false as const, error: "You don't have permission to change the key." };
  const key = keySchema.safeParse(newKey);
  if (!key.success) return { ok: false as const, error: key.error.issues[0].message };
  if (key.data === project.key) return { ok: true as const };

  const [taken] = await db
    .select({ id: projects.id })
    .from(projects)
    .where(
      and(eq(projects.workspaceId, project.workspaceId), eq(projects.key, key.data), ne(projects.id, project.id)),
    )
    .limit(1);
  if (taken) return { ok: false as const, error: `Key ${key.data} is already used in this workspace` };

  await db.update(projects).set({ key: key.data }).where(eq(projects.id, project.id));
  redirect(`/w/${slug}/p/${key.data}/settings`);
}
