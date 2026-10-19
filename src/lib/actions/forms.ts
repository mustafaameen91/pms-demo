"use server";

import { createHash, randomBytes } from "node:crypto";
import { headers } from "next/headers";
import { refresh } from "next/cache";
import { and, asc, eq, max, sql } from "drizzle-orm";
import { z } from "zod";
import { requireWorkspaceById } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { activities, formSubmissions, member, projects, requestForms, taskStatuses, tasks } from "@/lib/db/schema";
import { getWorkspaceAccess } from "@/lib/billing";
import { POSITION_STEP } from "@/lib/constants";
import { appUrl, sendEmail } from "@/lib/email";
import { MIN_FILL_MS, createRateLimiter, describeSubmission, formConfigSchema, submissionSchema } from "@/lib/forms";
import { notify, projectContext } from "@/lib/notifications";
import { runAutomations } from "@/lib/automation-runner";
import { canManageProject } from "@/lib/permissions";

type Result<T = undefined> = { ok: true; data?: T } | { ok: false; error: string; fieldErrors?: Record<string, string> };

const newToken = () => randomBytes(18).toString("base64url");

async function authorizeProject(projectId: string) {
  const [project] = await db.select().from(projects).where(eq(projects.id, projectId)).limit(1);
  if (!project) return null;
  const { user, role } = await requireWorkspaceById(project.workspaceId);
  if (!canManageProject(role, user.id, project)) return null;
  return { project, user };
}

async function authorizeForm(formId: string) {
  const [form] = await db.select().from(requestForms).where(eq(requestForms.id, formId)).limit(1);
  if (!form) return null;
  const auth = await authorizeProject(form.projectId);
  return auth ? { form, ...auth } : null;
}

const formSchema = z.object({
  title: z.string().trim().min(2, "Give the form a title").max(120),
  intro: z.string().trim().max(1000).optional().transform((v) => v || null),
  statusId: z.string().optional().transform((v) => v || null),
  assigneeId: z.string().optional().transform((v) => v || null),
  config: formConfigSchema,
});
export type FormInput = z.input<typeof formSchema>;

/** Checks the chosen column and assignee belong to this project / workspace. */
async function checkTargets(projectId: string, workspaceId: string, statusId: string | null, assigneeId: string | null) {
  if (statusId) {
    const [s] = await db
      .select({ id: taskStatuses.id })
      .from(taskStatuses)
      .where(and(eq(taskStatuses.id, statusId), eq(taskStatuses.projectId, projectId)))
      .limit(1);
    if (!s) return "That column isn't in this project.";
  }
  if (assigneeId) {
    const [m] = await db
      .select({ id: member.id })
      .from(member)
      .where(and(eq(member.organizationId, workspaceId), eq(member.userId, assigneeId)))
      .limit(1);
    if (!m) return "The assignee must be a workspace member.";
  }
  return null;
}

export async function saveForm(projectId: string, formId: string | null, input: FormInput): Promise<Result> {
  const auth = formId ? await authorizeForm(formId) : await authorizeProject(projectId);
  if (!auth) return { ok: false, error: "Only admins or the project manager can manage request forms." };
  const parsed = formSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
  const d = parsed.data;
  const bad = await checkTargets(auth.project.id, auth.project.workspaceId, d.statusId, d.assigneeId);
  if (bad) return { ok: false, error: bad };

  if (formId) {
    await db.update(requestForms).set(d).where(eq(requestForms.id, formId));
  } else {
    await db.transaction(async (tx) => {
      await tx.insert(requestForms).values({
        ...d,
        workspaceId: auth.project.workspaceId,
        projectId: auth.project.id,
        token: newToken(),
        createdById: auth.user.id,
      });
      await tx.insert(activities).values({
        workspaceId: auth.project.workspaceId,
        projectId: auth.project.id,
        actorId: auth.user.id,
        type: "form.created",
        data: { title: d.title },
      });
    });
  }
  refresh();
  return { ok: true };
}

export async function setFormEnabled(formId: string, enabled: boolean): Promise<Result> {
  const auth = await authorizeForm(formId);
  if (!auth) return { ok: false, error: "Not allowed" };
  await db.update(requestForms).set({ enabled }).where(eq(requestForms.id, formId));
  refresh();
  return { ok: true };
}

/** New link; the old one stops working (e.g. if it was shared too widely). */
export async function regenerateFormLink(formId: string): Promise<Result> {
  const auth = await authorizeForm(formId);
  if (!auth) return { ok: false, error: "Not allowed" };
  await db.update(requestForms).set({ token: newToken() }).where(eq(requestForms.id, formId));
  refresh();
  return { ok: true };
}

export async function deleteForm(formId: string): Promise<Result> {
  const auth = await authorizeForm(formId);
  if (!auth) return { ok: false, error: "Not allowed" };
  // Tasks created from it stay; only the form and its submission records go.
  await db.delete(requestForms).where(eq(requestForms.id, formId));
  refresh();
  return { ok: true };
}

// --- Public submission ---

// 5 created requests per 10 minutes per form and connection.
const submitLimiter = createRateLimiter(5, 10 * 60_000);

async function clientKey() {
  const h = await headers();
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "unknown";
  // Store only a hash of the address.
  return createHash("sha256")
    .update(`${process.env.BETTER_AUTH_SECRET ?? ""}:${ip}`)
    .digest("hex")
    .slice(0, 32);
}

export type SubmitInput = {
  subject: string;
  details?: string;
  name?: string;
  email?: string;
  phone?: string;
  priority?: string;
  neededBy?: string;
  answers: Record<string, string>;
  /** Honeypot: hidden field people never fill. */
  website?: string;
  /** When the form was shown (ms). */
  renderedAt: number;
};

export async function submitRequest(token: string, input: SubmitInput): Promise<Result<{ reference: string }>> {
  const [form] = await db.select().from(requestForms).where(eq(requestForms.token, token)).limit(1);
  if (!form || !form.enabled || !(await getWorkspaceAccess(form.workspaceId)).allowed) {
    return { ok: false, error: "This form is closed." };
  }

  // Bots: pretend it worked, store nothing.
  if (input.website) return { ok: true, data: { reference: "—" } };
  if (!Number.isFinite(input.renderedAt) || Date.now() - input.renderedAt < MIN_FILL_MS) {
    return { ok: false, error: "That was very fast — please check your answers and send again." };
  }
  const ipHash = await clientKey();
  const limitKey = `${form.id}:${ipHash}`;
  if (!submitLimiter.allowed(limitKey)) {
    return { ok: false, error: "Too many requests from your connection. Please try again in a few minutes." };
  }

  const config = formConfigSchema.safeParse(form.config);
  if (!config.success) return { ok: false, error: "This form is misconfigured. Please contact the team." };
  const parsed = submissionSchema(config.data).safeParse({
    ...input,
    priority: input.priority || undefined,
    name: config.data.askName === "off" ? undefined : (input.name ?? ""),
    email: config.data.askEmail === "off" ? undefined : (input.email ?? ""),
    phone: config.data.askPhone === "off" ? undefined : (input.phone ?? ""),
  });
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = issue.path[0] === "answers" ? `answers.${String(issue.path[1])}` : String(issue.path[0]);
      fieldErrors[key] ??= issue.message;
    }
    return { ok: false, error: parsed.error.issues[0].message, fieldErrors };
  }
  const d = parsed.data;
  const answers = Object.fromEntries(Object.entries(d.answers).filter(([, v]) => v)) as Record<string, string>;

  const [project] = await db.select().from(projects).where(eq(projects.id, form.projectId)).limit(1);
  const statuses = await db
    .select()
    .from(taskStatuses)
    .where(eq(taskStatuses.projectId, form.projectId))
    .orderBy(asc(taskStatuses.position));
  const status =
    statuses.find((s) => s.id === form.statusId) ??
    statuses.find((s) => s.category === "todo") ??
    statuses[0];

  const created = await db.transaction(async (tx) => {
    const [{ taskCounter }] = await tx
      .update(projects)
      .set({ taskCounter: sql`${projects.taskCounter} + 1` })
      .where(eq(projects.id, form.projectId))
      .returning({ taskCounter: projects.taskCounter });
    const [{ maxPos }] = await tx
      .select({ maxPos: max(tasks.position) })
      .from(tasks)
      .where(and(eq(tasks.projectId, form.projectId), eq(tasks.statusId, status.id)));
    const [task] = await tx
      .insert(tasks)
      .values({
        workspaceId: form.workspaceId,
        projectId: form.projectId,
        number: taskCounter,
        statusId: status.id,
        title: d.subject,
        description: describeSubmission(config.data.questions, { ...d, answers }) || null,
        priority: (d.priority as typeof tasks.$inferInsert.priority) ?? "none",
        dueDate: d.neededBy ?? null,
        assigneeId: form.assigneeId,
        position: (maxPos ?? 0) + POSITION_STEP,
      })
      .returning({ id: tasks.id });
    await tx.insert(formSubmissions).values({
      workspaceId: form.workspaceId,
      formId: form.id,
      taskId: task.id,
      requesterName: d.name ?? null,
      requesterEmail: d.email ?? null,
      requesterPhone: d.phone ?? null,
      answers,
      ipHash,
    });
    await tx.insert(activities).values({
      workspaceId: form.workspaceId,
      projectId: form.projectId,
      taskId: task.id,
      actorId: null,
      type: "task.created_from_form",
      data: { form: form.title, requester: d.name ?? d.email ?? null },
    });
    return { id: task.id, number: taskCounter };
  });

  submitLimiter.record(limitKey);
  await runAutomations({ type: "task.created", projectId: form.projectId, taskId: created.id }, null);
  const reference = `${project.key}-${created.number}`;
  const ctx = await projectContext(form.projectId);
  if (ctx) {
    await notify({
      workspaceId: form.workspaceId,
      userIds: [ctx.leadId, form.assigneeId],
      type: "request.received",
      title: `New request ${reference}: ${d.subject}`,
      body: `Via “${form.title}”${d.name ? ` from ${d.name}` : ""}`,
      link: `/w/${ctx.slug}/p/${ctx.key}?task=${reference}`,
      email: true,
    });
  }
  if (d.email) {
    await sendEmail({
      to: d.email,
      subject: `We received your request ${reference}`,
      text: `Thanks${d.name ? ` ${d.name}` : ""}, we received your request:\n\n“${d.subject}”\n\nReference: ${reference}\nPlease mention this reference if you contact us about it.\n\n${appUrl(`/f/${token}`)}`,
    });
  }
  return { ok: true, data: { reference } };
}
