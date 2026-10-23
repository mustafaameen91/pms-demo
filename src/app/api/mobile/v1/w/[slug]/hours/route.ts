import { fail, json, readJson, requireMobileWorkspace, runAction } from "@/lib/mobile/api";
import { listMyTimeEntries } from "@/lib/data/my-work";
import { logHours } from "@/lib/actions/timesheets";
import { addDays, isISODate, weekStartOf } from "@/lib/timesheets";
import { todayISO } from "@/lib/accomplishment";

/** GET ?week=YYYY-MM-DD (any day in it; default this week) → my hours that week (Saturday to Friday). */
export async function GET(request: Request, ctx: RouteContext<"/api/mobile/v1/w/[slug]/hours">) {
  const authed = await requireMobileWorkspace(request, (await ctx.params).slug);
  if (authed instanceof Response) return authed;
  const q = new URL(request.url).searchParams.get("week");
  const from = weekStartOf(q && isISODate(q) ? q : todayISO());
  const to = addDays(from, 6);
  const entries = await listMyTimeEntries(authed.workspace.id, authed.user.id, from, to);
  return json({
    from,
    to,
    today: todayISO(),
    entries: entries.map((e) => ({
      id: e.id,
      date: e.date,
      hours: e.quantity,
      note: e.note,
      status: e.status,
      decisionNote: e.decisionNote,
      decidedBy: e.deciderName,
      project: { id: e.projectId, key: e.projectKey, name: e.projectName },
      task: e.taskId && e.taskNumber ? { id: e.taskId, key: `${e.projectKey}-${e.taskNumber}`, title: e.taskTitle } : null,
    })),
  });
}

/** POST { projectId, date, hours, taskId?, note?, entryId? } → log (or change) my hours. */
export async function POST(request: Request, ctx: RouteContext<"/api/mobile/v1/w/[slug]/hours">) {
  const authed = await requireMobileWorkspace(request, (await ctx.params).slug);
  if (authed instanceof Response) return authed;
  const b = await readJson(request);
  if (typeof b.projectId !== "string") return fail(400, "invalid", authed.t("Choose a project"));
  const str = (v: unknown) => (typeof v === "string" ? v : typeof v === "number" ? String(v) : undefined);
  return runAction(
    authed.t,
    () =>
      logHours(
        b.projectId as string,
        { date: str(b.date) ?? "", hours: str(b.hours) ?? "", taskId: str(b.taskId), note: str(b.note) },
        typeof b.entryId === "string" ? b.entryId : null,
      ),
    201,
  );
}
