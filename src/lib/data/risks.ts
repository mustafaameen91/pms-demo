import "server-only";
import { and, desc, eq, inArray } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { db } from "@/lib/db";
import { projectRisks, tasks, user } from "@/lib/db/schema";
import { byScore } from "@/lib/risks";

const creator = alias(user, "creator");

/** A project's risks, highest score first (closed ones last). Caller authorizes. */
export async function listRisks(projectId: string, { activeOnly = false } = {}) {
  const rows = await db
    .select({
      id: projectRisks.id,
      number: projectRisks.number,
      title: projectRisks.title,
      description: projectRisks.description,
      category: projectRisks.category,
      likelihood: projectRisks.likelihood,
      impact: projectRisks.impact,
      mitigation: projectRisks.mitigation,
      status: projectRisks.status,
      ownerId: projectRisks.ownerId,
      ownerName: user.name,
      taskId: projectRisks.taskId,
      taskNumber: tasks.number,
      taskTitle: tasks.title,
      createdById: projectRisks.createdById,
      createdByName: creator.name,
      closedAt: projectRisks.closedAt,
      updatedAt: projectRisks.updatedAt,
    })
    .from(projectRisks)
    .leftJoin(user, eq(user.id, projectRisks.ownerId))
    .leftJoin(creator, eq(creator.id, projectRisks.createdById))
    .leftJoin(tasks, eq(tasks.id, projectRisks.taskId))
    .where(
      and(
        eq(projectRisks.projectId, projectId),
        activeOnly ? inArray(projectRisks.status, ["open", "watching"]) : undefined,
      ),
    )
    .orderBy(desc(projectRisks.updatedAt));
  const active = rows.filter((r) => r.status !== "closed").sort(byScore);
  const closed = rows.filter((r) => r.status === "closed");
  return [...active, ...closed];
}
export type RiskRow = Awaited<ReturnType<typeof listRisks>>[number];
