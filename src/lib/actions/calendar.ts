"use server";

import { requireWorkspace } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { activities } from "@/lib/db/schema";
import { ensureFeed, feedUrl, resetFeed } from "@/lib/calendar-feed";

/** Your private calendar link for this company. */
export async function getCalendarLink(slug: string) {
  const { user, workspace } = await requireWorkspace(slug);
  return { url: feedUrl(await ensureFeed(workspace.id, user.id)) };
}

/** Replaces your link (e.g. it was shared by mistake); the old one stops working. */
export async function resetCalendarLink(slug: string) {
  const { user, workspace } = await requireWorkspace(slug);
  const token = await resetFeed(workspace.id, user.id);
  await db.insert(activities).values({ workspaceId: workspace.id, actorId: user.id, type: "calendar.reset", data: {} });
  return { url: feedUrl(token) };
}
