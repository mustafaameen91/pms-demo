import Link from "next/link";
import { notFound } from "next/navigation";
import { AlertTriangle, CalendarRange, ChevronRight, CircleCheck, FileBarChart, FolderKanban } from "lucide-react";
import { requireWorkspace } from "@/lib/auth/session";
import { listReports } from "@/lib/data/reports";
import { reportFor } from "@/lib/weekly-report-server";
import { headline } from "@/lib/weekly-report";
import { isWorkspaceAdmin } from "@/lib/permissions";
import { listProjects } from "@/lib/data/projects";
import { cn, formatDate } from "@/lib/utils";
import { getT } from "@/i18n/server";
import { EmptyState, PageHeader, PageShell, Panel, StatTile } from "@/components/page/kit";

export async function generateMetadata() {
  const t = await getT();
  return { title: t("Weekly reports") };
}

export default async function ReportsPage({ params }: PageProps<"/w/[slug]/reports">) {
  const { slug } = await params;
  const { user, workspace } = await requireWorkspace(slug);
  const t = await getT();
  const admin = isWorkspaceAdmin(workspace.role);
  if (!admin && !(await listProjects(workspace.id)).some((p) => p.leadId === user.id)) notFound();
  const reports = (await listReports(workspace.id))
    .map((r) => ({ ...r, mine: reportFor(r.data, user.id, admin) }))
    .filter((r) => r.mine.length > 0);
  const base = `/w/${workspace.slug}`;

  const latest = reports[0];
  const lh = latest ? headline(latest.mine) : null;
  const latestAlerts = lh ? lh.behind + lh.overBudget + lh.headingOver : 0;

  return (
    <PageShell>
      <PageHeader
        icon={FileBarChart}
        title={t("Weekly reports")}
        description={t("Every Saturday, a summary of last week for the projects you manage: progress, money, late tasks and risks. It also arrives in your inbox.")}
      />

      {latest && lh && (
        <dl className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatTile icon={CalendarRange} label={t("Weeks reported")} value={reports.length} hint={t("Latest: {start} – {end}", { start: formatDate(latest.data.start, t.intl), end: formatDate(latest.data.end, t.intl) })} />
          <StatTile icon={FolderKanban} label={t("Projects")} value={lh.projects} hint={t("In the latest report")} />
          <StatTile
            icon={latestAlerts ? AlertTriangle : CircleCheck}
            tone={latestAlerts ? "bad" : "good"}
            label={t("Need attention")}
            value={latestAlerts}
            hint={t("{behind} behind · {over} over budget · {heading} heading over", { behind: lh.behind, over: lh.overBudget, heading: lh.headingOver })}
          />
          <StatTile icon={CircleCheck} tone="good" label={t("Finished this week")} value={lh.done} hint={t("Tasks finished in the latest week")} />
        </dl>
      )}

      {reports.length === 0 ? (
        <EmptyState icon={FileBarChart} title={t("No reports yet")}>
          {t("No reports yet. The first one is made after the first full week (Saturday to Friday).")}
        </EmptyState>
      ) : (
        <Panel id="reports-heading" title={t("All weeks")} icon={CalendarRange} count={reports.length}>
          <ul className="divide-y border-t">
            {reports.map((r) => {
              const h = headline(r.mine);
              const alerts = h.behind + h.overBudget + h.headingOver;
              return (
                <li key={r.weekStart}>
                  <Link href={`${base}/reports/${r.weekStart}`} className="group flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-3.5 text-sm transition-colors hover:bg-accent">
                    <span aria-hidden className="grid size-9 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
                      <CalendarRange className="size-4.5" />
                    </span>
                    <span className="min-w-56">
                      <span className="block font-semibold">
                        {formatDate(r.data.start, t.intl)} – {formatDate(r.data.end, t.intl)}
                      </span>
                      <span className="block text-xs text-muted-foreground">{t.plural(h.projects, "{count} project", "{count} projects")}</span>
                    </span>
                    <span
                      className={cn(
                        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium",
                        alerts ? "bg-destructive/10 text-destructive" : "bg-green-600/10 text-green-700 dark:text-green-400",
                      )}
                    >
                      {alerts ? <AlertTriangle className="size-3.5" aria-hidden /> : <CircleCheck className="size-3.5" aria-hidden />}
                      {alerts ? t("{behind} behind · {over} over budget · {heading} heading over", { behind: h.behind, over: h.overBudget, heading: h.headingOver }) : t("Nothing needs attention")}
                    </span>
                    <span className="text-xs text-muted-foreground">{t.plural(h.done, "{count} task finished", "{count} tasks finished")}</span>
                    <ChevronRight className="ms-auto size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5 rtl:-scale-x-100 rtl:group-hover:-translate-x-0.5" aria-hidden />
                  </Link>
                </li>
              );
            })}
          </ul>
        </Panel>
      )}
    </PageShell>
  );
}
