import "server-only";
import { and, desc, eq, like, lt, or, type SQL } from "drizzle-orm";
import { db } from "@/lib/db";
import { activities, projects, tasks, user } from "@/lib/db/schema";
import { GROUP_PREFIXES, type ActivityGroup } from "@/lib/activity-text";

export async function listAuditEntries(
  workspaceId: string,
  { group, actorId, before, limit = 100 }: { group?: ActivityGroup; actorId?: string; before?: Date; limit?: number },
) {
  const filters: (SQL | undefined)[] = [
    eq(activities.workspaceId, workspaceId),
    group ? or(...GROUP_PREFIXES[group].map((p) => like(activities.type, `${p}%`))) : undefined,
    actorId ? eq(activities.actorId, actorId) : undefined,
    before ? lt(activities.createdAt, before) : undefined,
  ];
  return db
    .select({
      id: activities.id,
      type: activities.type,
      data: activities.data,
      createdAt: activities.createdAt,
      actorName: user.name,
      projectName: projects.name,
      projectKey: projects.key,
      taskNumber: tasks.number,
    })
    .from(activities)
    .leftJoin(user, eq(user.id, activities.actorId))
    .leftJoin(projects, eq(projects.id, activities.projectId))
    .leftJoin(tasks, eq(tasks.id, activities.taskId))
    .where(and(...filters))
    .orderBy(desc(activities.createdAt))
    .limit(limit);
}
