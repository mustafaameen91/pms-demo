"use server";

import { refresh } from "next/cache";
import { and, eq, isNull } from "drizzle-orm";
import { requireWorkspace } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { notifications } from "@/lib/db/schema";

export async function markAllNotificationsRead(slug: string) {
  const { user, workspace } = await requireWorkspace(slug);
  await db
    .update(notifications)
    .set({ readAt: new Date() })
    .where(
      and(eq(notifications.userId, user.id), eq(notifications.workspaceId, workspace.id), isNull(notifications.readAt)),
    );
  refresh();
}
