import { getVisibleProjectByKey } from "@/lib/data/project-access";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AlertTriangle, CalendarClock, CalendarRange, Gauge, Info, ListChecks, ListTree, ShieldAlert, Wallet } from "lucide-react";
import { requireWorkspace } from "@/lib/auth/session";
import { getAccomplishmentTasks, getBoard } from "@/lib/data/projects";
import { getProjectResources } from "@/lib/data/resources";
import { getProjectExpenses } from "@/lib/data/expenses";
import { getProjectAdvances } from "@/lib/data/loans";
import { listRisks } from "@/lib/data/risks";
import { computeForecast } from "@/lib/forecast";
import { computeBudget } from "@/lib/budget";
import { lateTasks, upcomingTasks } from "@/lib/schedule";
import { DeadlinesPanel, MilestonesPanel, RisksPanel, MoneyPanel } from "@/components/projects/overview-panels";
import {
  SCHEDULE_TOLERANCE,
  computeAccomplishment,
  plannedProgress,
  todayISO,
  type Accomplishment,
} from "@/lib/accomplishment";
import { cn, formatDate, formatMoney } from "@/lib/utils";
import { AccomplishmentMeter, ScheduleBadge, fmtPct } from "@/components/projects/accomplishment";
import { StatusDot } from "@/components/tasks/task-bits";
import { getT } from "@/i18n/server";
import type { T } from "@/i18n/translate";
import { EmptyState, PageShell, Panel, StatTile } from "@/components/page/kit";

/** Same checks as weightWarnings() in lib/accomplishment, in the reader's language. */
function weightWarnings(a: Accomplishment, t: T): string[] {
  if (a.mode === "empty") return [];
  if (a.mode === "equal") {
    return [t("No task has a weight yet, so every task counts equally. Give tasks weights that add up to 100%.")];
  }
  const warnings: string[] = [];
  const diff = Math.round((a.totalWeight - 100) * 10) / 10;
  const total = String(a.totalWeight);
  if (diff < 0) warnings.push(t("Task weights add up to {total}%. Assign the remaining {rest}%.", { total, rest: String(-diff) }));
  if (diff > 0) warnings.push(t("Task weights add up to {total}%, which is {over}% over 100%.", { total, over: String(diff) }));
  if (a.unweightedCount > 0) {
    warnings.push(
      t.plural(
        a.unweightedCount,
        "{count} task has no weight and doesn't count toward the project %.",
        "{count} tasks have no weight and don't count toward the project %.",
      ),
    );
  }
  return warnings;
}

export async function generateMetadata({ params }: PageProps<"/w/[slug]/p/[key]/overview">) {
  const [{ key }, t] = await Promise.all([params, getT()]);
  return { title: t("Overview · {key}", { key: key.toUpperCase() }) };
}

export default async function OverviewPage({ params }: PageProps<"/w/[slug]/p/[key]/overview">) {
  const { slug, key } = await params;
  const { user, workspace } = await requireWorkspace(slug);
  const t = await getT();
  const project = await getVisibleProjectByKey(workspace, user.id, key);
  if (!project) notFound();

  const [rows, board, usages, expenseRows, advances, risks] = await Promise.all([
    getAccomplishmentTasks(project.id),
    getBoard(project.id),
    getProjectResources(project.id),
    getProjectExpenses(project.id),
    getProjectAdvances(workspace.id, project.id),
    listRisks(project.id, { activeOnly: true }),
  ]);
  const today = todayISO();
  const money = computeBudget(project.budget, usages, expenseRows, board.tasks, advances);
  const overPlanCount = usages.filter((u) => Number(u.plannedQty) > 0 && Number(u.usedQty) > Number(u.plannedQty)).length;
  const a = computeAccomplishment(rows, project, today);
  const warnings = weightWarnings(a, t);
  const tasksHref = `/w/${workspace.slug}/p/${project.key}`;

  const weightOf = (w: string | null) => (a.mode === "weighted" ? (w ? Number(w) : 0) : 1);
  const denominator = rows.filter((r) => !r.cancelled && !r.isMilestone).reduce((s, r) => s + weightOf(r.weight), 0);

  const late = lateTasks(rows, today);
  const liveTasks = rows.filter((r) => !r.cancelled);
  const finishedCount = liveTasks.filter((r) => r.category === "done").length;

  return (
    <PageShell className="lg:py-6">
      {/* KPIs */}
      <dl className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile
          label={t("Tasks finished")}
          value={`${finishedCount}/${liveTasks.length}`}
          icon={ListChecks}
          tone={liveTasks.length && finishedCount === liveTasks.length ? "good" : "default"}
          hint={liveTasks.length ? t("{pct}% of the tasks are done", { pct: Math.round((finishedCount / liveTasks.length) * 100) }) : t("No tasks yet")}
          share={liveTasks.length ? finishedCount / liveTasks.length : undefined}
          shareLabel={t("Share of tasks finished")}
        />
        <StatTile
          label={t("Remaining")}
          value={money.remaining === null ? "—" : formatMoney(money.remaining, project.currency, t.intl)}
          icon={Wallet}
          tone={money.remaining !== null && money.remaining < 0 ? "bad" : "default"}
          hint={money.budget === null ? t("no budget") : t("{pct}% used", { pct: money.usedPct ?? 0 })}
          share={money.usedPct === null ? undefined : Math.min(100, money.usedPct) / 100}
          shareLabel={t("Budget used")}
        />
        <StatTile label={t("Active risks")} value={risks.length} icon={ShieldAlert} tone={risks.length ? "bad" : "good"} hint={t("In the risk register")} />
        <StatTile label={t("Late tasks")} value={late.length} icon={CalendarClock} tone={late.length ? "bad" : "good"} hint={t("Past their end date")} />
      </dl>

      {/* Headline */}
      <Panel id="accomplishment-heading" title={t("Accomplishment")} icon={Gauge} action={<ScheduleBadge state={a.schedule} className="text-sm" />}>
        <div className="px-5 pb-5 sm:px-6 sm:pb-6">
          <AccomplishmentMeter actual={a.actual} planned={a.planned} size="lg" label={t("Project accomplishment")} className="mt-1" />
          <div className="mt-2 flex flex-wrap items-center gap-x-5 gap-y-1 text-xs text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <span aria-hidden className="h-2 w-4 rounded-full bg-primary" /> {t("Done")}
            </span>
            {a.planned !== null && (
              <span className="flex items-center gap-1.5">
                <span aria-hidden className="h-3 w-0.5 rounded-full bg-foreground/70" /> {t("Planned by today")}
              </span>
            )}
          </div>

          <dl className="mt-6 grid gap-4 border-t pt-5 sm:grid-cols-2">
            <div className="rounded-xl bg-muted/50 p-4">
              <dt className="text-sm text-muted-foreground">{t("Difference")}</dt>
              <dd
                className={cn(
                  "mt-1 text-2xl font-bold tabular-nums",
                  a.schedule === "behind" && "text-destructive",
                  a.schedule === "ahead" && "text-green-700 dark:text-green-400",
                )}
              >
                {/* dir="ltr": keeps the sign in front of the number in Arabic (−57.1%, not 57.1%−). */}
                <span dir="ltr">{a.variance === null ? "—" : `${a.variance > 0 ? "+" : ""}${fmtPct(a.variance)}`}</span>
              </dd>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {t("Done minus planned · ±{tolerance}% counts as on track", { tolerance: String(SCHEDULE_TOLERANCE) })}
              </p>
            </div>
            <div className="rounded-xl bg-muted/50 p-4">
              <dt className="text-sm text-muted-foreground">{t("Total task weight")}</dt>
              <dd
                className={cn(
                  "mt-1 text-2xl font-bold tabular-nums",
                  a.mode === "weighted" && a.totalWeight !== 100 && "text-destructive",
                )}
              >
                {a.mode === "weighted" ? fmtPct(a.totalWeight) : "—"}
              </dd>
              <p className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
                <CalendarRange className="size-3.5 shrink-0" aria-hidden />
                {t.plural(a.taskCount, "{count} task", "{count} tasks")}
                {project.startDate || project.endDate
                  ? ` · ${formatDate(project.startDate, t.intl)} ${t("→")} ${formatDate(project.endDate, t.intl)}`
                  : ""}
              </p>
            </div>
          </dl>
        </div>
      </Panel>

      {warnings.length > 0 && (
        <div role="status" className="grid gap-1.5 rounded-2xl border border-amber-500/40 bg-amber-500/10 px-5 py-3.5 text-sm">
          {warnings.map((w) => (
            <p key={w} className="flex gap-2">
              <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-600 dark:text-amber-400" aria-hidden />
              <span>
                {w}{" "}
                <Link href={tasksHref} className="font-medium text-primary underline-offset-4 hover:underline">
                  {t("Edit weights")}
                </Link>
              </span>
            </p>
          ))}
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <MoneyPanel
          summary={money}
          currency={project.currency}
          href={`${tasksHref}/expenses`}
          overPlanCount={overPlanCount}
          forecast={computeForecast({ budget: money.budget, spent: money.actual, donePct: a.actual, plannedPct: a.planned })}
        />
        <DeadlinesPanel
          late={late}
          upcoming={upcomingTasks(rows, today)}
          today={today}
          taskHref={(n) => `${tasksHref}?task=${project.key}-${n}`}
        />
      </div>

      <RisksPanel risks={risks.slice(0, 5)} total={risks.length} href={`${tasksHref}/risks`} />

      <MilestonesPanel
        milestones={rows.filter((r) => r.isMilestone)}
        today={today}
        taskHref={(n) => `${tasksHref}?task=${project.key}-${n}`}
      />

      {/* Per-task breakdown */}
      <Panel
        id="breakdown-heading"
        title={t("How each task contributes")}
        icon={ListTree}
        count={rows.length || undefined}
        action={
          a.mode !== "empty" && (
            <p className="hidden items-center gap-1.5 text-xs text-muted-foreground sm:flex">
              <Info className="size-3.5" aria-hidden />
              {t("Contribution = weight × progress")}
            </p>
          )
        }
      >
        {rows.length === 0 ? (
          <div className="px-5 pb-5">
            <EmptyState icon={ListTree} title={t("No tasks yet.")}>
              <Link href={tasksHref} className="font-medium text-primary underline-offset-4 hover:underline">
                {t("Add tasks")}
              </Link>{" "}
              {t("to start tracking accomplishment.")}
            </EmptyState>
          </div>
        ) : (
          <div className="relative overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead className="text-start text-xs text-muted-foreground">
                <tr className="border-y bg-muted/40">
                  <th scope="col" className="w-2/5 py-2 pe-3 ps-5 text-start font-medium">{t("Task")}</th>
                  <th scope="col" className="px-3 py-2 text-end font-medium">{t("Weight")}</th>
                  <th scope="col" className="w-64 px-3 py-2 font-medium">{t("Progress vs planned")}</th>
                  <th scope="col" className="px-3 py-2 text-end font-medium">{t("Contributes")}</th>
                  <th scope="col" className="py-2 pe-5 ps-3 text-start font-medium">{t("Schedule")}</th>
                </tr>
              </thead>
              <tbody>
                {rows.filter((r) => !r.isMilestone).map((r) => {
                  const planned = plannedProgress(
                    r.startDate ?? project.startDate,
                    r.dueDate ?? project.endDate,
                    today,
                  );
                  const contributes =
                    r.cancelled || denominator === 0 ? null : (weightOf(r.weight) * r.progress) / denominator;
                  const state =
                    r.cancelled || planned === null
                      ? null
                      : r.progress - planned > SCHEDULE_TOLERANCE
                        ? "ahead"
                        : r.progress - planned < -SCHEDULE_TOLERANCE
                          ? "behind"
                          : "on_track";
                  return (
                    <tr key={r.id} className={cn("border-b transition-colors last:border-b-0 hover:bg-accent", r.cancelled && "text-muted-foreground")}>
                      <td className="max-w-0 py-3 pe-3 ps-5">
                        <Link
                          href={`${tasksHref}?task=${project.key}-${r.number}`}
                          className="flex items-center gap-2 hover:underline"
                        >
                          <StatusDot color={r.statusColor} />
                          <span className="font-mono text-xs text-muted-foreground">
                            {project.key}-{r.number}
                          </span>
                          <span className="truncate font-medium">{r.title}</span>
                        </Link>
                      </td>
                      <td className="px-3 py-3 text-end tabular-nums">
                        {r.weight ? fmtPct(Number(r.weight)) : "—"}
                      </td>
                      <td className="px-3 py-3">
                        <div className="flex items-center gap-2">
                          <AccomplishmentMeter
                            actual={r.progress}
                            planned={r.cancelled ? null : planned === null ? null : Math.round(planned)}
                            size="sm"
                            label={t("{title} progress", { title: r.title })}
                            className="flex-1"
                          />
                          <span className="w-20 text-end text-xs text-muted-foreground tabular-nums">
                            {r.progress}%{planned !== null && !r.cancelled ? ` / ${Math.round(planned)}%` : ""}
                          </span>
                        </div>
                      </td>
                      <td className="px-3 py-3 text-end font-medium tabular-nums">
                        {r.cancelled ? t("Cancelled") : contributes === null ? "—" : fmtPct(Math.round(contributes * 10) / 10)}
                      </td>
                      <td className="py-3 pe-5 ps-3">
                        {!r.cancelled && <ScheduleBadge state={state} short />}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="border-t bg-muted/40 text-xs">
                  <th scope="row" className="py-2.5 pe-3 ps-5 text-start font-medium">
                    {t("Project")}
                  </th>
                  <td className="px-3 py-2 text-end font-medium tabular-nums">
                    {a.mode === "weighted" ? fmtPct(a.totalWeight) : "—"}
                  </td>
                  <td className="px-3 py-2 text-end text-muted-foreground tabular-nums">
                    {fmtPct(a.actual)}
                    {a.planned !== null ? ` / ${fmtPct(a.planned)}` : ""}
                  </td>
                  <td className="px-3 py-2 text-end font-semibold tabular-nums">{fmtPct(a.actual)}</td>
                  <td className="py-2.5 pe-5 ps-3">
                    <ScheduleBadge state={a.schedule} short />
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </Panel>
    </PageShell>
  );
}
