"use server";

import { refresh } from "next/cache";
import { and, eq, inArray, isNull } from "drizzle-orm";
import { z } from "zod";
import { requireWorkspaceById } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { activities, comments, member, tasks, user } from "@/lib/db/schema";
import { notify, projectContext } from "@/lib/notifications";

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
  const parsed = commentSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
  const [task] = await db
    .select()
    .from(tasks)
    .where(and(eq(tasks.id, taskId), isNull(tasks.deletedAt)))
    .limit(1);
  if (!task) return { ok: false, error: "Task not found" };
  const { user: author } = await requireWorkspaceById(task.workspaceId);
  const mentions = await validMentions(task.workspaceId, parsed.data.body, parsed.data.mentions);

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
      title: `${author.name} mentioned you on ${ref}`,
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
      title: `${author.name} commented on ${ref}`,
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
  const parsed = commentSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
  const auth = await authorizeComment(commentId);
  if (!auth) return { ok: false, error: "Comment not found" };
  if (!auth.isAuthor) return { ok: false, error: "You can only edit your own comments." };
  const mentions = await validMentions(auth.comment.workspaceId, parsed.data.body, parsed.data.mentions);
  await db
    .update(comments)
    .set({ body: parsed.data.body, mentions, editedAt: new Date() })
    .where(eq(comments.id, commentId));
  refresh();
  return { ok: true };
}

export async function deleteComment(commentId: string): Promise<Result> {
  const auth = await authorizeComment(commentId);
  if (!auth) return { ok: false, error: "Comment not found" };
  if (!auth.isAuthor && !auth.isAdmin) return { ok: false, error: "You can only delete your own comments." };
  await db.delete(comments).where(eq(comments.id, commentId));
  refresh();
  return { ok: true };
}
