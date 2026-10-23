import { fail, json, mobileProject, readJson, requireMobileWorkspace, runAction } from "@/lib/mobile/api";
import { getSiteLog, listSiteLogDays } from "@/lib/data/timesheets";
import { saveSiteLog } from "@/lib/actions/timesheets";
import { WEATHER, isISODate } from "@/lib/timesheets";
import { todayISO } from "@/lib/accomplishment";

type Ctx = RouteContext<"/api/mobile/v1/w/[slug]/projects/[id]/site-log">;

/** GET ?date=YYYY-MM-DD (default today) → that day's site log, the recent days that have one, weather choices. */
export async function GET(request: Request, ctx: Ctx) {
  const { slug, id } = await ctx.params;
  const authed = await requireMobileWorkspace(request, slug);
  if (authed instanceof Response) return authed;
  const found = await mobileProject(authed, id);
  if (!found) return fail(404, "not_found", authed.t("Project not found"));
  const q = new URL(request.url).searchParams.get("date");
  const date = q && isISODate(q) ? q : todayISO();
  const [log, days] = await Promise.all([getSiteLog(id, date), listSiteLogDays(id, 30)]);
  return json({
    date,
    today: todayISO(),
    log,
    days: days.map((d) => ({ date: d.date, weather: d.weather, hasProblems: Boolean(d.hasProblems) })),
    weather: WEATHER.map((w) => ({ value: w.value, label: authed.t(w.label) })),
  });
}

/** PUT { date, weather?, temperature?, deliveries?, problems?, notes? } → save the day's log (anyone on the team). */
export async function PUT(request: Request, ctx: Ctx) {
  const { slug, id } = await ctx.params;
  const authed = await requireMobileWorkspace(request, slug);
  if (authed instanceof Response) return authed;
  const b = await readJson(request);
  const text = (v: unknown) => (typeof v === "string" ? v : typeof v === "number" ? String(v) : undefined);
  return runAction(authed.t, () =>
    saveSiteLog(id, {
      date: text(b.date) ?? "",
      weather: text(b.weather),
      temperature: text(b.temperature),
      deliveries: text(b.deliveries),
      problems: text(b.problems),
      notes: text(b.notes),
    }),
  );
}
