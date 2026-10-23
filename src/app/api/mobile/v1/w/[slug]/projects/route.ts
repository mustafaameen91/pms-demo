import { and, asc, eq, isNull } from "drizzle-orm";
import { db } from "@/lib/db";
import { projects } from "@/lib/db/schema";
import { json, requireMobileWorkspace } from "@/lib/mobile/api";
import { visibleProjectIds } from "@/lib/data/project-access";
import { canManageProject } from "@/lib/permissions";

/** GET → the active projects I can see (for logging hours, the site log, photos and expenses). */
export async function GET(request: Request, ctx: RouteContext<"/api/mobile/v1/w/[slug]/projects">) {
  const authed = await requireMobileWorkspace(request, (await ctx.params).slug);
  if (authed instanceof Response) return authed;
  const { user, workspace } = authed;
  const visible = await visibleProjectIds(workspace.id, user.id, workspace.role);
  const rows = await db
    .select()
    .from(projects)
    .where(and(eq(projects.workspaceId, workspace.id), isNull(projects.archivedAt)))
    .orderBy(asc(projects.name));
  return json({
    projects: rows
      .filter((p) => !visible || visible.has(p.id))
      .map((p) => ({ id: p.id, key: p.key, name: p.name, color: p.color, currency: p.currency, manager: canManageProject(workspace.role, user.id, p) })),
  });
}
