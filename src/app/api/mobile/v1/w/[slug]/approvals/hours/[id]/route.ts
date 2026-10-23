import { readJson, requireMobileWorkspace, runAction } from "@/lib/mobile/api";
import { decideTimeEntry } from "@/lib/actions/timesheets";

/** POST { decision: "approved" | "rejected", note? } → decide (a reason is required to reject). */
export async function POST(request: Request, ctx: RouteContext<"/api/mobile/v1/w/[slug]/approvals/hours/[id]">) {
  const { slug, id } = await ctx.params;
  const authed = await requireMobileWorkspace(request, slug);
  if (authed instanceof Response) return authed;
  const b = await readJson(request);
  const decision = b.decision === "approved" ? "approved" : "rejected";
  const note = typeof b.note === "string" && b.note.trim() ? b.note.trim() : undefined;
  return runAction(authed.t, () => decideTimeEntry(id, { decision, note }));
}
