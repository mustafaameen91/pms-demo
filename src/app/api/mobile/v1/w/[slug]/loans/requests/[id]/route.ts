import { requireMobileWorkspace, runAction } from "@/lib/mobile/api";
import { cancelLoanRequest } from "@/lib/actions/loans";

/** DELETE → withdraw my request while it hasn't been answered. */
export async function DELETE(request: Request, ctx: RouteContext<"/api/mobile/v1/w/[slug]/loans/requests/[id]">) {
  const { slug, id } = await ctx.params;
  const authed = await requireMobileWorkspace(request, slug);
  if (authed instanceof Response) return authed;
  return runAction(authed.t, () => cancelLoanRequest(id));
}
