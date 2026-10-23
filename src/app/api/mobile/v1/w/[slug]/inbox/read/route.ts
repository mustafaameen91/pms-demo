import { requireMobileWorkspace, runAction } from "@/lib/mobile/api";
import { markAllNotificationsRead } from "@/lib/actions/notifications";

/** POST → mark everything in my inbox read. */
export async function POST(request: Request, ctx: RouteContext<"/api/mobile/v1/w/[slug]/inbox/read">) {
  const { slug } = await ctx.params;
  const authed = await requireMobileWorkspace(request, slug);
  if (authed instanceof Response) return authed;
  return runAction(authed.t, () => markAllNotificationsRead(slug));
}
