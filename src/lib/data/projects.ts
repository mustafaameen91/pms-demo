import "server-only";
import { cache } from "react";
import { and, asc, eq, isNotNull, isNull, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { member, projects, taskDependencies, taskStatuses, tasks, user } from "@/lib/db/schema";
import { alias } from "drizzle-orm/pg-core";

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
    })
    .from(projects)
    .where(
      and(
        eq(projects.workspaceId, workspaceId),
        archived ? isNotNull(projects.archivedAt) : isNull(projects.archivedAt),
      ),
    )
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
        startDate: tasks.startDate,
        dueDate: tasks.dueDate,
        weight: tasks.weight,
        progress: tasks.progress,
        budget: tasks.budget,
        position: tasks.position,
        assigneeId: tasks.assigneeId,
        assigneeName: user.name,
        assigneeImage: user.image,
        isMilestone: tasks.isMilestone,
        recurrence: tasks.recurrence,
        customFields: tasks.customFields,
        // Predecessors that aren't finished yet ("Blocked" when > 0).
        blockedBy: sql<number>`(
          select count(*) from ${taskDependencies} d
          join ${tasks} p on p.id = d.depends_on_id
          join ${taskStatuses} ps on ps.id = p.status_id
          where d.task_id = ${tasks.id} and p.deleted_at is null
            and ps.category not in ('done', 'canceled')
        )`.mapWith(Number),
        subtaskCount: sql<number>`(
          select count(*) from ${tasks} s
          where s.parent_id = ${tasks.id} and s.deleted_at is null
        )`.mapWith(Number),
        subtaskDone: sql<number>`(
          select count(*) from ${tasks} s
          join ${taskStatuses} st on st.id = s.status_id
          where s.parent_id = ${tasks.id} and s.deleted_at is null
            and st.category in ('done', 'canceled')
        )`.mapWith(Number),
      })
      .from(tasks)
      .leftJoin(user, eq(user.id, tasks.assigneeId))
      .where(and(eq(tasks.projectId, projectId), isNull(tasks.parentId), isNull(tasks.deletedAt)))
      .orderBy(asc(tasks.position)),
  ]);
  return { statuses, tasks: rows };
}

export type BoardData = Awaited<ReturnType<typeof getBoard>>;
export type BoardTask = BoardData["tasks"][number];
export type BoardStatus = BoardData["statuses"][number];

export async function getTaskDetail(projectId: string, number: number) {
  const task = await db.query.tasks.findFirst({
    where: and(eq(tasks.projectId, projectId), eq(tasks.number, number), isNull(tasks.deletedAt)),
    with: {
      reporter: { columns: { id: true, name: true } },
      comments: {
        orderBy: (c, { asc }) => [asc(c.createdAt)],
        with: { author: { columns: { id: true, name: true, image: true } } },
      },
      parent: { columns: { id: true, number: true, title: true, deletedAt: true } },
      subtasks: {
        where: (sub, { isNull }) => isNull(sub.deletedAt),
        orderBy: (sub, { asc }) => [asc(sub.number)],
        columns: { id: true, number: true, title: true, statusId: true, assigneeId: true },
        with: { status: { columns: { category: true } } },
      },
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

const accomplishmentColumns = {
  id: tasks.id,
  projectId: tasks.projectId,
  number: tasks.number,
  title: tasks.title,
  weight: tasks.weight,
  progress: tasks.progress,
  startDate: tasks.startDate,
  dueDate: tasks.dueDate,
  statusName: taskStatuses.name,
  statusColor: taskStatuses.color,
  category: taskStatuses.category,
  isMilestone: tasks.isMilestone,
};

/** Main (non-deleted) tasks of a project, with what the accomplishment calculation needs. */
export const getAccomplishmentTasks = cache(async (projectId: string) => {
  const rows = await db
    .select(accomplishmentColumns)
    .from(tasks)
    .innerJoin(taskStatuses, eq(taskStatuses.id, tasks.statusId))
    .where(and(eq(tasks.projectId, projectId), isNull(tasks.parentId), isNull(tasks.deletedAt)))
    .orderBy(asc(taskStatuses.position), asc(tasks.position));
  return rows.map((r) => ({ ...r, cancelled: r.category === "canceled" }));
});

export type AccomplishmentRow = Awaited<ReturnType<typeof getAccomplishmentTasks>>[number];

/** Same as above for every project in a workspace, grouped by project id. */
export async function getWorkspaceAccomplishmentTasks(workspaceId: string) {
  const rows = await db
    .select(accomplishmentColumns)
    .from(tasks)
    .innerJoin(taskStatuses, eq(taskStatuses.id, tasks.statusId))
    .where(and(eq(tasks.workspaceId, workspaceId), isNull(tasks.parentId), isNull(tasks.deletedAt)));
  const byProject = new Map<string, AccomplishmentRow[]>();
  for (const r of rows) {
    const row = { ...r, cancelled: r.category === "canceled" };
    byProject.set(r.projectId, [...(byProject.get(r.projectId) ?? []), row]);
  }
  return byProject;
}

/** Dependency edges between live tasks of a project (for the timeline). */
export async function getDependencies(projectId: string) {
  const pred = alias(tasks, "pred");
  return db
    .select({ taskId: taskDependencies.taskId, dependsOnId: taskDependencies.dependsOnId })
    .from(taskDependencies)
    .innerJoin(tasks, and(eq(tasks.id, taskDependencies.taskId), isNull(tasks.deletedAt)))
    .innerJoin(pred, and(eq(pred.id, taskDependencies.dependsOnId), isNull(pred.deletedAt)))
    .where(eq(taskDependencies.projectId, projectId));
}

/** What a task waits on and what waits on it. */
export async function getTaskLinks(taskId: string) {
  const other = alias(tasks, "other");
  const cols = {
    id: other.id,
    number: other.number,
    title: other.title,
    startDate: other.startDate,
    dueDate: other.dueDate,
    statusName: taskStatuses.name,
    category: taskStatuses.category,
  };
  const [predecessors, successors] = await Promise.all([
    db
      .select(cols)
      .from(taskDependencies)
      .innerJoin(other, and(eq(other.id, taskDependencies.dependsOnId), isNull(other.deletedAt)))
      .innerJoin(taskStatuses, eq(taskStatuses.id, other.statusId))
      .where(eq(taskDependencies.taskId, taskId))
      .orderBy(asc(other.number)),
    db
      .select(cols)
      .from(taskDependencies)
      .innerJoin(other, and(eq(other.id, taskDependencies.taskId), isNull(other.deletedAt)))
      .innerJoin(taskStatuses, eq(taskStatuses.id, other.statusId))
      .where(eq(taskDependencies.dependsOnId, taskId))
      .orderBy(asc(other.number)),
  ]);
  return { predecessors, successors };
}

export type TaskLinks = Awaited<ReturnType<typeof getTaskLinks>>;
