"use server";

import { redirect } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { requireWorkspace } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { activities, projects, taskStatuses } from "@/lib/db/schema";
import { DEFAULT_STATUSES, POSITION_STEP, PROJECT_COLORS } from "@/lib/constants";

export type ProjectFormState = { error?: string; fieldErrors?: Record<string, string> } | undefined;

const projectSchema = z.object({
  workspaceSlug: z.string().min(1),
  name: z.string().trim().min(2, "Name must be at least 2 characters").max(60),
  key: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z][A-Z0-9]{1,5}$/, "2–6 letters or digits, starting with a letter"),
  color: z.enum(PROJECT_COLORS),
  description: z.string().trim().max(500).optional(),
});

export async function createProject(
  _prev: ProjectFormState,
  formData: FormData,
): Promise<ProjectFormState> {
  const parsed = projectSchema.safeParse({
    workspaceSlug: formData.get("workspaceSlug"),
    name: formData.get("name"),
    key: formData.get("key"),
    color: formData.get("color"),
    description: formData.get("description") || undefined,
  });
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) fieldErrors[String(issue.path[0])] ??= issue.message;
    return { fieldErrors };
  }

  const { user, workspace } = await requireWorkspace(parsed.data.workspaceSlug);
  const { name, key, color, description } = parsed.data;

  const [existing] = await db
    .select({ id: projects.id })
    .from(projects)
    .where(and(eq(projects.workspaceId, workspace.id), eq(projects.key, key)))
    .limit(1);
  if (existing) return { fieldErrors: { key: `Key ${key} is already used in this workspace` } };

  await db.transaction(async (tx) => {
    const [project] = await tx
      .insert(projects)
      .values({
        workspaceId: workspace.id,
        name,
        key,
        color,
        description,
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
      data: { name },
    });
  });

  redirect(`/w/${workspace.slug}/p/${key}`);
}
