import "server-only";
import { and, asc, desc, eq, gte, inArray, isNull, lt, lte, ne, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { expenses, member, organization, projectRisks, taskStatuses, tasks, weeklyReports } from "@/lib/db/schema";
import { getProjectHealth } from "@/lib/data/project-health";
import { activeRisksOf } from "@/lib/data/portfolios";
import { notify } from "@/lib/notifications";
import { todayISO } from "@/lib/accomplishment";
import { addDays } from "@/lib/timesheets";
import { headline, progressChange, reportWeek, type ReportProject, type WeeklyReportData } from "@/lib/weekly-report";
import { formatDate } from "@/lib/utils";

const TOP = 5;

/** A snapshot of every active project for the week `start`–`end`. */
export async function buildWeeklyReport(workspaceId: string, start: string, end: string, today: string): Promise<WeeklyReportData> {
  // The report covers every project; who sees which part is decided when it's read.
  const health = (await getProjectHealth({ id: workspaceId, role: "owner" }, "")).filter((r) => !r.finished);
  const ids = health.map((r) => r.p.id);
  if (ids.length === 0) return { start, end, projects: [] };
  const weekEndExclusive = new Date(`${addDays(end, 1)}T00:00:00Z`);
  const weekStartTime = new Date(`${start}T00:00:00Z`);

  const [spent, done, late, risks, newRisks, [previous]] = await Promise.all([
    db
      .select({ projectId: expenses.projectId, total: sql<string>`sum(${expenses.amount})` })
      .from(expenses)
      .where(and(inArray(expenses.projectId, ids), eq(expenses.approvalStatus, "approved"), gte(expenses.date, start), lte(expenses.date, end)))
      .groupBy(expenses.projectId),
    db
      .select({ projectId: tasks.projectId, number: tasks.number, title: tasks.title })
      .from(tasks)
      .where(and(inArray(tasks.projectId, ids), isNull(tasks.deletedAt), gte(tasks.completedAt, weekStartTime), lt(tasks.completedAt, weekEndExclusive)))
      .orderBy(desc(tasks.completedAt)),
    db
      .select({ projectId: tasks.projectId, number: tasks.number, title: tasks.title, dueDate: tasks.dueDate })
      .from(tasks)
      .innerJoin(taskStatuses, eq(taskStatuses.id, tasks.statusId))
      .where(
        and(
          inArray(tasks.projectId, ids),
          isNull(tasks.deletedAt),
          lt(tasks.dueDate, today),
          ne(taskStatuses.category, "done"),
          ne(taskStatuses.category, "canceled"),
        ),
      )
      .orderBy(asc(tasks.dueDate)),
    activeRisksOf(ids),
    db
      .select({ projectId: projectRisks.projectId, n: sql<number>`count(*)`.mapWith(Number) })
      .from(projectRisks)
      .where(and(inArray(projectRisks.projectId, ids), gte(projectRisks.createdAt, weekStartTime), lt(projectRisks.createdAt, weekEndExclusive)))
      .groupBy(projectRisks.projectId),
    db
      .select({ data: weeklyReports.data })
      .from(weeklyReports)
      .where(and(eq(weeklyReports.workspaceId, workspaceId), eq(weeklyReports.weekStart, addDays(start, -7))))
      .limit(1),
  ]);
  const before = new Map(((previous?.data as WeeklyReportData | undefined)?.projects ?? []).map((p) => [p.id, p.actual]));
  const byProject = <T extends { projectId: string }>(rows: T[], id: string) => rows.filter((r) => r.projectId === id);

  const projects: ReportProject[] = health.map(({ p, accomplishment: a, money, forecast }) => {
    const projectDone = byProject(done, p.id);
    const projectLate = byProject(late, p.id);
    return {
      id: p.id,
      key: p.key,
      name: p.name,
      leadId: p.leadId,
      currency: p.currency,
      actual: a.actual,
      change: progressChange(a.actual, before.get(p.id)),
      planned: a.planned,
      schedule: a.schedule,
      budget: money.budget,
      spent: money.actual,
      spentThisWeek: Number(spent.find((s) => s.projectId === p.id)?.total ?? 0),
      overBudget: money.overBudget,
      forecast: forecast.ready ? { final: forecast.final, overBy: forecast.overBy, overPct: forecast.overPct, health: forecast.health, early: forecast.early } : null,
      late: projectLate.slice(0, TOP).map((t) => ({ number: t.number, title: t.title, dueDate: t.dueDate! })),
      lateCount: projectLate.length,
      done: projectDone.slice(0, TOP).map((t) => ({ number: t.number, title: t.title })),
      doneCount: projectDone.length,
      risks: risks.filter((r) => r.projectKey === p.key).slice(0, 3).map((r) => ({ number: r.number, title: r.title, likelihood: r.likelihood, impact: r.impact })),
      newRisks: newRisks.find((r) => r.projectId === p.id)?.n ?? 0,
    };
  });
  return { start, end, projects };
}

/** The projects of a report this person may read: everything for owners/admins, the ones they manage otherwise. */
export function reportFor(data: WeeklyReportData, userId: string, isAdmin: boolean) {
  return isAdmin ? data.projects : data.projects.filter((p) => p.leadId === userId);
}

/**
 * Makes last week's report if it isn't there yet, and tells the people who
 * manage projects. Safe to call often (from page loads and the server timer).
 */
export async function ensureWeeklyReport(workspaceId: string, today = todayISO()) {
  const { start, end } = reportWeek(today);
  const [existing] = await db
    .select({ id: weeklyReports.id })
    .from(weeklyReports)
    .where(and(eq(weeklyReports.workspaceId, workspaceId), eq(weeklyReports.weekStart, start)))
    .limit(1);
  if (existing) return false;
  const [org] = await db.select({ slug: organization.slug, createdAt: organization.createdAt }).from(organization).where(eq(organization.id, workspaceId)).limit(1);
  // A company that signed up after the week ended has nothing to report for it.
  if (!org || org.createdAt >= new Date(`${addDays(end, 1)}T00:00:00Z`)) return false;
  const data = await buildWeeklyReport(workspaceId, start, end, today);
  if (data.projects.length === 0) return false;
  const inserted = await db
    .insert(weeklyReports)
    .values({ workspaceId, weekStart: start, data: data as unknown as Record<string, unknown> })
    .onConflictDoNothing()
    .returning({ id: weeklyReports.id });
  if (inserted.length === 0) return false;

  const people = await db.select({ userId: member.userId, role: member.role }).from(member).where(eq(member.organizationId, workspaceId));
  for (const person of people) {
    const isAdmin = person.role === "owner" || person.role === "admin";
    const mine = reportFor(data, person.userId, isAdmin);
    if (mine.length === 0) continue;
    const h = headline(mine);
    await notify({
      workspaceId,
      userIds: [person.userId],
      type: "report.weekly",
      title: (tr) =>
        tr("Weekly report: {start} – {end}", { start: formatDate(start, tr.intl), end: formatDate(end, tr.intl) }),
      body: (tr) =>
        [
          tr.plural(h.projects, "{count} project", "{count} projects"),
          h.behind && tr.plural(h.behind, "{count} behind schedule", "{count} behind schedule"),
          h.overBudget && tr.plural(h.overBudget, "{count} over budget", "{count} over budget"),
          h.headingOver && tr.plural(h.headingOver, "{count} heading over budget", "{count} heading over budget"),
          h.late && tr.plural(h.late, "{count} late task", "{count} late tasks"),
          tr.plural(h.done, "{count} task finished", "{count} tasks finished"),
        ]
          .filter(Boolean)
          .join(" · "),
      link: `/w/${org.slug}/reports/${start}`,
      dedupeKey: `weekly:${workspaceId}:${start}`,
      email: true,
    });
  }
  return true;
}
