import "server-only";
import { computeAccomplishment, todayISO } from "@/lib/accomplishment";
import { computeBudget } from "@/lib/budget";
import { lateTasks } from "@/lib/schedule";
import { getBoard, getProjectByKey, type Project } from "./projects";
import { getProjectResources } from "./resources";
import { getProjectExpenses } from "./expenses";
import { getProjectAdvances } from "./loans";
import { listRisks } from "./risks";
import { getProjectFields } from "./custom-fields";

/** Everything a project report (Excel or PDF) shows. Caller must authorize the workspace. */
export async function getProjectReport(workspaceId: string, key: string) {
  const project = await getProjectByKey(workspaceId, key);
  if (!project) return null;
  return buildReport(project);
}

async function buildReport(project: Project) {
  const [board, usages, expenses, fields, advances, risks] = await Promise.all([
    getBoard(project.id),
    getProjectResources(project.id),
    getProjectExpenses(project.id),
    getProjectFields(project.id),
    getProjectAdvances(project.workspaceId, project.id),
    listRisks(project.id),
  ]);
  const today = todayISO();
  const statusById = new Map(board.statuses.map((s) => [s.id, s]));
  const tasks = board.tasks.map((t) => {
    const status = statusById.get(t.statusId);
    return {
      ...t,
      statusName: status?.name ?? "",
      category: status?.category ?? "todo",
      cancelled: status?.category === "canceled",
    };
  });
  const accomplishment = computeAccomplishment(tasks, project, today);
  const budget = computeBudget(project.budget, usages, expenses, tasks, advances);
  const spentByTask = new Map(budget.tasks.map((t) => [t.taskId, t.actual]));

  return {
    project,
    today,
    tasks: tasks.map((t) => ({ ...t, spent: spentByTask.get(t.id) ?? 0 })),
    late: lateTasks(tasks, today),
    usages,
    expenses,
    fields,
    risks,
    accomplishment,
    budget,
  };
}

export type ProjectReport = NonNullable<Awaited<ReturnType<typeof getProjectReport>>>;
