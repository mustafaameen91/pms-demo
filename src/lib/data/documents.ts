import "server-only";
import { and, desc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { documents, projects, user } from "@/lib/db/schema";

/** A project's documents, newest first. Caller authorizes. */
export async function listDocuments(projectId: string) {
  return db
    .select({
      id: documents.id,
      type: documents.type,
      number: documents.number,
      status: documents.status,
      language: documents.language,
      date: documents.date,
      data: documents.data,
      layout: documents.layout,
      updatedAt: documents.updatedAt,
      createdByName: user.name,
    })
    .from(documents)
    .leftJoin(user, eq(user.id, documents.createdById))
    .where(eq(documents.projectId, projectId))
    .orderBy(desc(documents.createdAt));
}
export type DocumentRow = Awaited<ReturnType<typeof listDocuments>>[number];

/** One document with its project's name and key. Caller authorizes. */
export async function getDocument(workspaceId: string, id: string) {
  const [row] = await db
    .select({ doc: documents, projectName: projects.name, projectKey: projects.key, projectLeadId: projects.leadId })
    .from(documents)
    .innerJoin(projects, eq(projects.id, documents.projectId))
    .where(and(eq(documents.id, id), eq(documents.workspaceId, workspaceId)))
    .limit(1);
  return row ?? null;
}
