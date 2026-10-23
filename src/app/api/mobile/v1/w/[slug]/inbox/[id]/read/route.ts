import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/lib/db";
import { notifications } from "@/lib/db/schema";
import { json, requireMobileWorkspace } from "@/lib/mobile/api";

/** POST → mark one of my notifications read (when it's opened in the app). */
export async function POST(request: Request, ctx: RouteContext<"/api/mobile/v1/w/[slug]/inbox/[id]/read">) {
  const { slug, id } = await ctx.params;
  const authed = await requireMobileWorkspace(request, slug);
  if (authed instanceof Response) return authed;
  await db
    .update(notifications)
    .set({ readAt: new Date() })
    .where(and(eq(notifications.id, id), eq(notifications.userId, authed.user.id), eq(notifications.workspaceId, authed.workspace.id), isNull(notifications.readAt)));
  return json({ ok: true });
}
