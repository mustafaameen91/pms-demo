import "server-only";
import { and, asc, eq, isNull } from "drizzle-orm";
import { db } from "@/lib/db";
import { projects, taskStatuses, tasks } from "@/lib/db/schema";

/** Main tasks and sub-tasks assigned to a user, across the workspace's active projects. */
export async function listMyTasks(workspaceId: string, userId: string) {
  return db
    .select({
      id: tasks.id,
      number: tasks.number,
      title: tasks.title,
      priority: tasks.priority,
      startDate: tasks.startDate,
      dueDate: tasks.dueDate,
      progress: tasks.progress,
      isMilestone: tasks.isMilestone,
      parentId: tasks.parentId,
      statusName: taskStatuses.name,
      statusColor: taskStatuses.color,
      category: taskStatuses.category,
      projectKey: projects.key,
      projectName: projects.name,
      projectColor: projects.color,
    })
    .from(tasks)
    .innerJoin(taskStatuses, eq(taskStatuses.id, tasks.statusId))
    .innerJoin(projects, eq(projects.id, tasks.projectId))
    .where(
      and(
        eq(tasks.workspaceId, workspaceId),
        eq(tasks.assigneeId, userId),
        isNull(tasks.deletedAt),
        isNull(projects.archivedAt),
      ),
    )
    .orderBy(asc(tasks.dueDate), asc(projects.name), asc(tasks.number));
}

export type MyTask = Awaited<ReturnType<typeof listMyTasks>>[number];
