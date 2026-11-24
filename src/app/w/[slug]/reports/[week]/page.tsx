import Link from "next/link";
import { notFound } from "next/navigation";
import { AlertTriangle, ArrowDown, ArrowLeft, ArrowRight, ArrowUp, CalendarClock, CircleCheck, FileBarChart, FolderKanban, Minus, ShieldAlert, TrendingDown, TrendingUp } from "lucide-react";
import { requireWorkspace } from "@/lib/auth/session";
import { getReport, listReports } from "@/lib/data/reports";
import { reportFor } from "@/lib/weekly-report-server";
import { headline, type ReportProject } from "@/lib/weekly-report";
import { isWorkspaceAdmin } from "@/lib/permissions";
import { isISODate } from "@/lib/timesheets";
import { cn, formatDate, formatMoney } from "@/lib/utils";
import { getT } from "@/i18n/server";
import { AccomplishmentMeter, ScheduleBadge, fmtPct } from "@/components/projects/accomplishment";
import { PageHeader, PageShell, StatTile } from "@/components/page/kit";
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
    { icon: FolderKanban, label: t("Projects"), value: h.projects, tone: "default" as const },
    { icon: TrendingDown, label: t("Behind schedule"), value: h.behind, tone: h.behind > 0 ? ("bad" as const) : ("good" as const) },
    { icon: AlertTriangle, label: t("Over / heading over budget"), value: h.overBudget + h.headingOver, tone: h.overBudget + h.headingOver > 0 ? ("bad" as const) : ("good" as const) },
    { icon: CalendarClock, label: t("Late tasks"), value: h.late, tone: h.late > 0 ? ("bad" as const) : ("good" as const) },
    { icon: CircleCheck, label: t("Finished this week"), value: h.done, tone: "good" as const },
  ];

  return (
    <PageShell>
      <Link href={`${base}/reports`} className="-mb-2 flex w-fit items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4 rtl:-scale-x-100" aria-hidden />
        {t("Weekly reports")}
      </Link>
      <PageHeader
        icon={FileBarChart}
        title={t("Weekly report: {start} – {end}", { start: formatDate(report.start, t.intl), end: formatDate(report.end, t.intl) })}
        description={t.plural(h.projects, "{count} project", "{count} projects")}
        actions={
          (older || newer) && (
            <nav aria-label={t("Choose week")} className="flex gap-2">
              {older && (
                <Link href={`${base}/reports/${older}`} className="flex h-8 items-center gap-1.5 rounded-lg border bg-card px-3 text-sm transition-colors hover:bg-accent">
                  <ArrowLeft className="size-4 rtl:-scale-x-100" aria-hidden />
                  {t("Previous week")}
                </Link>
              )}
              {newer && (
                <Link href={`${base}/reports/${newer}`} className="flex h-8 items-center gap-1.5 rounded-lg border bg-card px-3 text-sm transition-colors hover:bg-accent">
                  {t("Next week")}
                  <ArrowRight className="size-4 rtl:-scale-x-100" aria-hidden />
                </Link>
              )}
            </nav>
          )
        }
      />

      <dl className="grid gap-4 sm:grid-cols-3 xl:grid-cols-5">
        {tiles.map((k) => (
          <StatTile key={k.label} icon={k.icon} label={k.label} value={k.value} tone={k.tone} />
        ))}
      </dl>

      <ul className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        {projects.map((p) => (
          <li key={p.id}>
            <ProjectCard p={p} base={base} t={t} />
          </li>
        ))}
      </ul>
    </PageShell>
  );
}

/** A change since last week, in words and an arrow (never colour alone). */
function Delta({ change, t }: { change: number | null; t: Awaited<ReturnType<typeof getT>> }) {
  if (change === null) return null;
  const up = change > 0;
  const flat = change === 0;
  const Icon = flat ? Minus : up ? ArrowUp : ArrowDown;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold tabular-nums",
        flat ? "bg-muted text-muted-foreground" : up ? "bg-green-600/10 text-green-700 dark:text-green-400" : "bg-destructive/10 text-destructive",
      )}
    >
      <Icon className="size-3" aria-hidden />
      {flat ? t("No change") : <bdi dir="ltr">{t("{n} pts", { n: Math.abs(change) })}</bdi>}
      {!flat && <span className="sr-only">{up ? t("up since last week") : t("down since last week")}</span>}
    </span>
  );
}

function ProjectCard({ p, base, t }: { p: ReportProject; base: string; t: Awaited<ReturnType<typeof getT>> }) {
  const money = (v: number) => formatMoney(v, p.currency, t.intl);
  const f = p.forecast;
  return (
    <article aria-labelledby={`rp-${p.id}`} className="relative grid h-full overflow-hidden rounded-2xl border bg-card">
      <header className="flex flex-wrap items-center justify-between gap-2 px-5 pt-5">
        <h2 id={`rp-${p.id}`} className="flex min-w-0 items-center gap-3 font-semibold">
          <span aria-hidden className="grid size-9 shrink-0 place-items-center rounded-xl bg-primary/10 font-mono text-[11px] font-bold text-primary">
            {p.key.slice(0, 3)}
          </span>
          <span className="min-w-0">
            <Link href={`${base}/p/${p.key}/overview`} className="block truncate hover:text-primary hover:underline">
              {p.name}
            </Link>
            <span className="block font-mono text-xs font-normal text-muted-foreground">{p.key}</span>
          </span>
        </h2>
        <ScheduleBadge state={p.schedule} short />
      </header>

      <div className="grid gap-2 px-5 pt-4">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <span className="text-xs text-muted-foreground">{t("Accomplishment")}</span>
          <span className="text-3xl font-bold tracking-tight tabular-nums">{fmtPct(p.actual)}</span>
          <Delta change={p.change} t={t} />
          {p.planned !== null && <span className="text-xs text-muted-foreground tabular-nums">{t("Planned {pct}", { pct: fmtPct(p.planned) })}</span>}
        </div>
        {p.actual !== null && <AccomplishmentMeter actual={p.actual} planned={p.planned} label={t("{name} accomplishment", { name: p.name })} />}
        <p className="text-xs text-muted-foreground">
          {p.change === null ? t("First report: no change to show yet") : p.change === 0 ? t("No progress since last week") : p.change > 0 ? t("up since last week") : t("down since last week")}
        </p>
      </div>

      <dl className="mx-5 mt-4 grid grid-cols-2 gap-px overflow-hidden rounded-xl border bg-border text-sm">
        <div className="bg-card p-3">
          <dt className="text-xs text-muted-foreground">{t("Spent this week")}</dt>
          <dd className="mt-0.5 text-lg font-bold tabular-nums">{money(p.spentThisWeek)}</dd>
          <p className="text-xs text-muted-foreground">
            {p.budget ? t("{spent} of {budget} so far", { spent: money(p.spent), budget: money(p.budget) }) : t("{spent} so far", { spent: money(p.spent) })}
          </p>
        </div>
        <div className="bg-card p-3">
          <dt className="text-xs text-muted-foreground">{t("Expected final cost")}</dt>
          <dd className={cn("mt-0.5 text-lg font-bold tabular-nums", (p.overBudget || f?.health === "bad") && "text-destructive")}>{f ? money(f.final) : "—"}</dd>
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

      <div className="mt-4 grid border-t sm:grid-cols-2 sm:divide-x sm:rtl:divide-x-reverse">
        <section aria-label={t("Late tasks")} className="px-5 py-4">
          <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold">
            <CalendarClock className={cn("size-4", p.lateCount ? "text-destructive" : "text-muted-foreground")} aria-hidden />
            {t("Late tasks")}
            <span className={cn("rounded-full px-2 py-0.5 text-xs tabular-nums", p.lateCount ? "bg-destructive/10 text-destructive" : "bg-muted text-muted-foreground")}>{p.lateCount}</span>
          </h3>
          {p.lateCount === 0 ? (
            <p className="text-xs text-muted-foreground">{t("Nothing late.")}</p>
          ) : (
            <ul className="grid gap-1.5 text-sm">
              {p.late.map((task) => (
                <li key={task.number} className="flex justify-between gap-2">
                  <Link href={`${base}/p/${p.key}?task=${p.key}-${task.number}`} className="min-w-0 truncate hover:underline">
                    <span className="font-mono text-xs text-muted-foreground">{p.key}-{task.number}</span> {task.title}
                  </Link>
                  <span className="shrink-0 text-xs font-medium text-destructive">{formatDate(task.dueDate, t.intl)}</span>
                </li>
              ))}
              {p.lateCount > p.late.length && <li className="text-xs text-muted-foreground">{t("+{count} more", { count: p.lateCount - p.late.length })}</li>}
            </ul>
          )}
        </section>
        <section aria-label={t("Finished this week")} className="border-t px-5 py-4 sm:border-t-0">
          <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold">
            <CircleCheck className="size-4 text-green-700 dark:text-green-400" aria-hidden />
            {t("Finished this week")}
            <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground tabular-nums">{p.doneCount}</span>
          </h3>
          {p.doneCount === 0 ? (
            <p className="text-xs text-muted-foreground">{t("No tasks finished this week.")}</p>
          ) : (
            <ul className="grid gap-1.5 text-sm">
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
        <section aria-label={t("Top risks")} className="border-t px-5 py-4">
          <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold">
            <ShieldAlert className="size-4 text-muted-foreground" aria-hidden />
            {t("Top risks")}
            {p.newRisks > 0 && <span className="text-xs font-normal text-muted-foreground">{t.plural(p.newRisks, "{count} new this week", "{count} new this week")}</span>}
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
