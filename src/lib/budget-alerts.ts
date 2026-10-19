import "server-only";
import { computeBudget } from "@/lib/budget";
import { todayISO } from "@/lib/accomplishment";
import { getProjectResources } from "@/lib/data/resources";
import { getProjectExpenses } from "@/lib/data/expenses";
import { formatMoney } from "@/lib/utils";
import { db } from "@/lib/db";
import { projects } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { notify, projectContext, projectManagers } from "@/lib/notifications";

/** After money changes: if the project is now over budget, tell its managers (once a day). */
export async function checkOverBudget(projectId: string, actorId: string) {
  const ctx = await projectContext(projectId);
  if (!ctx?.budget) return;
  const [[project], usages, expenses] = await Promise.all([
    db.select({ currency: projects.currency }).from(projects).where(eq(projects.id, projectId)).limit(1),
    getProjectResources(projectId),
    getProjectExpenses(projectId),
  ]);
  const summary = computeBudget(ctx.budget, usages, expenses);
  if (!summary.overBudget) return;
  await notify({
    workspaceId: ctx.workspaceId,
    userIds: await projectManagers(ctx.workspaceId, ctx.leadId),
    // The person who made the change still sees the red banner; others get told.
    actorId,
    type: "project.over_budget",
    // Each manager reads it in their own language.
    title: (t) => t("{name} is over budget", { name: ctx.name }),
    body: (t) =>
      t("Spent {spent} of {budget}.", {
        spent: formatMoney(summary.actual, project.currency, t.intl),
        budget: formatMoney(summary.budget ?? 0, project.currency, t.intl),
      }),
    link: `/w/${ctx.slug}/p/${ctx.key}/expenses`,
    dedupeKey: `over_budget:${projectId}:${todayISO()}`,
    email: true,
  });
}
