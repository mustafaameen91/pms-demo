import "server-only";
import { and, asc, eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import { portfolios, projectRisks, projects } from "@/lib/db/schema";
import { byScore } from "@/lib/risks";

export async function listPortfolios(workspaceId: string) {
  return db
    .select({ id: portfolios.id, name: portfolios.name, description: portfolios.description, color: portfolios.color })
    .from(portfolios)
    .where(eq(portfolios.workspaceId, workspaceId))
    .orderBy(asc(portfolios.name));
}

export async function getPortfolio(workspaceId: string, id: string) {
  const [row] = await db
    .select()
    .from(portfolios)
    .where(and(eq(portfolios.id, id), eq(portfolios.workspaceId, workspaceId)))
    .limit(1);
  return row ?? null;
}

/** Open / watching risks of these projects, highest score first. */
export async function activeRisksOf(projectIds: string[]) {
  if (projectIds.length === 0) return [];
  const rows = await db
    .select({
      id: projectRisks.id,
      number: projectRisks.number,
      title: projectRisks.title,
      likelihood: projectRisks.likelihood,
      impact: projectRisks.impact,
      projectKey: projects.key,
      projectName: projects.name,
    })
    .from(projectRisks)
    .innerJoin(projects, eq(projects.id, projectRisks.projectId))
    .where(and(inArray(projectRisks.projectId, projectIds), inArray(projectRisks.status, ["open", "watching"])));
  return rows.sort(byScore);
}
