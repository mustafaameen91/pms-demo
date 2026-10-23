import { requireMobileWorkspace, runAction } from "@/lib/mobile/api";
import { deleteTimeEntry } from "@/lib/actions/timesheets";

/** DELETE → remove one of my entries that isn't approved yet. */
export async function DELETE(request: Request, ctx: RouteContext<"/api/mobile/v1/w/[slug]/hours/[id]">) {
  const { slug, id } = await ctx.params;
  const authed = await requireMobileWorkspace(request, slug);
  if (authed instanceof Response) return authed;
  return runAction(authed.t, () => deleteTimeEntry(id));
}
