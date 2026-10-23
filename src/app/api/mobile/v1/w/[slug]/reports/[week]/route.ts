import { fail, json, requireMobileWorkspace } from "@/lib/mobile/api";
import { getReport } from "@/lib/data/reports";
import { reportFor } from "@/lib/weekly-report-server";
import { headline } from "@/lib/weekly-report";
import { isWorkspaceAdmin } from "@/lib/permissions";

/** GET → one week's report, only the projects I manage (admins: all). */
export async function GET(request: Request, ctx: RouteContext<"/api/mobile/v1/w/[slug]/reports/[week]">) {
  const { slug, week } = await ctx.params;
  const authed = await requireMobileWorkspace(request, slug);
  if (authed instanceof Response) return authed;
  const data = await getReport(authed.workspace.id, week);
  const mine = data ? reportFor(data, authed.user.id, isWorkspaceAdmin(authed.workspace.role)) : [];
  if (!data || mine.length === 0) return fail(404, "not_found", authed.t("Not found"));
  return json({ start: data.start, end: data.end, headline: headline(mine), projects: mine });
}
