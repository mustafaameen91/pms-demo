import "server-only";
import { and, desc, eq } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { db } from "@/lib/db";
import { projectFileVersions, projectFiles, tasks, user } from "@/lib/db/schema";

const uploader = alias(user, "uploader");

/** A project's files with their current version, newest change first. Caller authorizes. */
export async function listFiles(projectId: string) {
  return db
    .select({
      id: projectFiles.id,
      name: projectFiles.name,
      category: projectFiles.category,
      description: projectFiles.description,
      taskId: projectFiles.taskId,
      taskNumber: tasks.number,
      taskTitle: tasks.title,
      currentVersion: projectFiles.currentVersion,
      createdById: projectFiles.createdById,
      updatedAt: projectFiles.updatedAt,
      versionId: projectFileVersions.id,
      originalName: projectFileVersions.originalName,
      mime: projectFileVersions.mime,
      size: projectFileVersions.size,
      uploadedAt: projectFileVersions.createdAt,
      uploadedByName: uploader.name,
    })
    .from(projectFiles)
    .innerJoin(projectFileVersions, and(eq(projectFileVersions.fileId, projectFiles.id), eq(projectFileVersions.version, projectFiles.currentVersion)))
    .leftJoin(tasks, eq(tasks.id, projectFiles.taskId))
    .leftJoin(uploader, eq(uploader.id, projectFileVersions.uploadedById))
    .where(eq(projectFiles.projectId, projectId))
    .orderBy(desc(projectFiles.updatedAt));
}
export type FileRow = Awaited<ReturnType<typeof listFiles>>[number];

/** Every version of a file, newest first. Caller authorizes. */
export async function listVersions(fileId: string) {
  return db
    .select({
      id: projectFileVersions.id,
      version: projectFileVersions.version,
      originalName: projectFileVersions.originalName,
      mime: projectFileVersions.mime,
      size: projectFileVersions.size,
      note: projectFileVersions.note,
      createdAt: projectFileVersions.createdAt,
      uploadedByName: user.name,
    })
    .from(projectFileVersions)
    .leftJoin(user, eq(user.id, projectFileVersions.uploadedById))
    .where(eq(projectFileVersions.fileId, fileId))
    .orderBy(desc(projectFileVersions.version));
}
