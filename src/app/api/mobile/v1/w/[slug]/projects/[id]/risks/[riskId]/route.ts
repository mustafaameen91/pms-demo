import { readJson, requireMobileWorkspace, runAction } from "@/lib/mobile/api";
import { saveRisk } from "@/lib/actions/risks";
import { riskInput } from "@/lib/mobile/manage";

/** PUT (same fields as POST) → update a risk (manager, admins, its owner or whoever raised it). */
export async function PUT(request: Request, ctx: RouteContext<"/api/mobile/v1/w/[slug]/projects/[id]/risks/[riskId]">) {
  const { slug, id, riskId } = await ctx.params;
  const authed = await requireMobileWorkspace(request, slug);
  if (authed instanceof Response) return authed;
  const input = riskInput(await readJson(request));
  return runAction(authed.t, () => saveRisk(id, riskId, input));
}
