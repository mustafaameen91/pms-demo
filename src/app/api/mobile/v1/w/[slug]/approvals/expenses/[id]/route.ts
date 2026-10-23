import { readJson, requireMobileWorkspace, runAction } from "@/lib/mobile/api";
import { decideExpense } from "@/lib/actions/expenses";

/** POST { decision: "approved" | "rejected", note? } → decide (a reason is required to reject). */
export async function POST(request: Request, ctx: RouteContext<"/api/mobile/v1/w/[slug]/approvals/expenses/[id]">) {
  const { slug, id } = await ctx.params;
  const authed = await requireMobileWorkspace(request, slug);
  if (authed instanceof Response) return authed;
  const b = await readJson(request);
  const decision = b.decision === "approved" ? "approved" : "rejected";
  const note = typeof b.note === "string" && b.note.trim() ? b.note.trim() : undefined;
  return runAction(authed.t, () => decideExpense(id, { decision, note }));
}
