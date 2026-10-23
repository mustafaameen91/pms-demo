import { readJson, requireMobileWorkspace, runAction } from "@/lib/mobile/api";
import { requestLoan } from "@/lib/actions/loans";

/** POST { amount, currency, reason } → ask the owners and admins for a loan. */
export async function POST(request: Request, ctx: RouteContext<"/api/mobile/v1/w/[slug]/loans/requests">) {
  const { slug } = await ctx.params;
  const authed = await requireMobileWorkspace(request, slug);
  if (authed instanceof Response) return authed;
  const b = await readJson(request);
  const str = (v: unknown) => (typeof v === "string" ? v : typeof v === "number" ? String(v) : "");
  return runAction(authed.t, () => requestLoan(slug, { amount: str(b.amount), currency: str(b.currency), reason: str(b.reason) }), 201);
}
