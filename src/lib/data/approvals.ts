import "server-only";
import { and, asc, eq, inArray, isNull } from "drizzle-orm";
import { db } from "@/lib/db";
import { projects, tasks, timeEntries, user } from "@/lib/db/schema";

/** Team members' hours waiting for approval in these projects, oldest first. Caller authorizes. */
export async function listPendingHours(projectIds: string[]) {
  if (projectIds.length === 0) return [];
  return db
    .select({
      id: timeEntries.id,
      date: timeEntries.date,
      quantity: timeEntries.quantity,
      note: timeEntries.note,
      createdAt: timeEntries.createdAt,
      userId: timeEntries.userId,
      userName: user.name,
      projectId: projects.id,
      projectKey: projects.key,
      projectName: projects.name,
      taskNumber: tasks.number,
      taskTitle: tasks.title,
    })
    .from(timeEntries)
    .innerJoin(projects, eq(projects.id, timeEntries.projectId))
    .leftJoin(user, eq(user.id, timeEntries.userId))
    .leftJoin(tasks, and(eq(tasks.id, timeEntries.taskId), isNull(tasks.deletedAt)))
    .where(and(inArray(timeEntries.projectId, projectIds), eq(timeEntries.status, "pending")))
    .orderBy(asc(timeEntries.date), asc(timeEntries.createdAt));
}
