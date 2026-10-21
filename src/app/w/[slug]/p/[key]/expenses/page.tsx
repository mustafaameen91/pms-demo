import { getVisibleProjectByKey } from "@/lib/data/project-access";
import { notFound } from "next/navigation";
import { requireWorkspace } from "@/lib/auth/session";
import { getAccomplishmentTasks, getBoard } from "@/lib/data/projects";
import { getProjectResources } from "@/lib/data/resources";
import { getProjectExpenses } from "@/lib/data/expenses";
import { computeBudget } from "@/lib/budget";
import { canManageProject, isWorkspaceAdmin } from "@/lib/permissions";
import { listLoans } from "@/lib/data/loans";
import { computeAccomplishment } from "@/lib/accomplishment";
import { computeForecast } from "@/lib/forecast";
import { ExpensesView } from "@/components/expenses/expenses-view";
import { getT } from "@/i18n/server";

export async function generateMetadata({ params }: PageProps<"/w/[slug]/p/[key]/expenses">) {
  const [{ key }, t] = await Promise.all([params, getT()]);
  return { title: t("Expenses · {key}", { key: key.toUpperCase() }) };
}

export default async function ExpensesPage({ params, searchParams }: PageProps<"/w/[slug]/p/[key]/expenses">) {
  const [{ slug, key }, query] = await Promise.all([params, searchParams]);
  const { user, workspace } = await requireWorkspace(slug);
  const project = await getVisibleProjectByKey(workspace, user.id, key);
  if (!project) notFound();

  const [board, usages, expenseRows, advances, accomplishmentTasks] = await Promise.all([
    getBoard(project.id),
    getProjectResources(project.id),
    getProjectExpenses(project.id),
    listLoans(workspace.id, { projectId: project.id }),
    getAccomplishmentTasks(project.id),
  ]);
  const summary = computeBudget(project.budget, usages, expenseRows, board.tasks, advances);
  const a = computeAccomplishment(accomplishmentTasks, project);
  const forecast = computeForecast({ budget: summary.budget, spent: summary.actual, donePct: a.actual, plannedPct: a.planned });
  const canManage = canManageProject(workspace.role, user.id, project);
  const isAdmin = isWorkspaceAdmin(workspace.role);
  // Admins can file receipts on any advance (e.g. for a worker); members on their own.
  const advanceOptions = advances.map((a) => ({
    id: a.id,
    borrowerName: a.borrowerName,
    open: a.open,
    settled: a.paidOff,
    usable: !a.paidOff && (isAdmin || a.borrowerUserId === user.id),
  }));
  const advance = typeof query.advance === "string" ? advanceOptions.find((a) => a.id === query.advance && a.usable)?.id : undefined;

  return (
    <div className="w-full px-4 py-6 sm:px-6">
      <ExpensesView
        project={{
          id: project.id,
          key: project.key,
          currency: project.currency,
          slug: workspace.slug,
          approvalThreshold: project.approvalThreshold,
          isApprover: canManage,
          isAdmin,
        }}
        advances={advanceOptions}
        startWithAdvance={advance}
        summary={summary}
        forecast={forecast}
        tasks={board.tasks.map((t) => ({ id: t.id, number: t.number, title: t.title }))}
        usages={usages.map((u) => ({ id: u.id, name: u.name, role: u.role, type: u.type, taskId: u.taskId }))}
        expenses={expenseRows.map(({ hasReceipt, createdById, ...e }) => ({
          ...e,
          hasReceipt: Boolean(hasReceipt),
          // Members can edit their own expenses; managers and admins can edit all.
          canEdit: canManage || createdById === user.id,
        }))}
      />
    </div>
  );
}
