import Link from "next/link";
import { notFound } from "next/navigation";
import { AlertTriangle, ArrowDown, ArrowLeft, ArrowRight, ArrowUp, CalendarClock, CircleCheck, FolderKanban, TrendingDown, TrendingUp } from "lucide-react";
import { requireWorkspace } from "@/lib/auth/session";
import { getReport, listReports } from "@/lib/data/reports";
import { reportFor } from "@/lib/weekly-report-server";
import { headline, type ReportProject } from "@/lib/weekly-report";
import { isWorkspaceAdmin } from "@/lib/permissions";
import { isISODate } from "@/lib/timesheets";
import { cn, formatDate, formatMoney } from "@/lib/utils";
import { getT } from "@/i18n/server";
import { ScheduleBadge, fmtPct } from "@/components/projects/accomplishment";
import { RiskLevelBadge } from "@/components/risks/risk-level";

export async function generateMetadata({ params }: PageProps<"/w/[slug]/reports/[week]">) {
  const [{ week }, t] = await Promise.all([params, getT()]);
  return { title: t("Weekly report · {date}", { date: week }) };
}

/** Projects that need attention first. */
const attention = (p: ReportProject) =>
  (p.overBudget ? 4 : 0) + (p.schedule === "behind" ? 3 : 0) + (p.forecast?.health === "bad" ? 2 : 0) + (p.lateCount ? 1 : 0);

export default async function WeeklyReportPage({ params }: PageProps<"/w/[slug]/reports/[week]">) {
  const { slug, week } = await params;
  if (!isISODate(week)) notFound();
  const { user, workspace } = await requireWorkspace(slug);
  const t = await getT();
  const admin = isWorkspaceAdmin(workspace.role);
  const report = await getReport(workspace.id, week);
  if (!report) notFound();
  const projects = reportFor(report, user.id, admin).sort((a, b) => attention(b) - attention(a) || a.name.localeCompare(b.name));
  // Only managers of a project in it (or admins) can read it: it shows money.
  if (projects.length === 0) notFound();
  const weeks = (await listReports(workspace.id)).filter((r) => reportFor(r.data, user.id, admin).length > 0).map((r) => r.weekStart);
  const i = weeks.indexOf(week);
  const newer = i > 0 ? weeks[i - 1] : null;
  const older = i >= 0 && i < weeks.length - 1 ? weeks[i + 1] : null;
  const h = headline(projects);
  const base = `/w/${workspace.slug}`;
  const tiles = [
    { icon: FolderKanban, label: t("Projects"), value: h.projects, bad: false },
    { icon: TrendingDown, label: t("Behind schedule"), value: h.behind, bad: h.behind > 0 },
    { icon: AlertTriangle, label: t("Over / heading over budget"), value: h.overBudget + h.headingOver, bad: h.overBudget + h.headingOver > 0 },
    { icon: CalendarClock, label: t("Late tasks"), value: h.late, bad: h.late > 0 },
    { icon: CircleCheck, label: t("Finished this week"), value: h.done, bad: false },
  ];

  return (
    <div className="grid w-full grid-cols-1 gap-6 px-4 py-6 sm:px-6 lg:py-8">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <Link href={`${base}/reports`} className="mb-1 flex w-fit items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
            <ArrowLeft className="size-4 rtl:-scale-x-100" aria-hidden />
            {t("Weekly reports")}
          </Link>
          <h1 className="text-xl font-semibold tracking-tight">
            {t("Weekly report: {start} – {end}", { start: formatDate(report.start, t.intl), end: formatDate(report.end, t.intl) })}
          </h1>
        </div>
        <nav aria-label={t("Choose week")} className="flex gap-2 text-sm">
          {older && (
            <Link href={`${base}/reports/${older}`} className="flex items-center gap-1 rounded-md border px-3 py-1.5 hover:bg-accent">
              <ArrowLeft className="size-4 rtl:-scale-x-100" aria-hidden />
              {t("Previous week")}
            </Link>
          )}
          {newer && (
            <Link href={`${base}/reports/${newer}`} className="flex items-center gap-1 rounded-md border px-3 py-1.5 hover:bg-accent">
              {t("Next week")}
              <ArrowRight className="size-4 rtl:-scale-x-100" aria-hidden />
            </Link>
          )}
        </nav>
      </header>

      <dl className="grid gap-3 sm:grid-cols-3 xl:grid-cols-5">
        {tiles.map((k) => (
          <div key={k.label} className="rounded-xl border bg-card p-4">
            <dt className="flex items-center gap-2 text-sm text-muted-foreground">
              <k.icon className={cn("size-4", k.bad && "text-destructive")} aria-hidden />
              {k.label}
            </dt>
            <dd className={cn("mt-1 text-2xl font-semibold tabular-nums", k.bad && "text-destructive")}>{k.value}</dd>
          </div>
        ))}
      </dl>

      <ul className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        {projects.map((p) => (
          <li key={p.id}>
            <ProjectCard p={p} base={base} t={t} />
          </li>
        ))}
      </ul>
    </div>
  );
}

function ProjectCard({ p, base, t }: { p: ReportProject; base: string; t: Awaited<ReturnType<typeof getT>> }) {
  const money = (v: number) => formatMoney(v, p.currency, t.intl);
  const f = p.forecast;
  return (
    <article aria-labelledby={`rp-${p.id}`} className="grid h-full gap-4 rounded-xl border bg-card p-5">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <h2 id={`rp-${p.id}`} className="font-semibold">
          <Link href={`${base}/p/${p.key}/overview`} className="hover:underline">
            {p.name}
          </Link>{" "}
          <span className="font-mono text-xs font-normal text-muted-foreground">{p.key}</span>
        </h2>
        <ScheduleBadge state={p.schedule} short />
      </header>

      <dl className="grid grid-cols-2 gap-4 text-sm sm:grid-cols-3">
        <div>
          <dt className="text-xs text-muted-foreground">{t("Accomplishment")}</dt>
          <dd className="mt-0.5 flex items-baseline gap-2">
            <span className="text-xl font-semibold tabular-nums">{fmtPct(p.actual)}</span>
            {p.change !== null && p.change !== 0 && (
              <span className={cn("flex items-center text-xs font-medium tabular-nums", p.change > 0 ? "text-green-700 dark:text-green-400" : "text-destructive")}>
                {p.change > 0 ? <ArrowUp className="size-3" aria-hidden /> : <ArrowDown className="size-3" aria-hidden />}
                <bdi dir="ltr">{t("{n} pts", { n: Math.abs(p.change) })}</bdi>
                <span className="sr-only">{p.change > 0 ? t("up since last week") : t("down since last week")}</span>
              </span>
            )}
          </dd>
          <p className="text-xs text-muted-foreground">
            {p.change === null ? t("First report: no change to show yet") : p.change === 0 ? t("No progress since last week") : p.planned !== null ? t("Planned {pct}", { pct: fmtPct(p.planned) }) : ""}
          </p>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">{t("Spent this week")}</dt>
          <dd className="mt-0.5 text-xl font-semibold tabular-nums">{money(p.spentThisWeek)}</dd>
          <p className="text-xs text-muted-foreground">
            {p.budget ? t("{spent} of {budget} so far", { spent: money(p.spent), budget: money(p.budget) }) : t("{spent} so far", { spent: money(p.spent) })}
          </p>
        </div>
        <div className="col-span-2 sm:col-span-1">
          <dt className="text-xs text-muted-foreground">{t("Expected final cost")}</dt>
          <dd className={cn("mt-0.5 text-xl font-semibold tabular-nums", (p.overBudget || f?.health === "bad") && "text-destructive")}>{f ? money(f.final) : "—"}</dd>
          <p className={cn("flex items-center gap-1 text-xs", f?.overBy && f.overBy > 0 ? "text-destructive" : "text-muted-foreground")}>
            {p.overBudget ? (
              <>
                <AlertTriangle className="size-3" aria-hidden />
                {t("Over budget")}
              </>
            ) : f && f.overBy !== null && f.overBy > 0 && !f.early ? (
              <>
                <TrendingUp className="size-3" aria-hidden />
                {t("Heading {pct}% over budget", { pct: String(f.overPct) })}
              </>
            ) : f ? (
              f.early ? t("Early estimate") : t("Within budget")
            ) : (
              t("No forecast yet")
            )}
          </p>
        </div>
      </dl>

      <div className="grid gap-4 sm:grid-cols-2">
        <section aria-label={t("Late tasks")}>
          <h3 className="mb-1.5 text-sm font-medium">
            {t("Late tasks")} <span className="text-muted-foreground tabular-nums">{p.lateCount}</span>
          </h3>
          {p.lateCount === 0 ? (
            <p className="text-xs text-muted-foreground">{t("Nothing late.")}</p>
          ) : (
            <ul className="grid gap-1 text-sm">
              {p.late.map((task) => (
                <li key={task.number} className="flex justify-between gap-2">
                  <Link href={`${base}/p/${p.key}?task=${p.key}-${task.number}`} className="min-w-0 truncate hover:underline">
                    <span className="font-mono text-xs text-muted-foreground">{p.key}-{task.number}</span> {task.title}
                  </Link>
                  <span className="shrink-0 text-xs text-destructive">{formatDate(task.dueDate, t.intl)}</span>
                </li>
              ))}
              {p.lateCount > p.late.length && <li className="text-xs text-muted-foreground">{t("+{count} more", { count: p.lateCount - p.late.length })}</li>}
            </ul>
          )}
        </section>
        <section aria-label={t("Finished this week")}>
          <h3 className="mb-1.5 text-sm font-medium">
            {t("Finished this week")} <span className="text-muted-foreground tabular-nums">{p.doneCount}</span>
          </h3>
          {p.doneCount === 0 ? (
            <p className="text-xs text-muted-foreground">{t("No tasks finished this week.")}</p>
          ) : (
            <ul className="grid gap-1 text-sm">
              {p.done.map((task) => (
                <li key={task.number} className="min-w-0 truncate">
                  <span className="font-mono text-xs text-muted-foreground">{p.key}-{task.number}</span> {task.title}
                </li>
              ))}
              {p.doneCount > p.done.length && <li className="text-xs text-muted-foreground">{t("+{count} more", { count: p.doneCount - p.done.length })}</li>}
            </ul>
          )}
        </section>
      </div>

      {(p.risks.length > 0 || p.newRisks > 0) && (
        <section aria-label={t("Top risks")}>
          <h3 className="mb-1.5 text-sm font-medium">
            {t("Top risks")}
            {p.newRisks > 0 && <span className="ms-2 text-xs font-normal text-muted-foreground">{t.plural(p.newRisks, "{count} new this week", "{count} new this week")}</span>}
          </h3>
          <ul className="grid gap-1.5 text-sm">
            {p.risks.map((r) => (
              <li key={r.number} className="flex flex-wrap items-center gap-2">
                <RiskLevelBadge likelihood={r.likelihood} impact={r.impact} t={t} />
                <span className="min-w-0 truncate">{r.title}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </article>
  );
}
