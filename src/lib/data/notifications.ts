import "server-only";
import { and, count, desc, eq, isNull } from "drizzle-orm";
import { db } from "@/lib/db";
import { notifications, user } from "@/lib/db/schema";

export async function listNotifications(userId: string, workspaceId: string) {
  return db
    .select({
      id: notifications.id,
      type: notifications.type,
      title: notifications.title,
      body: notifications.body,
      link: notifications.link,
      readAt: notifications.readAt,
      createdAt: notifications.createdAt,
      actorName: user.name,
      actorImage: user.image,
    })
    .from(notifications)
    .leftJoin(user, eq(user.id, notifications.actorId))
    .where(and(eq(notifications.userId, userId), eq(notifications.workspaceId, workspaceId)))
    .orderBy(desc(notifications.createdAt))
    .limit(100);
}

export async function unreadCount(userId: string, workspaceId: string) {
  const [row] = await db
    .select({ n: count() })
    .from(notifications)
    .where(
      and(eq(notifications.userId, userId), eq(notifications.workspaceId, workspaceId), isNull(notifications.readAt)),
    );
  return row?.n ?? 0;
}
