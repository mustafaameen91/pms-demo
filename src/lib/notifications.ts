import "server-only";
import { cache } from "react";
import { and, eq, inArray, isNull, lt, ne } from "drizzle-orm";
import { db } from "@/lib/db";
import { member, notifications, organization, projects, taskStatuses, tasks, user } from "@/lib/db/schema";
import { appUrl, sendEmail } from "@/lib/email";
import { todayISO } from "@/lib/accomplishment";
import { formatDate } from "@/lib/utils";
import { tFor } from "@/i18n/server";
import type { T } from "@/i18n/translate";

/** Text written in each recipient's own language: pass a function of their translator. */
export type LocalText = string | ((t: T) => string);
const render = (text: LocalText, t: T) => (typeof text === "function" ? text(t) : text);

export type NotificationType =
  | "task.assigned"
  | "comment.mentioned"
  | "comment.added"
  | "task.late"
  | "project.over_budget"
  | "expense.approval_requested"
  | "expense.approved"
  | "expense.rejected"
  | "request.received"
  | "automation"
  | "loan"
  | "loan.request"
  | "risk"
  | "time";

type Notify = {
  workspaceId: string;
  userIds: (string | null | undefined)[];
  /** Never notify the person who caused it. */
  actorId?: string | null;
  type: NotificationType;
  title: LocalText;
  body?: LocalText | null;
  link: string;
  /** Same key per user = only one notification, ever. */
  dedupeKey?: string;
  email?: boolean;
};

/** Creates in-app notifications (and optional emails) for workspace members. Returns who got one. */
export async function notify(n: Notify): Promise<string[]> {
  const ids = [...new Set(n.userIds.filter((id): id is string => Boolean(id) && id !== n.actorId))];
  if (ids.length === 0) return [];

  // Only people who are still members of the workspace.
  const recipients = await db
    .select({ id: user.id, email: user.email, name: user.name, locale: user.locale })
    .from(member)
    .innerJoin(user, eq(user.id, member.userId))
    .where(and(eq(member.organizationId, n.workspaceId), inArray(member.userId, ids)));
  if (recipients.length === 0) return [];

  const inserted = await db
    .insert(notifications)
    .values(
      recipients.map((r) => ({
        workspaceId: n.workspaceId,
        userId: r.id,
        actorId: n.actorId ?? null,
        type: n.type,
        title: render(n.title, tFor(r.locale)),
        body: n.body ? render(n.body, tFor(r.locale)) : null,
        link: n.link,
        dedupeKey: n.dedupeKey ?? null,
      })),
    )
    .onConflictDoNothing()
    .returning({ userId: notifications.userId });

  const fresh = new Set(inserted.map((i) => i.userId));
  if (n.email) {
    await Promise.all(
      recipients
        .filter((r) => fresh.has(r.id))
        .map((r) => {
          const t = tFor(r.locale);
          const title = render(n.title, t);
          const body = n.body ? render(n.body, t) : "";
          return sendEmail({
            to: r.email,
            subject: title,
            text: `${t("Hi {name},", { name: r.name })}\n\n${title}${body ? `\n\n${body}` : ""}\n\n${t("Open in PMS:")} ${appUrl(n.link)}`,
          });
        }),
    );
  }
  return [...fresh];
}

/** Owners/admins of a workspace plus the project manager. */
export async function projectManagers(workspaceId: string, leadId: string | null) {
  const admins = await db
    .select({ userId: member.userId })
    .from(member)
    .where(and(eq(member.organizationId, workspaceId), inArray(member.role, ["owner", "admin"])));
  return [...admins.map((a) => a.userId), leadId];
}

/**
 * Creates "task is late" notifications for the user's open, overdue tasks.
 * Called when the app shell loads (there is no background scheduler); the
 * dedupe key makes it run-safe, and a new end date produces a new reminder.
 */
export async function syncLateTaskNotifications(userId: string, workspaceId: string, today: string) {
  const late = await db
    .select({
      id: tasks.id,
      number: tasks.number,
      title: tasks.title,
      dueDate: tasks.dueDate,
      projectKey: projects.key,
      slug: organization.slug,
    })
    .from(tasks)
    .innerJoin(taskStatuses, eq(taskStatuses.id, tasks.statusId))
    .innerJoin(projects, eq(projects.id, tasks.projectId))
    .innerJoin(organization, eq(organization.id, tasks.workspaceId))
    .where(
      and(
        eq(tasks.workspaceId, workspaceId),
        eq(tasks.assigneeId, userId),
        isNull(tasks.deletedAt),
        isNull(projects.archivedAt),
        lt(tasks.dueDate, today),
        ne(taskStatuses.category, "done"),
        ne(taskStatuses.category, "canceled"),
      ),
    );
  if (late.length === 0) return;
  const [me] = await db.select({ locale: user.locale }).from(user).where(eq(user.id, userId));
  const tr = tFor(me?.locale);
  await db
    .insert(notifications)
    .values(
      late.map((t) => ({
        workspaceId,
        userId,
        type: "task.late",
        title: tr("{ref} {title} is late", { ref: `${t.projectKey}-${t.number}`, title: t.title }),
        body: tr("It was due {date}.", { date: formatDate(t.dueDate, tr.intl) }),
        link: `/w/${t.slug}/p/${t.projectKey}?task=${t.projectKey}-${t.number}`,
        dedupeKey: `late:${t.id}:${t.dueDate}`,
      })),
    )
    .onConflictDoNothing();
}

/** Key, slug and manager of a project, for building notification text and links. */
export async function projectContext(projectId: string) {
  const [row] = await db
    .select({
      id: projects.id,
      key: projects.key,
      name: projects.name,
      leadId: projects.leadId,
      budget: projects.budget,
      workspaceId: projects.workspaceId,
      slug: organization.slug,
    })
    .from(projects)
    .innerJoin(organization, eq(organization.id, projects.workspaceId))
    .where(eq(projects.id, projectId))
    .limit(1);
  return row ?? null;
}

/**
 * Runs the late-task check once per request. Layouts and pages render in
 * parallel, so anything that lists notifications must await this first.
 */
export const ensureLateTaskNotifications = cache((userId: string, workspaceId: string) =>
  syncLateTaskNotifications(userId, workspaceId, todayISO()),
);
