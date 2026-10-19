import "server-only";
import { asc, count, desc, eq, max } from "drizzle-orm";
import { db } from "@/lib/db";
import { automationRules, automationRuns, tasks } from "@/lib/db/schema";

/** Rules of a project with how often they ran (caller must have authorized the workspace). */
export async function getProjectAutomations(projectId: string) {
  return db
    .select({
      id: automationRules.id,
      trigger: automationRules.trigger,
      action: automationRules.action,
      enabled: automationRules.enabled,
      createdAt: automationRules.createdAt,
      runs: count(automationRuns.id),
      lastRunAt: max(automationRuns.createdAt),
    })
    .from(automationRules)
    .leftJoin(automationRuns, eq(automationRuns.ruleId, automationRules.id))
    .where(eq(automationRules.projectId, projectId))
    .groupBy(automationRules.id)
    .orderBy(asc(automationRules.createdAt));
}

/** Most recent runs of a project's rules, newest first. */
export async function getAutomationRuns(projectId: string, limit = 50) {
  return db
    .select({
      id: automationRuns.id,
      ruleId: automationRuns.ruleId,
      status: automationRuns.status,
      message: automationRuns.message,
      createdAt: automationRuns.createdAt,
      taskNumber: tasks.number,
    })
    .from(automationRuns)
    .leftJoin(tasks, eq(tasks.id, automationRuns.taskId))
    .where(eq(automationRuns.projectId, projectId))
    .orderBy(desc(automationRuns.createdAt))
    .limit(limit);
}
