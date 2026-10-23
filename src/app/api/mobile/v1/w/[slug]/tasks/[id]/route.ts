import { and, asc, eq, isNull } from "drizzle-orm";
import { db } from "@/lib/db";
import { projects, taskStatuses, tasks, user as users } from "@/lib/db/schema";
import { fail, json, readJson, requireMobileWorkspace, runAction, type InWorkspace } from "@/lib/mobile/api";
import { authorizeTask } from "@/lib/task-access";
import { getTaskDetail } from "@/lib/data/projects";
import { listFiles } from "@/lib/data/files";
import { updateTask } from "@/lib/actions/tasks";

type Ctx = RouteContext<"/api/mobile/v1/w/[slug]/tasks/[id]">;

/** The task by id, or by its key ("CLIN-3", as in notification links), within this company. */
async function findTaskId(ws: InWorkspace, idOrKey: string) {
  const m = idOrKey.match(/^([A-Z0-9]+)-(\d+)$/i);
  if (!m) return idOrKey;
  const [row] = await db
    .select({ id: tasks.id })
    .from(tasks)
    .innerJoin(projects, eq(projects.id, tasks.projectId))
    .where(and(eq(projects.workspaceId, ws.workspace.id), eq(projects.key, m[1].toUpperCase()), eq(tasks.number, Number(m[2])), isNull(tasks.deletedAt)))
    .limit(1);
  return row?.id ?? null;
}

async function load(request: Request, ctx: Ctx) {
  const { slug, id } = await ctx.params;
  const authed = await requireMobileWorkspace(request, slug);
  if (authed instanceof Response) return authed;
  const taskId = await findTaskId(authed, id);
  const access = taskId ? await authorizeTask(taskId) : null;
  if (!access || access.task.workspaceId !== authed.workspace.id) return fail(404, "not_found", authed.t("Task not found"));
  return { authed, access };
}

/** GET → one task: details, what I may change, statuses to move it to, sub-tasks, comments and photos. */
export async function GET(request: Request, ctx: Ctx) {
  const loaded = await load(request, ctx);
  if (loaded instanceof Response) return loaded;
  const { authed, access } = loaded;
  const { task, project, edits, blockers } = access;
  const [detail, statuses, files, [assignee]] = await Promise.all([
    getTaskDetail(project.id, task.number),
    db
      .select({ id: taskStatuses.id, name: taskStatuses.name, color: taskStatuses.color, category: taskStatuses.category })
      .from(taskStatuses)
      .where(eq(taskStatuses.projectId, project.id))
      .orderBy(asc(taskStatuses.position)),
    listFiles(project.id),
    task.assigneeId ? db.select({ id: users.id, name: users.name }).from(users).where(eq(users.id, task.assigneeId)).limit(1) : [],
  ]);
  if (!detail) return fail(404, "not_found", authed.t("Task not found"));
  const key = (n: number) => `${project.key}-${n}`;
  return json({
    task: {
      id: task.id,
      key: key(task.number),
      title: task.title,
      description: task.description,
      priority: task.priority,
      startDate: task.startDate,
      dueDate: task.dueDate,
      progress: task.progress,
      isMilestone: task.isMilestone,
      statusId: task.statusId,
      assignee: assignee ?? null,
      parent: detail.parent && !detail.parent.deletedAt ? { key: key(detail.parent.number), title: detail.parent.title } : null,
    },
    project: { id: project.id, key: project.key, name: project.name, color: project.color, currency: project.currency },
    statuses,
    // The server decides; the app only hides what isn't allowed.
    can: { status: edits.has("status"), progress: edits.has("progress"), comment: true },
    blockedBy: blockers.map((b) => ({ key: key(b.number), title: b.title })),
    subtasks: detail.subtasks.map((s) => ({
      id: s.id,
      key: key(s.number),
      title: s.title,
      done: s.status?.category === "done" || s.status?.category === "canceled",
    })),
    comments: detail.comments.map((c) => ({
      id: c.id,
      body: c.body,
      createdAt: c.createdAt,
      author: c.author ? { id: c.author.id, name: c.author.name, image: c.author.image } : null,
      mine: c.authorId === authed.user.id,
    })),
    photos: files
      .filter((f) => f.taskId === task.id && f.mime.startsWith("image/"))
      .map((f) => ({ id: f.id, name: f.name, url: `/api/files/project/${f.versionId}`, uploadedAt: f.uploadedAt, uploadedBy: f.uploadedByName })),
  });
}

/** PATCH { statusId?, progress? } → move the task or update its progress (same rules as the website). */
export async function PATCH(request: Request, ctx: Ctx) {
  const loaded = await load(request, ctx);
  if (loaded instanceof Response) return loaded;
  const body = await readJson(request);
  const patch: { statusId?: string; progress?: number } = {};
  if (typeof body.statusId === "string") patch.statusId = body.statusId;
  if (typeof body.progress === "number") patch.progress = body.progress;
  return runAction(loaded.authed.t, () => updateTask(loaded.access.task.id, patch));
}
