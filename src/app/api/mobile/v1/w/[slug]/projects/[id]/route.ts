import { and, asc, eq, isNull, notInArray } from "drizzle-orm";
import { db } from "@/lib/db";
import { taskStatuses, tasks } from "@/lib/db/schema";
import { fail, json, mobileProject, requireMobileWorkspace } from "@/lib/mobile/api";

/** GET → one project with its open tasks (to pick from when logging hours, photos or an expense). */
export async function GET(request: Request, ctx: RouteContext<"/api/mobile/v1/w/[slug]/projects/[id]">) {
  const { slug, id } = await ctx.params;
  const authed = await requireMobileWorkspace(request, slug);
  if (authed instanceof Response) return authed;
  const found = await mobileProject(authed, id);
  if (!found) return fail(404, "not_found", authed.t("Project not found"));
  const { project, manager } = found;
  const open = await db
    .select({ id: tasks.id, number: tasks.number, title: tasks.title, parentId: tasks.parentId, assigneeId: tasks.assigneeId })
    .from(tasks)
    .innerJoin(taskStatuses, eq(taskStatuses.id, tasks.statusId))
    .where(and(eq(tasks.projectId, project.id), isNull(tasks.deletedAt), notInArray(taskStatuses.category, ["done", "canceled"])))
    .orderBy(asc(tasks.number));
  return json({
    project: { id: project.id, key: project.key, name: project.name, color: project.color, currency: project.currency, manager },
    tasks: open.map((t) => ({ id: t.id, key: `${project.key}-${t.number}`, title: t.title, isSubtask: t.parentId !== null, mine: t.assigneeId === authed.user.id })),
  });
}
