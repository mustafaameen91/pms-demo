import { notFound } from "next/navigation";
import { requireWorkspace } from "@/lib/auth/session";
import { getVisibleProjectByKey } from "@/lib/data/project-access";
import { getSiteLog, listSiteLogDays, listTimeEntries } from "@/lib/data/timesheets";
import { buildWeek, isISODate } from "@/lib/timesheets";
import { todayISO } from "@/lib/accomplishment";
import { getT } from "@/i18n/server";
import { SiteLogView } from "@/components/timesheets/site-log-view";

export async function generateMetadata({ params }: PageProps<"/w/[slug]/p/[key]/site-log">) {
  const [{ key }, t] = await Promise.all([params, getT()]);
  return { title: t("Site log · {key}", { key: key.toUpperCase() }) };
}

export default async function SiteLogPage({ params, searchParams }: PageProps<"/w/[slug]/p/[key]/site-log">) {
  const [{ slug, key }, query] = await Promise.all([params, searchParams]);
  const { user, workspace } = await requireWorkspace(slug);
  const project = await getVisibleProjectByKey(workspace, user.id, key);
  if (!project) notFound();

  const today = todayISO();
  const date = isISODate(query.date) && query.date <= today ? query.date : today;
  const [log, entries, recent] = await Promise.all([
    getSiteLog(project.id, date),
    listTimeEntries(project.id, date, date),
    listSiteLogDays(project.id),
  ]);
  // Who was there that day: everyone with time logged (one line per person and unit).
  const onSite = buildWeek(entries, date).flatMap((r) =>
    (r.days[date] ?? []).map((c) => ({ personKey: r.personKey, personName: r.personName, kind: r.kind, ...c })),
  );

  return (
    <div className="w-full px-4 py-6 sm:px-6">
      <SiteLogView
        projectId={project.id}
        basePath={`/w/${workspace.slug}/p/${project.key}`}
        date={date}
        today={today}
        log={log}
        onSite={onSite}
        recent={recent}
      />
    </div>
  );
}
