import { fail, json, requireMobileWorkspace } from "@/lib/mobile/api";
import { healthJson, managedHealth } from "@/lib/mobile/manage";
import { getAccomplishmentTasks } from "@/lib/data/projects";
import { listRisks } from "@/lib/data/risks";
import { lateTasks, upcomingTasks } from "@/lib/schedule";
import { riskLevel, riskScore } from "@/lib/risks";
import { todayISO } from "@/lib/accomplishment";

/** GET → one managed project: its health, late and upcoming tasks, and the top open risks. */
export async function GET(request: Request, ctx: RouteContext<"/api/mobile/v1/w/[slug]/health/[id]">) {
  const { slug, id } = await ctx.params;
  const authed = await requireMobileWorkspace(request, slug);
  if (authed instanceof Response) return authed;
  const row = (await managedHealth(authed)).find((r) => r.p.id === id);
  if (!row) return fail(404, "not_found", authed.t("Project not found"));
  const today = todayISO();
  const [tasks, risks] = await Promise.all([getAccomplishmentTasks(id), listRisks(id, { activeOnly: true })]);
  const task = (t: (typeof tasks)[number]) => ({
    id: t.id,
    key: `${row.p.key}-${t.number}`,
    title: t.title,
    dueDate: t.dueDate,
    progress: t.progress,
    status: { name: t.statusName, color: t.statusColor, category: t.category },
  });
  return json({
    project: healthJson(row),
    late: lateTasks(tasks, today).sort((a, b) => a.dueDate!.localeCompare(b.dueDate!)).map(task),
    upcoming: upcomingTasks(tasks, today, 14).slice(0, 10).map(task),
    risks: risks.slice(0, 5).map((r) => {
      const score = riskScore(r.likelihood, r.impact);
      return { id: r.id, key: `R-${r.number}`, title: r.title, score, level: riskLevel(score), owner: r.ownerName };
    }),
  });
}
