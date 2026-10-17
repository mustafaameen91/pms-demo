import "server-only";
import { cache } from "react";
import { and, asc, count, eq, isNotNull, isNull, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { member, projects, taskStatuses, tasks, user } from "@/lib/db/schema";

// All functions take an already-authorized workspaceId (see requireWorkspace).

export async function listProjects(workspaceId: string, { archived = false } = {}) {
  return db
    .select({
      id: projects.id,
      name: projects.name,
      key: projects.key,
      color: projects.color,
      description: projects.description,
      status: projects.status,
      client: projects.client,
      startDate: projects.startDate,
      endDate: projects.endDate,
      budget: projects.budget,
      currency: projects.currency,
      createdAt: projects.createdAt,
      taskCount: count(tasks.id),
      openCount: sql<number>`count(${tasks.id}) filter (where ${tasks.completedAt} is null)`.mapWith(
        Number,
      ),
    })
    .from(projects)
    .leftJoin(tasks, and(eq(tasks.projectId, projects.id), isNull(tasks.parentId)))
    .where(
      and(
        eq(projects.workspaceId, workspaceId),
        archived ? isNotNull(projects.archivedAt) : isNull(projects.archivedAt),
      ),
    )
    .groupBy(projects.id)
    .orderBy(asc(projects.name));
}

// Deduplicated per request: the project layout and page both call it.
export const getProjectByKey = cache(async (workspaceId: string, key: string) => {
  const [row] = await db
    .select({ project: projects, leadName: user.name })
    .from(projects)
    .leftJoin(user, eq(user.id, projects.leadId))
    .where(and(eq(projects.workspaceId, workspaceId), eq(projects.key, key.toUpperCase())))
    .limit(1);
  return row ? { ...row.project, leadName: row.leadName } : null;
});

export type Project = NonNullable<Awaited<ReturnType<typeof getProjectByKey>>>;

export async function getBoard(projectId: string) {
  const [statuses, rows] = await Promise.all([
    db
      .select()
      .from(taskStatuses)
      .where(eq(taskStatuses.projectId, projectId))
      .orderBy(asc(taskStatuses.position)),
    db
      .select({
        id: tasks.id,
        number: tasks.number,
        title: tasks.title,
        statusId: tasks.statusId,
        priority: tasks.priority,
        dueDate: tasks.dueDate,
        position: tasks.position,
        assigneeId: tasks.assigneeId,
        assigneeName: user.name,
        assigneeImage: user.image,
      })
      .from(tasks)
      .leftJoin(user, eq(user.id, tasks.assigneeId))
      .where(and(eq(tasks.projectId, projectId), isNull(tasks.parentId)))
      .orderBy(asc(tasks.position)),
  ]);
  return { statuses, tasks: rows };
}

export type BoardData = Awaited<ReturnType<typeof getBoard>>;
export type BoardTask = BoardData["tasks"][number];
export type BoardStatus = BoardData["statuses"][number];

export async function getTaskDetail(projectId: string, number: number) {
  const task = await db.query.tasks.findFirst({
    where: and(eq(tasks.projectId, projectId), eq(tasks.number, number)),
    with: {
      reporter: { columns: { id: true, name: true } },
      activities: {
        orderBy: (a, { desc }) => [desc(a.createdAt)],
        limit: 30,
        with: { actor: { columns: { id: true, name: true } } },
      },
    },
  });
  return task ?? null;
}

export type TaskDetail = NonNullable<Awaited<ReturnType<typeof getTaskDetail>>>;

export async function listMembers(workspaceId: string) {
  return db
    .select({ id: user.id, name: user.name, email: user.email, image: user.image, role: member.role })
    .from(member)
    .innerJoin(user, eq(user.id, member.userId))
    .where(eq(member.organizationId, workspaceId))
    .orderBy(asc(user.name));
}

export type WorkspaceMember = Awaited<ReturnType<typeof listMembers>>[number];
