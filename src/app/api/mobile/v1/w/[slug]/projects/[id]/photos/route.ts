import { fail, json, mobileProject, requireMobileWorkspace, runAction } from "@/lib/mobile/api";
import { listFiles } from "@/lib/data/files";
import { uploadFiles } from "@/lib/actions/files";

type Ctx = RouteContext<"/api/mobile/v1/w/[slug]/projects/[id]/photos">;

/** GET → the project's photos, newest first (from its file library). */
export async function GET(request: Request, ctx: Ctx) {
  const { slug, id } = await ctx.params;
  const authed = await requireMobileWorkspace(request, slug);
  if (authed instanceof Response) return authed;
  const found = await mobileProject(authed, id);
  if (!found) return fail(404, "not_found", authed.t("Project not found"));
  const files = await listFiles(id);
  return json({
    photos: files
      .filter((f) => f.mime.startsWith("image/"))
      .slice(0, 100)
      .map((f) => ({
        id: f.id,
        name: f.name,
        url: `/api/files/project/${f.versionId}`,
        task: f.taskNumber ? { key: `${found.project.key}-${f.taskNumber}`, title: f.taskTitle } : null,
        uploadedAt: f.uploadedAt,
        uploadedBy: f.uploadedByName,
      })),
  });
}

/** POST multipart { file (one or more), taskId?, note? } → add photos to the project's files. */
export async function POST(request: Request, ctx: Ctx) {
  const { slug, id } = await ctx.params;
  const authed = await requireMobileWorkspace(request, slug);
  if (authed instanceof Response) return authed;
  const form = await request.formData().catch(() => null);
  if (!form) return fail(400, "invalid", authed.t("Choose a file to upload."));
  // Photos only: the file library's "Photos" category.
  const upload = new FormData();
  for (const f of form.getAll("file")) if (f instanceof File && f.type.startsWith("image/")) upload.append("file", f);
  for (const k of ["taskId", "note"] as const) {
    const v = form.get(k);
    if (typeof v === "string") upload.set(k, v);
  }
  upload.set("category", "photo");
  return runAction(authed.t, () => uploadFiles(id, upload), 201);
}
