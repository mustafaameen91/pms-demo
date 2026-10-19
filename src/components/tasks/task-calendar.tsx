import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { BoardStatus, BoardTask } from "@/lib/data/projects";
import { todayISO } from "@/lib/accomplishment";
import { addDaysISO, weekStart } from "@/lib/workload";
import { cn } from "@/lib/utils";
import { MilestoneIcon, StatusDot } from "./task-bits";

const MAX_PER_DAY = 3;

/** Month grid with tasks on their end date (milestones on their date). */
export function TaskCalendar({
  projectKey,
  month,
  statuses,
  tasks,
}: {
  projectKey: string;
  /** "YYYY-MM" */
  month: string;
  statuses: BoardStatus[];
  tasks: BoardTask[];
}) {
  const today = todayISO();
  const [y, m] = month.split("-").map(Number);
  const first = `${month}-01`;
  const last = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
  const gridStart = weekStart(first);
  const gridEnd = addDaysISO(weekStart(last), 6);
  const days: string[] = [];
  for (let d = gridStart; d <= gridEnd; d = addDaysISO(d, 1)) days.push(d);

  const statusById = new Map(statuses.map((s) => [s.id, s]));
  const byDay = new Map<string, BoardTask[]>();
  for (const t of tasks) {
    if (!t.dueDate || t.dueDate < gridStart || t.dueDate > gridEnd) continue;
    byDay.set(t.dueDate, [...(byDay.get(t.dueDate) ?? []), t]);
  }
  const unscheduled = tasks.filter((t) => !t.dueDate).length;
  const monthLabel = new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString(undefined, { month: "long", year: "numeric", timeZone: "UTC" });
  const shift = (n: number) => {
    const d = new Date(Date.UTC(y, m - 1 + n, 1));
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
  };
  const href = (mo: string) => `?view=calendar&month=${mo}`;
  const weekdays = Array.from({ length: 7 }, (_, i) =>
    new Date(Date.UTC(2024, 0, 1 + i)).toLocaleDateString(undefined, { weekday: "short", timeZone: "UTC" }),
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col px-4 py-4 sm:px-6">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <h2 className="me-2 text-lg font-semibold" aria-live="polite">
          {monthLabel}
        </h2>
        <Link href={href(shift(-1))} scroll={false} aria-label="Previous month" className="grid size-8 place-items-center rounded-md border hover:bg-accent">
          <ChevronLeft className="size-4 rtl:-scale-x-100" />
        </Link>
        <Link href={href(today.slice(0, 7))} scroll={false} className="flex h-8 items-center rounded-md border px-3 text-sm hover:bg-accent">
          Today
        </Link>
        <Link href={href(shift(1))} scroll={false} aria-label="Next month" className="grid size-8 place-items-center rounded-md border hover:bg-accent">
          <ChevronRight className="size-4 rtl:-scale-x-100" />
        </Link>
        {unscheduled > 0 && (
          <span className="ms-auto text-xs text-muted-foreground">
            {unscheduled} {unscheduled === 1 ? "task has" : "tasks have"} no end date
          </span>
        )}
      </div>

      <div className="relative overflow-x-auto">
        <div role="grid" aria-label={`Tasks in ${monthLabel}`} className="grid min-w-[760px] grid-cols-7 overflow-hidden rounded-xl border">
          <div role="row" className="contents">
            {weekdays.map((w) => (
              <div key={w} role="columnheader" className="border-b bg-muted/40 px-2 py-1.5 text-xs font-medium text-muted-foreground">
                {w}
              </div>
            ))}
          </div>
          {Array.from({ length: days.length / 7 }, (_, row) => (
            <div key={row} role="row" className="contents">
              {days.slice(row * 7, row * 7 + 7).map((d) => {
                const list = byDay.get(d) ?? [];
                const inMonth = d.slice(0, 7) === month;
                const isToday = d === today;
                return (
                  <div
                    key={d}
                    role="gridcell"
                    aria-label={`${d}: ${list.length} ${list.length === 1 ? "task" : "tasks"}`}
                    className={cn("min-h-28 border-e border-b p-1.5 last:border-e-0 [&:nth-child(7n)]:border-e-0", !inMonth && "bg-muted/30")}
                  >
                    <div className={cn("mb-1 flex size-6 items-center justify-center rounded-full text-xs tabular-nums", isToday ? "font-semibold ring-2 ring-brand-accent" : inMonth ? "text-foreground" : "text-muted-foreground")}>
                      {Number(d.slice(8))}
                    </div>
                    <ul className="grid gap-1">
                      {list.slice(0, MAX_PER_DAY).map((t) => {
                        const st = statusById.get(t.statusId);
                        const done = st?.category === "done" || st?.category === "canceled";
                        const late = !done && d < today;
                        return (
                          <li key={t.id}>
                            <Link
                              href={`?view=calendar&month=${month}&task=${projectKey}-${t.number}`}
                              scroll={false}
                              className={cn(
                                "flex items-center gap-1 truncate rounded px-1.5 py-0.5 text-xs hover:bg-accent",
                                late ? "bg-destructive/10 text-destructive" : "bg-muted",
                                done && "text-muted-foreground line-through",
                              )}
                              title={`${projectKey}-${t.number} ${t.title}${late ? " (late)" : ""}`}
                            >
                              {t.isMilestone ? <MilestoneIcon className="size-3" /> : st && <StatusDot color={st.color} className="size-1.5" />}
                              <span className="truncate">{t.title}</span>
                              {late && <span className="sr-only">(late)</span>}
                            </Link>
                          </li>
                        );
                      })}
                      {list.length > MAX_PER_DAY && (
                        <li className="px-1.5 text-xs text-muted-foreground">+{list.length - MAX_PER_DAY} more</li>
                      )}
                    </ul>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
