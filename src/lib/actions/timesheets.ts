"use server";

import { refresh } from "next/cache";
import { and, asc, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import { requireWorkspaceById } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { activities, projectResources, projects, resources, siteLogs, tasks, timeEntries } from "@/lib/db/schema";
import { canManageProject } from "@/lib/permissions";
import { canViewProject } from "@/lib/data/project-access";
import { checkOverBudget } from "@/lib/budget-alerts";
import { notify, projectManagers } from "@/lib/notifications";
import { WEATHER, isISODate, usedFromTimesheets } from "@/lib/timesheets";
import { todayISO } from "@/lib/accomplishment";
import { getT } from "@/i18n/server";
import type { T } from "@/i18n/translate";

type Result = { ok: true } | { ok: false; error: string; fieldErrors?: Record<string, string> };

const MANAGERS_ONLY = "Only the project manager or admins can do this.";

const quantity = (max: number) =>
  z
    .string()
    .trim()
    .refine((v) => /^\d+(\.\d{1,2})?$/.test(v) && Number(v) > 0, "Enter an amount greater than 0")
    .refine((v) => Number(v) <= max, "That's more than one day allows");
const isoDate = z.string().refine(isISODate, "Choose a date");
const optionalText = (max: number) => z.string().trim().max(max).optional().transform((v) => v || null);

function fieldErrors(error: z.ZodError, t: T): Result {
  const out: Record<string, string> = {};
  for (const issue of error.issues) out[String(issue.path[0])] ??= t(issue.message);
  return { ok: false, error: t(error.issues[0].message), fieldErrors: out };
}

async function loadProject(projectId: string) {
  const [project] = await db.select().from(projects).where(eq(projects.id, projectId)).limit(1);
  if (!project) return null;
  const auth = await requireWorkspaceById(project.workspaceId);
  if (!(await canViewProject(auth.role, auth.user.id, project))) return null;
  return { project, ...auth, manager: canManageProject(auth.role, auth.user.id, project) };
}

async function taskInProject(taskId: string | null, projectId: string) {
  if (!taskId) return true;
  const [task] = await db
    .select({ id: tasks.id })
    .from(tasks)
    .where(and(eq(tasks.id, taskId), eq(tasks.projectId, projectId), isNull(tasks.deletedAt)))
    .limit(1);
  return Boolean(task);
}

/** A future date is a typo, not a timesheet. */
function checkDate(date: string, t: T): Result | null {
  return date > todayISO() ? { ok: false, error: t("Time can't be logged for a future date."), fieldErrors: { date: t("Time can't be logged for a future date.") } } : null;
}

/**
 * Keeps a worker's used quantity on the project in step with their approved
 * attendance. The first time, whatever was entered by hand is kept as the
 * starting point, so nothing recorded before timesheets is lost.
 */
async function syncUsage(usageId: string | null) {
  if (!usageId) return;
  const [usage] = await db.select().from(projectResources).where(eq(projectResources.id, usageId)).limit(1);
  if (!usage) return;
  const base = usage.fromTimesheets ? usage.usedQtyBase : usage.usedQty;
  const entries = await db
    .select({ quantity: timeEntries.quantity, status: timeEntries.status })
    .from(timeEntries)
    .where(eq(timeEntries.projectResourceId, usageId));
  await db
    .update(projectResources)
    .set({ fromTimesheets: true, usedQtyBase: base, usedQty: String(usedFromTimesheets(base, entries)) })
    .where(eq(projectResources.id, usageId));
}

// --- Members' own hours ---

const hoursSchema = z.object({
  date: isoDate,
  taskId: z.string().optional().transform((v) => v || null),
  hours: quantity(24),
  note: optionalText(500),
});
export type HoursInput = z.input<typeof hoursSchema>;

/**
 * Log (or, with entryId, change) your own hours on a project. Team members'
 * hours wait for the project manager's approval; managers' count right away.
 */
export async function logHours(projectId: string, input: HoursInput, entryId: string | null = null): Promise<Result> {
  const t = await getT();
  const auth = await loadProject(projectId);
  if (!auth) return { ok: false, error: t("Project not found") };
  const { project, user, manager, slug } = auth;
  const parsed = hoursSchema.safeParse(input);
  if (!parsed.success) return fieldErrors(parsed.error, t);
  const d = parsed.data;
  const bad = checkDate(d.date, t);
  if (bad) return bad;
  if (!(await taskInProject(d.taskId, projectId))) return { ok: false, error: t("Task not found"), fieldErrors: { taskId: t("Task not found") } };

  let existing: typeof timeEntries.$inferSelect | undefined;
  if (entryId) {
    [existing] = await db.select().from(timeEntries).where(and(eq(timeEntries.id, entryId), eq(timeEntries.projectId, projectId))).limit(1);
    if (!existing || !existing.userId) return { ok: false, error: t("Entry not found") };
    if (!manager && (existing.userId !== user.id || existing.status === "approved")) {
      return { ok: false, error: t("Approved time can only be changed by the project manager.") };
    }
  }
  const status = manager ? ("approved" as const) : ("pending" as const);
  const values = {
    date: d.date,
    taskId: d.taskId,
    quantity: d.hours,
    unit: "hour",
    note: d.note,
    status,
    decidedById: manager ? user.id : null,
    decidedAt: manager ? new Date() : null,
    decisionNote: null,
  };
  if (existing) {
    await db.update(timeEntries).set({ ...values, updatedAt: new Date() }).where(eq(timeEntries.id, existing.id));
  } else {
    await db.insert(timeEntries).values({ ...values, workspaceId: project.workspaceId, projectId, userId: user.id, createdById: user.id });
  }
  await db.insert(activities).values({
    workspaceId: project.workspaceId,
    projectId,
    taskId: d.taskId,
    actorId: user.id,
    type: existing ? "time.updated" : "time.logged",
    data: { name: user.name, quantity: d.hours, unit: "hour", date: d.date },
  });
  if (status === "pending") {
    await notify({
      workspaceId: project.workspaceId,
      userIds: await projectManagers(project.workspaceId, project.leadId),
      actorId: user.id,
      type: "time",
      title: (tr) => tr("{name} logged hours on {project} — waiting for your approval", { name: user.name, project: project.name }),
      link: `/w/${slug}/p/${project.key}/timesheets`,
      // One reminder per person per project per day, however many entries.
      dedupeKey: `time:${projectId}:${user.id}:${d.date}`,
    });
  }
  refresh();
  return { ok: true };
}

// --- Workers' attendance (managers) ---

const attendanceSchema = z.object({
  date: isoDate,
  taskId: z.string().optional().transform((v) => v || null),
  note: optionalText(500),
  workers: z
    .array(z.object({ resourceId: z.string().min(1), quantity: quantity(744) }))
    .min(1, "Choose at least one worker"),
});
export type AttendanceInput = z.input<typeof attendanceSchema>;

/** The project resource row a worker's time counts toward (created if they're not on the project yet). */
async function usageFor(project: typeof projects.$inferSelect, worker: typeof resources.$inferSelect, taskId: string | null, actorId: string) {
  const rows = await db
    .select()
    .from(projectResources)
    .where(and(eq(projectResources.projectId, project.id), eq(projectResources.resourceId, worker.id)))
    .orderBy(asc(projectResources.createdAt));
  const match = rows.find((r) => r.taskId === taskId) ?? rows.find((r) => r.taskId === null) ?? rows[0];
  if (match) return match.id;
  const [created] = await db
    .insert(projectResources)
    .values({
      workspaceId: project.workspaceId,
      projectId: project.id,
      resourceId: worker.id,
      taskId,
      unitCost: worker.unitCost ?? "0",
      fromTimesheets: true,
    })
    .returning({ id: projectResources.id });
  await db.insert(activities).values({
    workspaceId: project.workspaceId,
    projectId: project.id,
    actorId,
    type: "resource.added",
    data: { name: worker.name, plannedQty: "0" },
  });
  return created.id;
}

/** Record which workers were on site for a day, and how long. Fills in their used quantity and cost. */
export async function recordAttendance(projectId: string, input: AttendanceInput): Promise<Result> {
  const t = await getT();
  const auth = await loadProject(projectId);
  if (!auth) return { ok: false, error: t("Project not found") };
  if (!auth.manager) return { ok: false, error: t(MANAGERS_ONLY) };
  const { project, user } = auth;
  const parsed = attendanceSchema.safeParse(input);
  if (!parsed.success) return fieldErrors(parsed.error, t);
  const d = parsed.data;
  const bad = checkDate(d.date, t);
  if (bad) return bad;
  if (!(await taskInProject(d.taskId, projectId))) return { ok: false, error: t("Task not found"), fieldErrors: { taskId: t("Task not found") } };

  const touched = new Set<string>();
  const names: string[] = [];
  for (const w of d.workers) {
    const [worker] = await db
      .select()
      .from(resources)
      .where(and(eq(resources.id, w.resourceId), eq(resources.workspaceId, project.workspaceId), eq(resources.type, "labor")))
      .limit(1);
    if (!worker) return { ok: false, error: t("Worker not found") };
    const usageId = await usageFor(project, worker, d.taskId, user.id);
    await db.insert(timeEntries).values({
      workspaceId: project.workspaceId,
      projectId,
      date: d.date,
      resourceId: worker.id,
      projectResourceId: usageId,
      taskId: d.taskId,
      quantity: w.quantity,
      unit: worker.unit,
      note: d.note,
      status: "approved",
      decidedById: user.id,
      decidedAt: new Date(),
      createdById: user.id,
    });
    touched.add(usageId);
    names.push(worker.name);
  }
  for (const id of touched) await syncUsage(id);
  await db.insert(activities).values({
    workspaceId: project.workspaceId,
    projectId,
    taskId: d.taskId,
    actorId: user.id,
    type: "time.attendance",
    data: { count: names.length, names: names.join(", "), date: d.date },
  });
  await checkOverBudget(projectId, user.id);
  refresh();
  return { ok: true };
}

// --- Approving, changing, removing ---

const decisionSchema = z.object({ decision: z.enum(["approved", "rejected"]), note: optionalText(500) });

export async function decideTimeEntry(entryId: string, input: z.input<typeof decisionSchema>): Promise<Result> {
  const t = await getT();
  const [entry] = await db.select().from(timeEntries).where(eq(timeEntries.id, entryId)).limit(1);
  if (!entry) return { ok: false, error: t("Entry not found") };
  const auth = await loadProject(entry.projectId);
  if (!auth) return { ok: false, error: t("Project not found") };
  if (!auth.manager) return { ok: false, error: t(MANAGERS_ONLY) };
  const parsed = decisionSchema.safeParse(input);
  if (!parsed.success) return fieldErrors(parsed.error, t);
  const d = parsed.data;
  if (d.decision === "rejected" && !d.note) return { ok: false, error: t("Say why it's rejected, so the person can fix it.") };
  if (entry.status !== "pending") return { ok: false, error: t("This was already decided.") };

  await db
    .update(timeEntries)
    .set({ status: d.decision, decidedById: auth.user.id, decidedAt: new Date(), decisionNote: d.note })
    .where(and(eq(timeEntries.id, entryId), eq(timeEntries.status, "pending")));
  await syncUsage(entry.projectResourceId);
  await db.insert(activities).values({
    workspaceId: entry.workspaceId,
    projectId: entry.projectId,
    taskId: entry.taskId,
    actorId: auth.user.id,
    type: d.decision === "approved" ? "time.approved" : "time.rejected",
    data: { quantity: entry.quantity, unit: entry.unit, date: entry.date, note: d.note },
  });
  if (d.decision === "rejected" && entry.userId) {
    await notify({
      workspaceId: entry.workspaceId,
      userIds: [entry.userId],
      actorId: auth.user.id,
      type: "time",
      title: (tr) => tr("{name} rejected your hours for {date}", { name: auth.user.name, date: entry.date }),
      body: d.note,
      link: `/w/${auth.slug}/p/${auth.project.key}/timesheets?week=${entry.date}`,
    });
  }
  refresh();
  return { ok: true };
}

/** Your own entry while it's not approved yet; managers any entry. */
export async function deleteTimeEntry(entryId: string): Promise<Result> {
  const t = await getT();
  const [entry] = await db.select().from(timeEntries).where(eq(timeEntries.id, entryId)).limit(1);
  if (!entry) return { ok: false, error: t("Entry not found") };
  const auth = await loadProject(entry.projectId);
  if (!auth) return { ok: false, error: t("Project not found") };
  const own = entry.userId === auth.user.id && entry.status !== "approved";
  if (!auth.manager && !own) return { ok: false, error: t("Approved time can only be changed by the project manager.") };
  await db.delete(timeEntries).where(eq(timeEntries.id, entryId));
  await syncUsage(entry.projectResourceId);
  await db.insert(activities).values({
    workspaceId: entry.workspaceId,
    projectId: entry.projectId,
    taskId: entry.taskId,
    actorId: auth.user.id,
    type: "time.deleted",
    data: { quantity: entry.quantity, unit: entry.unit, date: entry.date },
  });
  refresh();
  return { ok: true };
}

// --- Site log ---

const siteLogSchema = z.object({
  date: isoDate,
  weather: z
    .string()
    .optional()
    .transform((v) => v || null)
    .refine((v) => v === null || WEATHER.some((w) => w.value === v), "Choose the weather"),
  temperature: z
    .string()
    .trim()
    .optional()
    .transform((v) => (v ? v : null))
    .refine((v) => v === null || /^-?\d{1,2}$/.test(v), "Enter a temperature in °C")
    .transform((v) => (v === null ? null : Number(v))),
  deliveries: optionalText(2000),
  problems: optionalText(2000),
  notes: optionalText(4000),
});
export type SiteLogInput = z.input<typeof siteLogSchema>;

/** Anyone on the project team can write the day's site log. */
export async function saveSiteLog(projectId: string, input: SiteLogInput): Promise<Result> {
  const t = await getT();
  const auth = await loadProject(projectId);
  if (!auth) return { ok: false, error: t("Project not found") };
  const parsed = siteLogSchema.safeParse(input);
  if (!parsed.success) return fieldErrors(parsed.error, t);
  const d = parsed.data;
  const bad = checkDate(d.date, t);
  if (bad) return bad;
  const { project, user } = auth;
  const values = { weather: d.weather, temperature: d.temperature, deliveries: d.deliveries, problems: d.problems, notes: d.notes, updatedById: user.id };
  await db
    .insert(siteLogs)
    .values({ ...values, workspaceId: project.workspaceId, projectId, date: d.date, createdById: user.id })
    .onConflictDoUpdate({ target: [siteLogs.projectId, siteLogs.date], set: { ...values, updatedAt: new Date() } });
  await db.insert(activities).values({
    workspaceId: project.workspaceId,
    projectId,
    actorId: user.id,
    type: "sitelog.saved",
    data: { date: d.date, problems: Boolean(d.problems) },
  });
  refresh();
  return { ok: true };
}
