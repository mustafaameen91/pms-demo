import { fail, json, requireMobileWorkspace } from "@/lib/mobile/api";
import { listReports } from "@/lib/data/reports";
import { reportFor } from "@/lib/weekly-report-server";
import { headline } from "@/lib/weekly-report";
import { isWorkspaceAdmin } from "@/lib/permissions";
import { listProjects } from "@/lib/data/projects";

/** GET → the weekly reports with projects I manage (newest first), each with its headline numbers. */
export async function GET(request: Request, ctx: RouteContext<"/api/mobile/v1/w/[slug]/reports">) {
  const authed = await requireMobileWorkspace(request, (await ctx.params).slug);
  if (authed instanceof Response) return authed;
  const { user, workspace, t } = authed;
  const admin = isWorkspaceAdmin(workspace.role);
  if (!admin && !(await listProjects(workspace.id)).some((p) => p.leadId === user.id)) return fail(404, "not_found", t("Not found"));
  const reports = (await listReports(workspace.id))
    .map((r) => ({ start: r.data.start, end: r.data.end, mine: reportFor(r.data, user.id, admin) }))
    .filter((r) => r.mine.length > 0);
  return json({ reports: reports.map((r) => ({ start: r.start, end: r.end, headline: headline(r.mine) })) });
}
