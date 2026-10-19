import { notFound } from "next/navigation";
import { requireWorkspace } from "@/lib/auth/session";
import { getBoard, getProjectByKey } from "@/lib/data/projects";
import { getProjectResources } from "@/lib/data/resources";
import { getProjectExpenses } from "@/lib/data/expenses";
import { computeBudget } from "@/lib/budget";
import { canManageProject } from "@/lib/permissions";
import { ExpensesView } from "@/components/expenses/expenses-view";
import { getT } from "@/i18n/server";

export async function generateMetadata({ params }: PageProps<"/w/[slug]/p/[key]/expenses">) {
  const [{ key }, t] = await Promise.all([params, getT()]);
  return { title: t("Expenses · {key}", { key: key.toUpperCase() }) };
}

export default async function ExpensesPage({ params }: PageProps<"/w/[slug]/p/[key]/expenses">) {
  const { slug, key } = await params;
  const { user, workspace } = await requireWorkspace(slug);
  const project = await getProjectByKey(workspace.id, key);
  if (!project) notFound();

  const [board, usages, expenseRows] = await Promise.all([
    getBoard(project.id),
    getProjectResources(project.id),
    getProjectExpenses(project.id),
  ]);
  const summary = computeBudget(project.budget, usages, expenseRows, board.tasks);
  const canManage = canManageProject(workspace.role, user.id, project);

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6">
      <ExpensesView
        project={{
          id: project.id,
          key: project.key,
          currency: project.currency,
          slug: workspace.slug,
          approvalThreshold: project.approvalThreshold,
          isApprover: canManage,
        }}
        summary={summary}
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
