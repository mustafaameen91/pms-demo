import { json, requireMobileWorkspace } from "@/lib/mobile/api";
import { listMyTasks } from "@/lib/data/my-tasks";
import { visibleProjectIds } from "@/lib/data/project-access";
import { dueGroup } from "@/lib/my-tasks-groups";
import { todayISO } from "@/lib/accomplishment";

/** GET → my open tasks in this company (main tasks and sub-tasks), soonest due first. */
export async function GET(request: Request, ctx: RouteContext<"/api/mobile/v1/w/[slug]/tasks">) {
  const authed = await requireMobileWorkspace(request, (await ctx.params).slug);
  if (authed instanceof Response) return authed;
  const { user, workspace } = authed;
  const today = todayISO();
  const rows = await listMyTasks(workspace.id, user.id, await visibleProjectIds(workspace.id, user.id, workspace.role));
  const open = rows.filter((r) => dueGroup(r, today) !== "done");
  return json({
    today,
    done: rows.length - open.length,
    tasks: open.map((r) => ({
      id: r.id,
      key: `${r.projectKey}-${r.number}`,
      title: r.title,
      priority: r.priority,
      startDate: r.startDate,
      dueDate: r.dueDate,
      progress: r.progress,
      isMilestone: r.isMilestone,
      isSubtask: r.parentId !== null,
      group: dueGroup(r, today),
      status: { name: r.statusName, color: r.statusColor, category: r.category },
      project: { key: r.projectKey, name: r.projectName, color: r.projectColor },
    })),
  });
}
