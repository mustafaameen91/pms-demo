import "server-only";
import { getProjectHealth, type ProjectHealth } from "@/lib/data/project-health";
import { isWorkspaceAdmin } from "@/lib/permissions";
import type { InWorkspace } from "@/lib/mobile/api";
import type { RiskInput } from "@/lib/actions/risks";

/** The active projects this person manages (admins: all of them), most in need of attention first. */
export async function managedHealth(ctx: InWorkspace) {
  const admin = isWorkspaceAdmin(ctx.workspace.role);
  const rows = await getProjectHealth(ctx.workspace, ctx.user.id);
  return rows.filter((r) => !r.finished && (admin || r.p.leadId === ctx.user.id));
}

/** One project's health in the API's shape (same numbers as the website's dashboard). */
export function healthJson(r: ProjectHealth) {
  const f = r.forecast;
  return {
    id: r.p.id,
    key: r.p.key,
    name: r.p.name,
    color: r.p.color,
    currency: r.p.currency,
    endDate: r.p.endDate,
    daysLeft: r.daysLeft,
    overdue: r.overdue,
    actual: r.accomplishment.actual,
    planned: r.accomplishment.planned,
    schedule: r.accomplishment.schedule,
    budget: r.money.budget,
    spent: r.money.actual,
    usedPct: r.money.usedPct,
    overBudget: r.money.overBudget,
    headingOver: r.headingOver,
    pendingApproval: r.money.pendingApproval,
    forecast: f.ready ? { final: f.final, overBy: f.overBy, overPct: f.overPct, health: f.health, early: f.early } : null,
    late: r.late,
    attention: r.attention,
  };
}

/** The fields of a risk from a JSON body (shared with PUT). */
export function riskInput(b: Record<string, unknown>): RiskInput {
  const str = (v: unknown) => (typeof v === "string" ? v : undefined);
  return {
    title: str(b.title) ?? "",
    description: str(b.description),
    category: str(b.category) ?? "",
    likelihood: typeof b.likelihood === "number" ? b.likelihood : Number(b.likelihood),
    impact: typeof b.impact === "number" ? b.impact : Number(b.impact),
    mitigation: str(b.mitigation),
    status: str(b.status) ?? "open",
    ownerId: str(b.ownerId),
    taskId: str(b.taskId),
  };
}
