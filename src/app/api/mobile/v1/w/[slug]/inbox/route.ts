import { appTarget, json, requireMobileWorkspace } from "@/lib/mobile/api";
import { listNotifications, unreadCount } from "@/lib/data/notifications";

/** GET → my latest notifications in this company (newest first). */
export async function GET(request: Request, ctx: RouteContext<"/api/mobile/v1/w/[slug]/inbox">) {
  const authed = await requireMobileWorkspace(request, (await ctx.params).slug);
  if (authed instanceof Response) return authed;
  const { user, workspace } = authed;
  const [rows, unread] = await Promise.all([listNotifications(user.id, workspace.id), unreadCount(user.id, workspace.id)]);
  return json({
    unread,
    items: rows.map((n) => ({
      id: n.id,
      type: n.type,
      title: n.title,
      body: n.body,
      read: n.readAt !== null,
      createdAt: n.createdAt,
      actor: n.actorName ? { name: n.actorName, image: n.actorImage } : null,
      // What the app opens when it's tapped (null: only on the website for now).
      open: appTarget(n.link),
    })),
  });
}
