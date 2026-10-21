import "server-only";
import { and, asc, desc, eq, gte, isNull, lte } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { db } from "@/lib/db";
import { projectResources, resources, siteLogs, tasks, timeEntries, user } from "@/lib/db/schema";

const decider = alias(user, "decider");
const author = alias(user, "author");

/** A project's time entries between two dates (inclusive), with who / which task. Caller authorizes. */
export async function listTimeEntries(projectId: string, from: string, to: string, { status }: { status?: "pending" } = {}) {
  const rows = await db
    .select({
      id: timeEntries.id,
      date: timeEntries.date,
      userId: timeEntries.userId,
      userName: user.name,
      resourceId: timeEntries.resourceId,
      workerName: resources.name,
      workerRole: resources.role,
      taskId: timeEntries.taskId,
      taskNumber: tasks.number,
      taskTitle: tasks.title,
      quantity: timeEntries.quantity,
      unit: timeEntries.unit,
      note: timeEntries.note,
      status: timeEntries.status,
      decisionNote: timeEntries.decisionNote,
      deciderName: decider.name,
      createdById: timeEntries.createdById,
      createdByName: author.name,
    })
    .from(timeEntries)
    .leftJoin(user, eq(user.id, timeEntries.userId))
    .leftJoin(resources, eq(resources.id, timeEntries.resourceId))
    .leftJoin(tasks, and(eq(tasks.id, timeEntries.taskId), isNull(tasks.deletedAt)))
    .leftJoin(decider, eq(decider.id, timeEntries.decidedById))
    .leftJoin(author, eq(author.id, timeEntries.createdById))
    .where(
      and(
        eq(timeEntries.projectId, projectId),
        status ? eq(timeEntries.status, status) : and(gte(timeEntries.date, from), lte(timeEntries.date, to)),
      ),
    )
    .orderBy(asc(timeEntries.date), asc(timeEntries.createdAt));
  return rows.map((r) => ({
    ...r,
    kind: r.userId ? ("member" as const) : ("worker" as const),
    personKey: r.userId ? `u:${r.userId}` : `w:${r.resourceId}`,
    personName: r.userName ?? r.workerName ?? "",
  }));
}
export type TimeEntryRow = Awaited<ReturnType<typeof listTimeEntries>>[number];

/** Workers (labour from the resource library) a manager can record attendance for. */
export async function listWorkersForAttendance(workspaceId: string, projectId: string) {
  const [workers, onProject] = await Promise.all([
    db
      .select({ id: resources.id, name: resources.name, role: resources.role, unit: resources.unit })
      .from(resources)
      .where(and(eq(resources.workspaceId, workspaceId), eq(resources.type, "labor"), isNull(resources.archivedAt)))
      .orderBy(asc(resources.name)),
    db
      .select({ resourceId: projectResources.resourceId })
      .from(projectResources)
      .where(eq(projectResources.projectId, projectId)),
  ]);
  const used = new Set(onProject.map((r) => r.resourceId));
  // Workers already on this project first.
  return workers
    .map((w) => ({ ...w, onProject: used.has(w.id) }))
    .sort((a, b) => Number(b.onProject) - Number(a.onProject) || a.name.localeCompare(b.name));
}

export async function getSiteLog(projectId: string, date: string) {
  const [log] = await db
    .select({
      id: siteLogs.id,
      date: siteLogs.date,
      weather: siteLogs.weather,
      temperature: siteLogs.temperature,
      deliveries: siteLogs.deliveries,
      problems: siteLogs.problems,
      notes: siteLogs.notes,
      updatedAt: siteLogs.updatedAt,
      updatedByName: user.name,
    })
    .from(siteLogs)
    .leftJoin(user, eq(user.id, siteLogs.updatedById))
    .where(and(eq(siteLogs.projectId, projectId), eq(siteLogs.date, date)))
    .limit(1);
  return log ?? null;
}

/** The most recent days that have a site log (newest first). */
export async function listSiteLogDays(projectId: string, limit = 30) {
  return db
    .select({ date: siteLogs.date, weather: siteLogs.weather, hasProblems: siteLogs.problems })
    .from(siteLogs)
    .where(eq(siteLogs.projectId, projectId))
    .orderBy(desc(siteLogs.date))
    .limit(limit);
}

/** All of a project's approved time, newest first (for the report). */
export async function listApprovedTime(projectId: string) {
  return (await listTimeEntries(projectId, "0001-01-01", "9999-12-31"))
    .filter((e) => e.status === "approved")
    .sort((a, b) => b.date.localeCompare(a.date));
}
