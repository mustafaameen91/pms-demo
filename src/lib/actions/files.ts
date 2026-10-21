"use server";

import { refresh } from "next/cache";
import { and, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import { requireWorkspaceById } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { activities, projectFileVersions, projectFiles, projects, tasks } from "@/lib/db/schema";
import { canManageProject } from "@/lib/permissions";
import { canViewProject } from "@/lib/data/project-access";
import { listVersions } from "@/lib/data/files";
import { FILE_CATEGORIES, guessCategory, isFileCategory, nameWithoutExtension } from "@/lib/files";
import { deleteStoredFile, saveProjectFile } from "@/lib/uploads";
import { getT } from "@/i18n/server";

type Result<T = undefined> = { ok: true; data?: T } | { ok: false; error: string; fieldErrors?: Record<string, string> };

const MAX_FILES_AT_ONCE = 20;

/** Anyone on the project team works with its files. */
async function loadProject(projectId: string) {
  const [project] = await db.select().from(projects).where(eq(projects.id, projectId)).limit(1);
  if (!project) return null;
  const auth = await requireWorkspaceById(project.workspaceId);
  if (!(await canViewProject(auth.role, auth.user.id, project))) return null;
  return { project, ...auth, manager: canManageProject(auth.role, auth.user.id, project) };
}

async function loadFile(fileId: string) {
  const [file] = await db.select().from(projectFiles).where(eq(projectFiles.id, fileId)).limit(1);
  if (!file) return null;
  const auth = await loadProject(file.projectId);
  return auth ? { file, ...auth } : null;
}

async function taskInProject(taskId: string | null, projectId: string) {
  if (!taskId) return true;
  const [task] = await db
    .select({ id: tasks.id })
    .from(tasks)
    .where(and(eq(tasks.id, taskId), eq(tasks.projectId, projectId), isNull(tasks.deletedAt)))
    .limit(1);
  return Boolean(task);
}

const optionalId = (v: FormDataEntryValue | null) => (typeof v === "string" && v ? v : null);
const optionalText = (v: FormDataEntryValue | null, max: number) => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null);

/**
 * Upload one or more files to a project. Each becomes its own file (version 1).
 * Category "auto" (or none) is guessed from the file.
 */
export async function uploadFiles(projectId: string, formData: FormData): Promise<Result<{ count: number }>> {
  const t = await getT();
  const auth = await loadProject(projectId);
  if (!auth) return { ok: false, error: t("Project not found") };
  const { project, user } = auth;
  const files = formData.getAll("file").filter((f): f is File => f instanceof File && f.size > 0);
  if (files.length === 0) return { ok: false, error: t("Choose a file to upload."), fieldErrors: { file: t("Choose a file to upload.") } };
  if (files.length > MAX_FILES_AT_ONCE) return { ok: false, error: t("Upload at most {count} files at once.", { count: MAX_FILES_AT_ONCE }) };
  const category = formData.get("category");
  const taskId = optionalId(formData.get("taskId"));
  const note = optionalText(formData.get("note"), 500);
  if (!(await taskInProject(taskId, projectId))) return { ok: false, error: t("Task not found") };

  // Store everything first, so one bad file doesn't leave half an upload behind.
  const saved: Awaited<ReturnType<typeof saveProjectFile>>[] = [];
  for (const f of files) {
    const s = await saveProjectFile(project.workspaceId, f, t);
    if ("error" in s) {
      for (const done of saved) if ("path" in done) await deleteStoredFile(done.path);
      const msg = `${f.name}: ${s.error}`;
      return { ok: false, error: msg, fieldErrors: { file: msg } };
    }
    saved.push(s);
  }
  try {
    await db.transaction(async (tx) => {
      for (const s of saved) {
        if (!("path" in s)) continue;
        const [file] = await tx
          .insert(projectFiles)
          .values({
            workspaceId: project.workspaceId,
            projectId,
            taskId,
            name: nameWithoutExtension(s.name),
            category: isFileCategory(category) ? category : guessCategory(s.mime, s.name),
            createdById: user.id,
          })
          .returning({ id: projectFiles.id });
        await tx.insert(projectFileVersions).values({
          workspaceId: project.workspaceId,
          fileId: file.id,
          version: 1,
          path: s.path,
          originalName: s.name,
          mime: s.mime,
          size: s.size,
          note,
          uploadedById: user.id,
        });
        await tx.insert(activities).values({ workspaceId: project.workspaceId, projectId, taskId, actorId: user.id, type: "file.uploaded", data: { name: s.name } });
      }
    });
  } catch (error) {
    for (const s of saved) if ("path" in s) await deleteStoredFile(s.path);
    throw error;
  }
  refresh();
  return { ok: true, data: { count: saved.length } };
}

/** A newer version of a file (e.g. drawing revision B). The older ones are kept. */
export async function uploadVersion(fileId: string, formData: FormData): Promise<Result<{ version: number }>> {
  const t = await getT();
  const auth = await loadFile(fileId);
  if (!auth) return { ok: false, error: t("File not found") };
  const { file, project, user } = auth;
  const upload = formData.get("file");
  if (!(upload instanceof File) || upload.size === 0) return { ok: false, error: t("Choose a file to upload."), fieldErrors: { file: t("Choose a file to upload.") } };
  const saved = await saveProjectFile(project.workspaceId, upload, t);
  if ("error" in saved) return { ok: false, error: saved.error, fieldErrors: { file: saved.error } };
  const note = optionalText(formData.get("note"), 500);
  let version = 0;
  try {
    await db.transaction(async (tx) => {
      // Lock the file so two uploads at once don't get the same number.
      const [row] = await tx.select({ current: projectFiles.currentVersion }).from(projectFiles).where(eq(projectFiles.id, fileId)).for("update");
      version = row.current + 1;
      await tx.insert(projectFileVersions).values({
        workspaceId: file.workspaceId,
        fileId,
        version,
        path: saved.path,
        originalName: saved.name,
        mime: saved.mime,
        size: saved.size,
        note,
        uploadedById: user.id,
      });
      await tx.update(projectFiles).set({ currentVersion: version, updatedAt: new Date() }).where(eq(projectFiles.id, fileId));
      await tx.insert(activities).values({
        workspaceId: file.workspaceId,
        projectId: file.projectId,
        taskId: file.taskId,
        actorId: user.id,
        type: "file.version",
        data: { name: file.name, version },
      });
    });
  } catch (error) {
    await deleteStoredFile(saved.path);
    throw error;
  }
  refresh();
  return { ok: true, data: { version } };
}

const editSchema = z.object({
  name: z.string().trim().min(1, "Give the file a name").max(200),
  category: z.enum(FILE_CATEGORIES.map((c) => c.value) as [string, ...string[]]),
  taskId: z.string().optional().transform((v) => v || null),
  description: z.string().trim().max(1000).optional().transform((v) => v || null),
});

/** Rename, re-file under another category or task. The project manager, admins or whoever added it. */
export async function updateFile(fileId: string, input: z.input<typeof editSchema>): Promise<Result> {
  const t = await getT();
  const auth = await loadFile(fileId);
  if (!auth) return { ok: false, error: t("File not found") };
  if (!auth.manager && auth.file.createdById !== auth.user.id) return { ok: false, error: t("Only the project manager, admins or the person who added it can change this file.") };
  const parsed = editSchema.safeParse(input);
  if (!parsed.success) {
    const msg = t(parsed.error.issues[0].message);
    return { ok: false, error: msg, fieldErrors: { [String(parsed.error.issues[0].path[0])]: msg } };
  }
  if (!(await taskInProject(parsed.data.taskId, auth.file.projectId))) return { ok: false, error: t("Task not found") };
  await db.update(projectFiles).set({ ...parsed.data, updatedAt: new Date() }).where(eq(projectFiles.id, fileId));
  refresh();
  return { ok: true };
}

/** Removes a file and all its versions from the server. */
export async function deleteFile(fileId: string): Promise<Result> {
  const t = await getT();
  const auth = await loadFile(fileId);
  if (!auth) return { ok: false, error: t("File not found") };
  const { file, user, manager } = auth;
  if (!manager && file.createdById !== user.id) return { ok: false, error: t("Only the project manager, admins or the person who added it can delete this file.") };
  const versions = await db.select({ path: projectFileVersions.path }).from(projectFileVersions).where(eq(projectFileVersions.fileId, fileId));
  await db.transaction(async (tx) => {
    await tx.delete(projectFiles).where(eq(projectFiles.id, fileId));
    await tx.insert(activities).values({
      workspaceId: file.workspaceId,
      projectId: file.projectId,
      actorId: user.id,
      type: "file.deleted",
      data: { name: file.name, versions: versions.length },
    });
  });
  for (const v of versions) await deleteStoredFile(v.path);
  refresh();
  return { ok: true };
}

/** A file's version history, for the history dialog. */
export async function fileHistory(fileId: string) {
  const auth = await loadFile(fileId);
  if (!auth) return [];
  return (await listVersions(fileId)).map((v) => ({ ...v, createdAt: v.createdAt.toISOString() }));
}
