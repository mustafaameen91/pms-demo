import Link from "next/link";
import { AlertTriangle, CalendarClock, CircleCheck, Diamond, Wallet } from "lucide-react";
import type { BudgetSummary } from "@/lib/budget";
import { daysBetween } from "@/lib/schedule";
import { cn, formatDate, formatMoney } from "@/lib/utils";

type DeadlineRow = { id: string; number: number; title: string; dueDate: string | null };

/** Budget / spent / remaining for the project Overview. */
export function MoneyPanel({
  summary,
  currency,
  href,
  overPlanCount,
}: {
  summary: BudgetSummary;
  currency: string;
  href: string;
  overPlanCount: number;
}) {
  const money = (v: number) => formatMoney(v, currency);
  const pct = summary.usedPct === null ? null : Math.min(100, summary.usedPct);
  return (
    <section aria-labelledby="money-heading" className="flex flex-col rounded-xl border bg-card p-5">
      <div className="flex items-center justify-between gap-2">
        <h2 id="money-heading" className="flex items-center gap-2 font-semibold">
          <Wallet className="size-4 text-muted-foreground" aria-hidden />
          Money
        </h2>
        <Link href={href} className="text-xs text-primary underline-offset-4 hover:underline">
          Expenses tab
        </Link>
      </div>

      <dl className="mt-4 grid grid-cols-3 gap-3">
        <div>
          <dt className="text-xs text-muted-foreground">Budget</dt>
          <dd className="mt-0.5 font-semibold">{summary.budget === null ? "—" : money(summary.budget)}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">Spent</dt>
          <dd className={cn("mt-0.5 font-semibold", summary.overBudget && "text-destructive")}>{money(summary.actual)}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">Remaining</dt>
          <dd className={cn("mt-0.5 font-semibold", (summary.remaining ?? 0) < 0 && "text-destructive")}>
            {summary.remaining === null ? "—" : money(summary.remaining)}
          </dd>
        </div>
      </dl>

      {pct !== null && (
        <div className="mt-4">
          <div
            role="meter"
            aria-label="Budget used"
            aria-valuenow={summary.usedPct ?? 0}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuetext={`${summary.usedPct}% of budget used`}
            className={cn("h-2 overflow-hidden rounded-full", summary.overBudget ? "bg-destructive/15" : "bg-primary/15")}
          >
            <div
              className={cn("h-full rounded-full", summary.overBudget ? "bg-destructive" : "bg-primary")}
              style={{ width: `${pct}%` }}
            />
          </div>
          <p className="mt-1.5 text-xs text-muted-foreground">{summary.usedPct}% of budget used</p>
        </div>
      )}

      <ul className="mt-4 grid gap-1.5 border-t pt-4 text-sm">
        {summary.overBudget && (
          <li className="flex items-center gap-2 font-medium text-destructive">
            <AlertTriangle className="size-4 shrink-0" aria-hidden />
            Over budget by {money(-(summary.remaining ?? 0))}
          </li>
        )}
        {summary.tasks.filter((t) => t.overBudget).length > 0 && (
          <li className="flex items-center gap-2 text-destructive">
            <AlertTriangle className="size-4 shrink-0" aria-hidden />
            {summary.tasks.filter((t) => t.overBudget).length} task(s) over their budget
          </li>
        )}
        {overPlanCount > 0 && (
          <li className="flex items-center gap-2 text-amber-700 dark:text-amber-400">
            <AlertTriangle className="size-4 shrink-0" aria-hidden />
            {overPlanCount} resource(s) used more than planned
          </li>
        )}
        <li className="flex justify-between text-muted-foreground">
          <span>Still owed to suppliers &amp; workers</span>
          <span className="font-medium text-foreground tabular-nums">{money(summary.owedToResources)}</span>
        </li>
      </ul>
    </section>
  );
}

/** Late and upcoming tasks for the project Overview. */
export function DeadlinesPanel({
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
  return (
    <section aria-labelledby="deadlines-heading" className="flex flex-col rounded-xl border bg-card p-5">
      <h2 id="deadlines-heading" className="flex items-center gap-2 font-semibold">
        <CalendarClock className="size-4 text-muted-foreground" aria-hidden />
        Deadlines
      </h2>

      {late.length === 0 && upcoming.length === 0 ? (
        <p className="mt-4 flex items-center gap-2 text-sm text-muted-foreground">
          <CircleCheck className="size-4 text-primary" aria-hidden />
          Nothing late or due in the next 14 days.
        </p>
      ) : (
        <div className="mt-4 grid gap-4">
          {late.length > 0 && (
            <div>
              <h3 className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-destructive">
                <AlertTriangle className="size-3.5" aria-hidden />
                Late ({late.length})
              </h3>
              <DeadlineList rows={late} today={today} taskHref={taskHref} late />
            </div>
          )}
          {upcoming.length > 0 && (
            <div>
              <h3 className="mb-1.5 text-xs font-medium text-muted-foreground">Due in the next 14 days ({upcoming.length})</h3>
              <DeadlineList rows={upcoming} today={today} taskHref={taskHref} />
            </div>
          )}
        </div>
      )}
    </section>
  );
}

function DeadlineList({
  rows,
  today,
  taskHref,
  late,
}: {
  rows: DeadlineRow[];
  today: string;
  taskHref: (number: number) => string;
  late?: boolean;
}) {
  return (
    <ul className="grid divide-y rounded-lg border text-sm">
      {rows.slice(0, 6).map((r) => {
        const days = daysBetween(today, r.dueDate!);
        const when = late
          ? `${-days} ${-days === 1 ? "day" : "days"} late`
          : days === 0
            ? "Due today"
            : `In ${days} ${days === 1 ? "day" : "days"}`;
        return (
          <li key={r.id}>
            <Link href={taskHref(r.number)} className="flex items-center gap-3 px-3 py-2 hover:bg-accent/50">
              <span className="min-w-0 flex-1 truncate">{r.title}</span>
              <span className="text-xs whitespace-nowrap text-muted-foreground tabular-nums">{formatDate(r.dueDate)}</span>
              <span className={cn("w-24 text-right text-xs whitespace-nowrap", late ? "font-medium text-destructive" : "text-muted-foreground")}>
                {when}
              </span>
            </Link>
          </li>
        );
      })}
      {rows.length > 6 && <li className="px-3 py-2 text-xs text-muted-foreground">and {rows.length - 6} more</li>}
    </ul>
  );
}

/** Key dates of the project: reached, upcoming or missed. */
export function MilestonesPanel({
  milestones,
  today,
  taskHref,
}: {
  milestones: { id: string; number: number; title: string; dueDate: string | null; category: string }[];
  today: string;
  taskHref: (number: number) => string;
}) {
  if (milestones.length === 0) return null;
  const sorted = [...milestones].sort((a, b) => (a.dueDate ?? "9999").localeCompare(b.dueDate ?? "9999"));
  return (
    <section aria-labelledby="milestones-heading" className="rounded-xl border bg-card p-5">
      <h2 id="milestones-heading" className="flex items-center gap-2 font-semibold">
        <Diamond className="size-4 fill-current text-brand-accent" aria-hidden />
        Milestones
      </h2>
      <ol className="mt-4 grid gap-2">
        {sorted.map((m) => {
          const reached = m.category === "done" || m.category === "canceled";
          const days = m.dueDate ? daysBetween(today, m.dueDate) : null;
          const missed = !reached && days !== null && days < 0;
          const state = reached
            ? { label: "Reached", icon: CircleCheck, className: "text-green-700 dark:text-green-400" }
            : missed
              ? { label: `Missed by ${-days!} ${-days! === 1 ? "day" : "days"}`, icon: AlertTriangle, className: "text-destructive" }
              : {
                  label: days === null ? "No date" : days === 0 ? "Today" : `In ${days} ${days === 1 ? "day" : "days"}`,
                  icon: CalendarClock,
                  className: "text-muted-foreground",
                };
          return (
            <li key={m.id}>
              <Link href={taskHref(m.number)} className="flex items-center gap-3 rounded-lg border px-3 py-2 text-sm hover:bg-accent/50">
                <span className="w-24 shrink-0 text-xs text-muted-foreground tabular-nums">{formatDate(m.dueDate)}</span>
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
    </section>
  );
}
