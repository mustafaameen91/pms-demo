import "server-only";
import { and, asc, eq, isNotNull, isNull, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { projectResources, projects, resources, tasks } from "@/lib/db/schema";
import type { ResourceType } from "@/lib/constants";

// All functions take an already-authorized workspaceId / projectId.

export async function listResources(
  workspaceId: string,
  { type, archived = false }: { type?: ResourceType; archived?: boolean } = {},
) {
  return db
    .select({
      id: resources.id,
      type: resources.type,
      name: resources.name,
      unit: resources.unit,
      unitCost: resources.unitCost,
      currency: resources.currency,
      role: resources.role,
      phone: resources.phone,
      notes: resources.notes,
      archivedAt: resources.archivedAt,
      // Number of (non-archived) projects using it. The outer column is written out in full:
      // without a join Drizzle emits a bare "id", which is ambiguous inside the subquery.
      projectCount: sql<number>`(
        select count(distinct pr.project_id) from ${projectResources} pr
        join ${projects} p on p.id = pr.project_id
        where pr.resource_id = "resources"."id" and p.archived_at is null
      )`.mapWith(Number),
    })
    .from(resources)
    .where(
      and(
        eq(resources.workspaceId, workspaceId),
        type ? eq(resources.type, type) : undefined,
        archived ? isNotNull(resources.archivedAt) : isNull(resources.archivedAt),
      ),
    )
    .orderBy(asc(resources.type), asc(resources.name));
}

export type LibraryResource = Awaited<ReturnType<typeof listResources>>[number];

export async function getProjectResources(projectId: string) {
  return db
    .select({
      id: projectResources.id,
      resourceId: resources.id,
      type: resources.type,
      name: resources.name,
      role: resources.role,
      unit: resources.unit,
      plannedQty: projectResources.plannedQty,
      usedQty: projectResources.usedQty,
      unitCost: projectResources.unitCost,
      notes: projectResources.notes,
      taskId: projectResources.taskId,
      taskNumber: tasks.number,
      taskTitle: tasks.title,
    })
    .from(projectResources)
    .innerJoin(resources, eq(resources.id, projectResources.resourceId))
    // Deleted (soft) tasks are hidden, as everywhere else.
    .leftJoin(tasks, and(eq(tasks.id, projectResources.taskId), isNull(tasks.deletedAt)))
    .where(eq(projectResources.projectId, projectId))
    .orderBy(asc(resources.type), asc(resources.name));
}

export type ProjectResource = Awaited<ReturnType<typeof getProjectResources>>[number];
