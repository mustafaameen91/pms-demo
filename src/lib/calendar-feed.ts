import "server-only";
import { randomBytes } from "node:crypto";
import { and, eq, isNull, ne, or, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import { calendarFeeds, member, organization, projects, taskStatuses, tasks, user } from "@/lib/db/schema";
import { appUrl } from "@/lib/email";
import { visibleProjectIds } from "@/lib/data/project-access";
import { getWorkspaceAccess } from "@/lib/billing";
import { buildCalendar, type CalendarEvent } from "@/lib/ical";
import { tFor } from "@/i18n/server";
import type { WorkspaceRole } from "@/lib/auth/session";

const newToken = () => randomBytes(24).toString("base64url");
export const feedUrl = (token: string) => appUrl(`/api/calendar/${token}.ics`);

/** This person's link for this company (made the first time it's asked for). */
export async function ensureFeed(workspaceId: string, userId: string) {
  const [existing] = await db
    .select({ token: calendarFeeds.token })
    .from(calendarFeeds)
    .where(and(eq(calendarFeeds.workspaceId, workspaceId), eq(calendarFeeds.userId, userId)))
    .limit(1);
  if (existing) return existing.token;
  const [row] = await db
    .insert(calendarFeeds)
    .values({ workspaceId, userId, token: newToken() })
    .onConflictDoUpdate({ target: [calendarFeeds.workspaceId, calendarFeeds.userId], set: { workspaceId } })
    .returning({ token: calendarFeeds.token });
  return row.token;
}

/** A new token; the old link stops working at once. */
export async function resetFeed(workspaceId: string, userId: string) {
  const token = newToken();
  await db
    .insert(calendarFeeds)
    .values({ workspaceId, userId, token })
    .onConflictDoUpdate({ target: [calendarFeeds.workspaceId, calendarFeeds.userId], set: { token, createdAt: new Date(), lastFetchedAt: null } });
  return token;
}

/** The .ics for a token, or null when the link isn't valid (any more). */
export async function calendarFor(token: string) {
  const [feed] = await db
    .select({ id: calendarFeeds.id, workspaceId: calendarFeeds.workspaceId, userId: calendarFeeds.userId, userName: user.name, locale: user.locale, workspaceName: organization.name, slug: organization.slug, role: member.role })
    .from(calendarFeeds)
    .innerJoin(user, eq(user.id, calendarFeeds.userId))
    .innerJoin(organization, eq(organization.id, calendarFeeds.workspaceId))
    // Someone who has left the company gets nothing.
    .innerJoin(member, and(eq(member.organizationId, calendarFeeds.workspaceId), eq(member.userId, calendarFeeds.userId)))
    .where(eq(calendarFeeds.token, token))
    .limit(1);
  if (!feed) return null;
  await db.update(calendarFeeds).set({ lastFetchedAt: new Date() }).where(eq(calendarFeeds.id, feed.id));
  const t = tFor(feed.locale);
  const name = `${feed.workspaceName} — ${feed.userName}`;
  // A locked subscription shows an empty calendar rather than an error.
  if (!(await getWorkspaceAccess(feed.workspaceId)).allowed) return buildCalendar({ name, events: [] });

  const visible = await visibleProjectIds(feed.workspaceId, feed.userId, feed.role as WorkspaceRole);
  const rows = await db
    .select({
      id: tasks.id,
      number: tasks.number,
      title: tasks.title,
      startDate: tasks.startDate,
      dueDate: tasks.dueDate,
      isMilestone: tasks.isMilestone,
      assigneeId: tasks.assigneeId,
      projectKey: projects.key,
      projectName: projects.name,
      statusName: taskStatuses.name,
    })
    .from(tasks)
    .innerJoin(projects, eq(projects.id, tasks.projectId))
    .innerJoin(taskStatuses, eq(taskStatuses.id, tasks.statusId))
    .where(
      and(
        eq(tasks.workspaceId, feed.workspaceId),
        isNull(tasks.deletedAt),
        isNull(projects.archivedAt),
        ne(taskStatuses.category, "done"),
        ne(taskStatuses.category, "canceled"),
        // Your tasks, plus milestones of the projects you can see.
        or(eq(tasks.assigneeId, feed.userId), eq(tasks.isMilestone, true)),
        visible ? (visible.size ? inArray(tasks.projectId, [...visible]) : eq(tasks.id, "")) : undefined,
      ),
    );
  const events: CalendarEvent[] = rows
    .filter((r) => r.dueDate || r.startDate)
    .map((r) => {
      const ref = `${r.projectKey}-${r.number}`;
      const start = r.isMilestone ? (r.dueDate ?? r.startDate)! : (r.startDate ?? r.dueDate)!;
      return {
        uid: `${r.id}@pms`,
        title: r.isMilestone ? `◆ ${ref} ${r.title}` : `${ref} ${r.title}`,
        description: [r.isMilestone ? t("Milestone") : null, `${t("Project")}: ${r.projectName}`, `${t("Status")}: ${r.statusName}`].filter(Boolean).join("\n"),
        url: appUrl(`/w/${feed.slug}/p/${r.projectKey}?task=${ref}`),
        start,
        end: (r.dueDate ?? r.startDate)!,
      };
    });
  return buildCalendar({ name, events });
}
