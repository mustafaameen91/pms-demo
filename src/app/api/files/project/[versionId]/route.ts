import { and, eq } from "drizzle-orm";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { member, projectFileVersions, projectFiles, projects } from "@/lib/db/schema";
import { readStoredFile } from "@/lib/uploads";
import { INLINE_TYPES } from "@/lib/file-types";
import { getWorkspaceAccess } from "@/lib/billing";
import { canViewProject } from "@/lib/data/project-access";
import type { WorkspaceRole } from "@/lib/auth/session";
import { getT } from "@/i18n/server";

// A project file version, only for people who can see the project.
// PDFs and images open in the browser (?download=1 forces a download); everything else downloads.
export async function GET(request: Request, ctx: RouteContext<"/api/files/project/[versionId]">) {
  const { versionId } = await ctx.params;
  const t = await getT();
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return new Response(t("Unauthorized"), { status: 401 });

  const [row] = await db
    .select({ v: projectFileVersions, projectId: projectFiles.projectId, name: projectFiles.name, role: member.role })
    .from(projectFileVersions)
    .innerJoin(projectFiles, eq(projectFiles.id, projectFileVersions.fileId))
    .innerJoin(member, and(eq(member.organizationId, projectFileVersions.workspaceId), eq(member.userId, session.user.id)))
    .where(eq(projectFileVersions.id, versionId))
    .limit(1);
  if (!row) return new Response(t("Not found"), { status: 404 });
  const [project] = await db.select({ id: projects.id, leadId: projects.leadId }).from(projects).where(eq(projects.id, row.projectId));
  if (!project || !(await canViewProject(row.role as WorkspaceRole, session.user.id, project))) return new Response(t("Not found"), { status: 404 });
  if (!(await getWorkspaceAccess(row.v.workspaceId)).allowed) return new Response(t("This workspace's subscription isn't active."), { status: 402 });

  const file = await readStoredFile(row.v.path).catch(() => null);
  if (!file) return new Response(t("Not found"), { status: 404 });
  const inline = INLINE_TYPES.has(row.v.mime) && new URL(request.url).searchParams.get("download") !== "1";
  // Arabic names need the UTF-8 form; the plain one is a fallback for old clients.
  const ascii = row.v.originalName.replace(/[^\x20-\x7e]/g, "_").replace(/["\\]/g, "");
  return new Response(new Uint8Array(file), {
    headers: {
      "Content-Type": row.v.mime,
      "Content-Length": String(file.length),
      "Content-Disposition": `${inline ? "inline" : "attachment"}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(row.v.originalName)}`,
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "private, no-store",
      ...(row.v.mime.startsWith("image/") && { "Content-Security-Policy": "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; sandbox" }),
    },
  });
}
