import Link from "next/link";
import { AlertTriangle, CalendarClock, CircleCheck, Diamond, ShieldAlert, Wallet } from "lucide-react";
import { RiskLevelBadge } from "@/components/risks/risk-level";
import { ForecastBlock } from "@/components/projects/forecast";
import type { Forecast } from "@/lib/forecast";
import type { BudgetSummary } from "@/lib/budget";
import { daysBetween } from "@/lib/schedule";
import { cn, formatDate, formatMoney } from "@/lib/utils";
import { getT } from "@/i18n/server";
import type { T } from "@/i18n/translate";
import { Panel } from "@/components/page/kit";

type DeadlineRow = { id: string; number: number; title: string; dueDate: string | null };

/** Budget / spent / remaining for the project Overview. */
export async function MoneyPanel({
  summary,
  currency,
  href,
  overPlanCount,
  forecast,
}: {
  summary: BudgetSummary;
  currency: string;
  href: string;
  overPlanCount: number;
  forecast: Forecast;
}) {
  const t = await getT();
  const money = (v: number) => formatMoney(v, currency, t.intl);
  const tasksOver = summary.tasks.filter((task) => task.overBudget).length;
  const pct = summary.usedPct === null ? null : Math.min(100, summary.usedPct);
  return (
    <Panel
      id="money-heading"
      title={t("Money")}
      icon={Wallet}
      className="flex flex-col"
      action={
        <Link href={href} className="text-xs font-medium text-primary underline-offset-4 hover:underline">
          {t("Expenses tab")}
        </Link>
      }
    >
      <div className="flex flex-1 flex-col px-5 pb-5">
        <dl className="grid grid-cols-3 gap-3">
          <div className="rounded-xl bg-muted/50 p-3">
            <dt className="text-xs text-muted-foreground">{t("Budget")}</dt>
            <dd className="mt-0.5 font-bold tabular-nums">{summary.budget === null ? "—" : money(summary.budget)}</dd>
          </div>
          <div className="rounded-xl bg-muted/50 p-3">
            <dt className="text-xs text-muted-foreground">{t("Spent")}</dt>
            <dd className={cn("mt-0.5 font-bold tabular-nums", summary.overBudget && "text-destructive")}>{money(summary.actual)}</dd>
          </div>
          <div className="rounded-xl bg-muted/50 p-3">
            <dt className="text-xs text-muted-foreground">{t("Remaining")}</dt>
            <dd className={cn("mt-0.5 font-bold tabular-nums", (summary.remaining ?? 0) < 0 && "text-destructive")}>
              {summary.remaining === null ? "—" : money(summary.remaining)}
            </dd>
          </div>
        </dl>

        {pct !== null && (
          <div className="mt-4">
            <div
              role="meter"
              aria-label={t("Budget used")}
              aria-valuenow={summary.usedPct ?? 0}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuetext={t("{pct}% of budget used", { pct: String(summary.usedPct) })}
              className={cn("h-2 overflow-hidden rounded-full", summary.overBudget ? "bg-destructive/15" : "bg-muted")}
            >
              <div
                className={cn("h-full rounded-full", summary.overBudget ? "bg-destructive" : "bg-primary")}
                style={{ width: `${pct}%` }}
              />
            </div>
            <p className="mt-1.5 text-xs text-muted-foreground">{t("{pct}% of budget used", { pct: String(summary.usedPct) })}</p>
          </div>
        )}

        <ForecastBlock forecast={forecast} currency={currency} t={t} className="mt-4 border-t pt-4" />

        <ul className="mt-4 grid gap-1.5 border-t pt-4 text-sm">
          {summary.overBudget && (
            <li className="flex items-center gap-2 font-medium text-destructive">
              <AlertTriangle className="size-4 shrink-0" aria-hidden />
              {t("Over budget by {amount}", { amount: money(-(summary.remaining ?? 0)) })}
            </li>
          )}
          {tasksOver > 0 && (
            <li className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="size-4 shrink-0" aria-hidden />
              {t.plural(tasksOver, "{count} task(s) over their budget", "{count} task(s) over their budget")}
            </li>
          )}
          {overPlanCount > 0 && (
            <li className="flex items-center gap-2 text-amber-700 dark:text-amber-400">
              <AlertTriangle className="size-4 shrink-0" aria-hidden />
              {t.plural(overPlanCount, "{count} resource(s) used more than planned", "{count} resource(s) used more than planned")}
            </li>
          )}
          <li className="flex justify-between text-muted-foreground">
            <span>{t("Still owed to suppliers & workers")}</span>
            <span className="font-medium text-foreground tabular-nums">{money(summary.owedToResources)}</span>
          </li>
        </ul>
      </div>
    </Panel>
  );
}

/** Late and upcoming tasks for the project Overview. */
export async function DeadlinesPanel({
  late,
  upcoming,
  today,
  taskHref,
}: {
  late: DeadlineRow[];
  upcoming: DeadlineRow[];
  today: string;
  taskHref: (number: number) => string;
}) {
  const t = await getT();
  return (
    <Panel id="deadlines-heading" title={t("Deadlines")} icon={CalendarClock} className="flex flex-col">
      {late.length === 0 && upcoming.length === 0 ? (
        <p className="flex items-center gap-3 px-5 pb-5 text-sm text-muted-foreground">
          <span aria-hidden className="grid size-9 place-items-center rounded-xl bg-green-600/10 text-green-700 dark:text-green-400">
            <CircleCheck className="size-4.5" />
          </span>
          {t("Nothing late or due in the next 14 days.")}
        </p>
      ) : (
        <div className="grid">
          {late.length > 0 && (
            <div>
              <h3 className="flex items-center gap-1.5 border-t bg-destructive/5 px-5 py-2 text-xs font-semibold text-destructive">
                <AlertTriangle className="size-3.5" aria-hidden />
                {t("Late ({count})", { count: late.length })}
              </h3>
              <DeadlineList rows={late} today={today} taskHref={taskHref} t={t} late />
            </div>
          )}
          {upcoming.length > 0 && (
            <div>
              <h3 className="flex items-center gap-1.5 border-t bg-muted/40 px-5 py-2 text-xs font-semibold text-muted-foreground">
                <CalendarClock className="size-3.5" aria-hidden />
                {t("Due in the next 14 days ({count})", { count: upcoming.length })}
              </h3>
              <DeadlineList rows={upcoming} today={today} taskHref={taskHref} t={t} />
            </div>
          )}
        </div>
      )}
    </Panel>
  );
}

function DeadlineList({
  rows,
  today,
  taskHref,
  t,
  late,
}: {
  rows: DeadlineRow[];
  today: string;
  taskHref: (number: number) => string;
  t: T;
  late?: boolean;
}) {
  return (
    <ul className="grid divide-y border-t text-sm">
      {rows.slice(0, 6).map((r) => {
        const days = daysBetween(today, r.dueDate!);
        const when = late
          ? t.plural(-days, "{count} day late", "{count} days late")
          : days === 0
            ? t("Due today")
            : t.plural(days, "In {count} day", "In {count} days");
        return (
          <li key={r.id}>
            <Link href={taskHref(r.number)} className="flex items-center gap-3 px-5 py-3 transition-colors hover:bg-accent">
              <span className="min-w-0 flex-1 truncate">{r.title}</span>
              <span className="text-xs whitespace-nowrap text-muted-foreground tabular-nums">{formatDate(r.dueDate, t.intl)}</span>
              <span
                className={cn(
                  "shrink-0 rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap tabular-nums",
                  late ? "bg-destructive/10 text-destructive" : "bg-muted text-muted-foreground",
                )}
              >
                {when}
              </span>
            </Link>
          </li>
        );
      })}
      {rows.length > 6 && <li className="px-5 py-2.5 text-xs text-muted-foreground">{t("and {count} more", { count: rows.length - 6 })}</li>}
    </ul>
  );
}

/** Key dates of the project: reached, upcoming or missed. */
export async function MilestonesPanel({
  milestones,
  today,
  taskHref,
}: {
  milestones: { id: string; number: number; title: string; dueDate: string | null; category: string }[];
  today: string;
  taskHref: (number: number) => string;
}) {
  if (milestones.length === 0) return null;
  const t = await getT();
  const sorted = [...milestones].sort((a, b) => (a.dueDate ?? "9999").localeCompare(b.dueDate ?? "9999"));
  return (
    <Panel id="milestones-heading" title={t("Milestones")} icon={Diamond} count={milestones.length}>
      <ol className="grid divide-y border-t">
        {sorted.map((m) => {
          const reached = m.category === "done" || m.category === "canceled";
          const days = m.dueDate ? daysBetween(today, m.dueDate) : null;
          const missed = !reached && days !== null && days < 0;
          const state = reached
            ? { label: t("Reached"), icon: CircleCheck, className: "text-green-700 dark:text-green-400" }
            : missed
              ? { label: t.plural(-days!, "Missed by {count} day", "Missed by {count} days"), icon: AlertTriangle, className: "text-destructive" }
              : {
                  label: days === null ? t("No date") : days === 0 ? t("Today") : t.plural(days, "In {count} day", "In {count} days"),
                  icon: CalendarClock,
                  className: "text-muted-foreground",
                };
          return (
            <li key={m.id}>
              <Link href={taskHref(m.number)} className="flex items-center gap-3 px-5 py-3 text-sm transition-colors hover:bg-accent">
                <Diamond
                  aria-hidden
                  className={cn("size-3.5 shrink-0 fill-current", reached ? "text-green-600" : missed ? "text-destructive" : "text-brand-accent")}
                />
                <span className="w-24 shrink-0 text-xs text-muted-foreground tabular-nums">{formatDate(m.dueDate, t.intl)}</span>
                <span className={cn("min-w-0 flex-1 truncate font-medium", reached && "text-muted-foreground line-through")}>{m.title}</span>
                <span className={cn("flex shrink-0 items-center gap-1 text-xs font-medium", state.className)}>
                  <state.icon className="size-3.5" aria-hidden />
                  {state.label}
                </span>
              </Link>
            </li>
          );
        })}
      </ol>
    </Panel>
  );
}

/** The highest-scoring active risks (already sorted), with a link to the register. */
export async function RisksPanel({
  risks,
  total,
  href,
}: {
  risks: { id: string; number: number; title: string; likelihood: number; impact: number; ownerName: string | null }[];
  total: number;
  href: string;
}) {
  const t = await getT();
  return (
    <Panel
      id="risks-heading"
      title={t("Top risks")}
      icon={ShieldAlert}
      count={total || undefined}
      action={
        <Link href={href} className="text-sm font-medium text-primary underline-offset-4 hover:underline">
          {total > 0 ? t.plural(total, "View {count} active risk", "View all {count} active risks") : t("Risk register")}
        </Link>
      }
    >
      {risks.length === 0 ? (
        <p className="flex items-center gap-3 px-5 pb-5 text-sm text-muted-foreground">
          <span aria-hidden className="grid size-9 place-items-center rounded-xl bg-primary/10 text-primary">
            <ShieldAlert className="size-4.5" />
          </span>
          {t("No active risks. Add what could delay the project or raise its cost.")}
        </p>
      ) : (
        <ol className="grid divide-y border-t">
          {risks.map((r) => (
            <li key={r.id}>
              <Link href={`${href}?risk=${r.id}`} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-5 py-3 text-sm transition-colors hover:bg-accent">
                <RiskLevelBadge likelihood={r.likelihood} impact={r.impact} t={t} />
                <span className="min-w-0 flex-1 truncate font-medium">
                  <span className="font-mono text-xs text-muted-foreground">R-{r.number}</span> {r.title}
                </span>
                <span className="text-xs text-muted-foreground">{r.ownerName ?? t("No owner")}</span>
              </Link>
            </li>
          ))}
        </ol>
      )}
    </Panel>
  );
}
