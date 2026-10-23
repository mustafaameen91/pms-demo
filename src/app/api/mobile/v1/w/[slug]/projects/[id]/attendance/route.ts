import { fail, json, mobileProject, readJson, requireMobileWorkspace, runAction } from "@/lib/mobile/api";
import { listTimeEntries, listWorkersForAttendance } from "@/lib/data/timesheets";
import { recordAttendance } from "@/lib/actions/timesheets";
import { defaultQuantity, isISODate } from "@/lib/timesheets";
import { todayISO } from "@/lib/accomplishment";

type Ctx = RouteContext<"/api/mobile/v1/w/[slug]/projects/[id]/attendance">;

/** GET ?date= → the workers I can mark present (the project's first) and who's already recorded that day. */
export async function GET(request: Request, ctx: Ctx) {
  const { slug, id } = await ctx.params;
  const authed = await requireMobileWorkspace(request, slug);
  if (authed instanceof Response) return authed;
  const found = await mobileProject(authed, id);
  if (!found || !found.manager) return fail(404, "not_found", authed.t("Project not found"));
  const q = new URL(request.url).searchParams.get("date");
  const date = q && isISODate(q) ? q : todayISO();
  const [workers, entries] = await Promise.all([listWorkersForAttendance(authed.workspace.id, id), listTimeEntries(id, date, date)]);
  return json({
    date,
    today: todayISO(),
    workers: workers.map((w) => ({
      id: w.id,
      name: w.name,
      role: w.role,
      unit: w.unit,
      unitLabel: authed.t(w.unit),
      defaultQuantity: defaultQuantity(w.unit),
      onProject: w.onProject,
    })),
    recorded: entries
      .filter((e) => e.kind === "worker")
      .map((e) => ({ id: e.id, workerId: e.resourceId, name: e.personName, quantity: e.quantity, unitLabel: authed.t(e.unit), task: e.taskNumber ? `${found.project.key}-${e.taskNumber}` : null })),
  });
}

/** POST { date, taskId?, note?, workers: [{ resourceId, quantity }] } → record who was on site. */
export async function POST(request: Request, ctx: Ctx) {
  const { slug, id } = await ctx.params;
  const authed = await requireMobileWorkspace(request, slug);
  if (authed instanceof Response) return authed;
  const b = await readJson(request);
  const str = (v: unknown) => (typeof v === "string" ? v : typeof v === "number" ? String(v) : undefined);
  const workers = Array.isArray(b.workers)
    ? b.workers.map((w) => ({ resourceId: str((w as Record<string, unknown>)?.resourceId) ?? "", quantity: str((w as Record<string, unknown>)?.quantity) ?? "" }))
    : [];
  return runAction(authed.t, () => recordAttendance(id, { date: str(b.date) ?? "", taskId: str(b.taskId), note: str(b.note), workers }), 201);
}
