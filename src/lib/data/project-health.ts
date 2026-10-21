import "server-only";
import type { WorkspaceRole } from "@/lib/auth/session";
import { computeAccomplishment, todayISO } from "@/lib/accomplishment";
import { computeBudget } from "@/lib/budget";
import { computeForecast } from "@/lib/forecast";
import { daysBetween, lateTasks } from "@/lib/schedule";
import { getWorkspaceAccomplishmentTasks, listProjects } from "./projects";
import { getWorkspaceUsages } from "./resources";
import { getWorkspaceExpenses } from "./expenses";
import { getWorkspaceAdvances } from "./loans";
import { visibleProjectIds } from "./project-access";

/**
 * Every project this person can see, with its progress, money, forecast and
 * deadlines worked out — shared by the dashboard and portfolios so they agree.
 * Projects that need attention come first.
 */
export async function getProjectHealth(workspace: { id: string; role: WorkspaceRole }, userId: string) {
  const [projects, tasksByProject, usagesByProject, expensesByProject, advancesByProject] = await Promise.all([
    listProjects(workspace.id, { only: await visibleProjectIds(workspace.id, userId, workspace.role) }),
    getWorkspaceAccomplishmentTasks(workspace.id),
    getWorkspaceUsages(workspace.id),
    getWorkspaceExpenses(workspace.id),
    getWorkspaceAdvances(workspace.id),
  ]);
  const today = todayISO();

  return projects
    .map((p) => {
      const tasks = tasksByProject.get(p.id) ?? [];
      const accomplishment = computeAccomplishment(tasks, p, today);
      const money = computeBudget(p.budget, usagesByProject.get(p.id) ?? [], expensesByProject.get(p.id) ?? [], [], advancesByProject.get(p.id) ?? []);
      const forecast = computeForecast({ budget: money.budget, spent: money.actual, donePct: accomplishment.actual, plannedPct: accomplishment.planned });
      // Not over yet, but on course to be (an early guess doesn't count).
      const headingOver = !money.overBudget && forecast.ready && !forecast.early && (forecast.health === "watch" || forecast.health === "bad");
      const late = lateTasks(tasks, today).length;
      const finished = p.status === "completed" || p.status === "cancelled";
      const daysLeft = p.endDate ? daysBetween(today, p.endDate) : null;
      const overdue = !finished && daysLeft !== null && daysLeft < 0;
      // Higher = needs attention sooner.
      const attention =
        (money.overBudget ? 4 : 0) +
        (accomplishment.schedule === "behind" ? 3 : 0) +
        (headingOver && forecast.ready && forecast.health === "bad" ? 2 : 0) +
        (overdue ? 2 : 0) +
        (late > 0 ? 1 : 0);
      return { p, accomplishment, money, forecast, headingOver, late, daysLeft, overdue, finished, attention };
    })
    .sort(
      (a, b) =>
        Number(a.finished) - Number(b.finished) ||
        b.attention - a.attention ||
        (a.p.endDate ?? "9999").localeCompare(b.p.endDate ?? "9999"),
    );
}
export type ProjectHealth = Awaited<ReturnType<typeof getProjectHealth>>[number];

/** The shape summarizePortfolio needs. */
export const toHealthRow = (r: ProjectHealth) => ({
  currency: r.p.currency,
  finished: r.finished,
  actual: r.accomplishment.actual,
  planned: r.accomplishment.planned,
  behind: r.accomplishment.schedule === "behind",
  overBudget: r.money.overBudget,
  headingOver: r.headingOver,
  budget: r.money.budget,
  spent: r.money.actual,
  forecast: r.forecast,
});
