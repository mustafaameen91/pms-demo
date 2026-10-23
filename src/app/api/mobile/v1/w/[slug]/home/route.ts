import { and, count, eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import { projects, timeEntries } from "@/lib/db/schema";
import { json, requireMobileWorkspace } from "@/lib/mobile/api";
import { listMyTasks } from "@/lib/data/my-tasks";
import { visibleProjectIds } from "@/lib/data/project-access";
import { unreadCount } from "@/lib/data/notifications";
import { listPendingApprovals } from "@/lib/data/expenses";
import { pendingLoanRequestCount } from "@/lib/data/loans";
import { getProjectHealth } from "@/lib/data/project-health";
import { dueGroup } from "@/lib/my-tasks-groups";
import { isWorkspaceAdmin } from "@/lib/permissions";
import { todayISO } from "@/lib/accomplishment";

/**
 * GET → the home screen for this company. Everyone gets their own tasks;
 * owners, admins and project managers also get the projects they manage and
 * what is waiting for their approval.
 */
export async function GET(request: Request, ctx: RouteContext<"/api/mobile/v1/w/[slug]/home">) {
  const { slug } = await ctx.params;
  const authed = await requireMobileWorkspace(request, slug);
  if (authed instanceof Response) return authed;
  const { user, workspace } = authed;
  const admin = isWorkspaceAdmin(workspace.role);
  const today = todayISO();

  const visible = await visibleProjectIds(workspace.id, user.id, workspace.role);
  const [tasks, unread, led] = await Promise.all([
    listMyTasks(workspace.id, user.id, visible),
    unreadCount(user.id, workspace.id),
    db.select({ id: projects.id }).from(projects).where(and(eq(projects.workspaceId, workspace.id), eq(projects.leadId, user.id))),
  ]);
  const myTasks = { overdue: 0, today: 0, week: 0, later: 0, none: 0 };
  for (const task of tasks) {
    const g = dueGroup(task, today);
    if (g !== "done") myTasks[g] += 1;
  }
  const manager = admin || led.length > 0;

  let manage = null;
  if (manager) {
    const managed = new Set(led.map((p) => p.id));
    const health = (await getProjectHealth(workspace, user.id)).filter((r) => !r.finished && (admin || managed.has(r.p.id)));
    const ids = health.map((r) => r.p.id);
    const [expenses, [hours], loans] = await Promise.all([
      listPendingApprovals(workspace.id, user.id, admin),
      ids.length
        ? db.select({ n: count() }).from(timeEntries).where(and(inArray(timeEntries.projectId, ids), eq(timeEntries.status, "pending")))
        : [{ n: 0 }],
      admin ? pendingLoanRequestCount(workspace.id) : 0,
    ]);
    manage = {
      projects: health.length,
      behind: health.filter((r) => r.accomplishment.schedule === "behind").length,
      overBudget: health.filter((r) => r.money.overBudget).length,
      headingOver: health.filter((r) => r.headingOver).length,
      lateTasks: health.reduce((s, r) => s + r.late, 0),
      approvals: {
        expenses: expenses.filter((e) => e.requesterId !== user.id).length,
        hours: hours?.n ?? 0,
        loans,
      },
    };
  }

  return json({
    workspace: { slug: workspace.slug, name: workspace.name, role: workspace.role },
    view: manager ? "manager" : "member",
    today,
    unread,
    myTasks,
    manage,
  });
}
