"use server";

import { refresh } from "next/cache";
import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { requireWorkspaceById, type WorkspaceRole } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { activities, comments, member, user } from "@/lib/db/schema";
import { notify, projectContext } from "@/lib/notifications";
import { getT } from "@/i18n/server";
import { authorizeTask } from "@/lib/task-access";
import { canViewProject } from "@/lib/data/project-access";

type Result = { ok: true } | { ok: false; error: string };

const commentSchema = z.object({
  body: z.string().trim().min(1, "Write something first").max(5000),
  mentions: z.array(z.string()).max(50).default([]),
});

/** Keeps only mentioned users who are members and whose "@Name" is still in the text. */
async function validMentions(workspaceId: string, body: string, ids: string[]) {
  if (ids.length === 0) return [];
  const rows = await db
    .select({ id: user.id, name: user.name })
    .from(member)
    .innerJoin(user, eq(user.id, member.userId))
    .where(and(eq(member.organizationId, workspaceId), inArray(member.userId, ids)));
  return rows.filter((r) => body.includes(`@${r.name}`)).map((r) => r.id);
}

export async function addComment(taskId: string, input: z.input<typeof commentSchema>): Promise<Result> {
  const t = await getT();
  const parsed = commentSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: t(parsed.error.issues[0].message) };
  // Anyone who can see the project may comment, even on tasks they can't change.
  const auth = await authorizeTask(taskId);
  if (!auth) return { ok: false, error: t("Task not found") };
  const { task, user: author, project } = auth;
  // Only people who can see this project can be mentioned (they'd get a link they can't open otherwise).
  const mentions: string[] = [];
  for (const id of await validMentions(task.workspaceId, parsed.data.body, parsed.data.mentions)) {
    const [m] = await db
      .select({ role: member.role })
      .from(member)
      .where(and(eq(member.organizationId, task.workspaceId), eq(member.userId, id)))
      .limit(1);
    if (m && (await canViewProject(m.role as WorkspaceRole, id, project))) mentions.push(id);
  }

  await db.transaction(async (tx) => {
    await tx.insert(comments).values({
      workspaceId: task.workspaceId,
      taskId,
      authorId: author.id,
      body: parsed.data.body,
      mentions,
    });
    await tx.insert(activities).values({
      workspaceId: task.workspaceId,
      projectId: task.projectId,
      taskId,
      actorId: author.id,
      type: "comment.added",
      data: {},
    });
  });

  const ctx = await projectContext(task.projectId);
  if (ctx) {
    const ref = `${ctx.key}-${task.number} ${task.title}`;
    const link = `/w/${ctx.slug}/p/${ctx.key}?task=${ctx.key}-${task.number}`;
    const excerpt = parsed.data.body.length > 200 ? `${parsed.data.body.slice(0, 200)}…` : parsed.data.body;
    await notify({
      workspaceId: task.workspaceId,
      userIds: mentions,
      actorId: author.id,
      type: "comment.mentioned",
      title: (tr) => tr("{name} mentioned you on {ref}", { name: author.name, ref }),
      body: excerpt,
      link,
      email: true,
    });
    // Assignee and reporter hear about other comments (unless already mentioned).
    await notify({
      workspaceId: task.workspaceId,
      userIds: [task.assigneeId, task.reporterId].filter((id) => id && !mentions.includes(id)),
      actorId: author.id,
      type: "comment.added",
      title: (tr) => tr("{name} commented on {ref}", { name: author.name, ref }),
      body: excerpt,
      link,
    });
  }

  refresh();
  return { ok: true };
}

async function authorizeComment(commentId: string) {
  const [comment] = await db.select().from(comments).where(eq(comments.id, commentId)).limit(1);
  if (!comment) return null;
  const auth = await requireWorkspaceById(comment.workspaceId);
  const isAdmin = auth.role === "owner" || auth.role === "admin";
  return { comment, ...auth, isAuthor: comment.authorId === auth.user.id, isAdmin };
}

export async function editComment(commentId: string, input: z.input<typeof commentSchema>): Promise<Result> {
  const t = await getT();
  const parsed = commentSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: t(parsed.error.issues[0].message) };
  const auth = await authorizeComment(commentId);
  if (!auth) return { ok: false, error: t("Comment not found") };
  if (!auth.isAuthor) return { ok: false, error: t("You can only edit your own comments.") };
  const mentions = await validMentions(auth.comment.workspaceId, parsed.data.body, parsed.data.mentions);
  await db
    .update(comments)
    .set({ body: parsed.data.body, mentions, editedAt: new Date() })
    .where(eq(comments.id, commentId));
  refresh();
  return { ok: true };
}

export async function deleteComment(commentId: string): Promise<Result> {
  const t = await getT();
  const auth = await authorizeComment(commentId);
  if (!auth) return { ok: false, error: t("Comment not found") };
  if (!auth.isAuthor && !auth.isAdmin) return { ok: false, error: t("You can only delete your own comments.") };
  await db.delete(comments).where(eq(comments.id, commentId));
  refresh();
  return { ok: true };
}
