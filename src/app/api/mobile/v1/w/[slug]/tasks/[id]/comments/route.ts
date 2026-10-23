import { readJson, requireMobileWorkspace, runAction } from "@/lib/mobile/api";
import { addComment } from "@/lib/actions/comments";

/** POST { body } → comment on a task (anyone who can see the project). */
export async function POST(request: Request, ctx: RouteContext<"/api/mobile/v1/w/[slug]/tasks/[id]/comments">) {
  const { slug, id } = await ctx.params;
  const authed = await requireMobileWorkspace(request, slug);
  if (authed instanceof Response) return authed;
  const body = await readJson(request);
  return runAction(authed.t, () => addComment(id, { body: typeof body.body === "string" ? body.body : "", mentions: [] }), 201);
}
