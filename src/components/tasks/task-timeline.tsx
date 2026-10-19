import Link from "next/link";
import { AlertTriangle, CalendarOff, Diamond } from "lucide-react";
import { startsTooEarly } from "@/lib/dependencies";
import type { BoardStatus, BoardTask } from "@/lib/data/projects";
import { todayISO } from "@/lib/accomplishment";
import { cn, formatDate } from "@/lib/utils";
import { StatusDot } from "./task-bits";

const DAY = 86_400_000;
const toMs = (iso: string) => {
  const [y, m, d] = iso.split("-").map(Number);
  return Date.UTC(y, m - 1, d);
};
const toISO = (ms: number) => new Date(ms).toISOString().slice(0, 10);
const LABEL_WIDTH = 260;
/** Row height incl. its 1px bottom border; arrows are positioned from it. */
const ROW_H = 41;

/**
 * Gantt-style view: one bar per main task from its start to its end date, filled
 * by its progress, with a "today" line. Scale adapts to the project's length.
 */
export function TaskTimeline({
  projectKey,
  projectStart,
  projectEnd,
  statuses,
  tasks,
  dependencies = [],
}: {
  projectKey: string;
  projectStart: string | null;
  projectEnd: string | null;
  statuses: BoardStatus[];
  tasks: BoardTask[];
  dependencies?: { taskId: string; dependsOnId: string }[];
}) {
  const today = todayISO();
  const statusById = new Map(statuses.map((s) => [s.id, s]));
  const scheduled = tasks
    .filter((t) => t.startDate || t.dueDate)
    .map((t) => {
      const start = t.startDate ?? t.dueDate!;
      const end = t.dueDate ?? t.startDate!;
      return { ...t, start: start <= end ? start : end, end: start <= end ? end : start };
    })
    .sort((a, b) => a.start.localeCompare(b.start) || a.end.localeCompare(b.end));
  const unscheduled = tasks.filter((t) => !t.startDate && !t.dueDate);

  if (scheduled.length === 0) {
    return (
      <div className="flex-1 px-4 py-12 text-center sm:px-6">
        <CalendarOff className="mx-auto mb-3 size-8 text-muted-foreground" aria-hidden />
        <p className="font-medium">No tasks on the timeline yet</p>
        <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
          Give tasks a start and end date (open a task in the Table view) and they&apos;ll appear here as bars.
        </p>
      </div>
    );
  }

  // Visible range: all task dates, the project dates and today, with a little padding.
  const dates = [...scheduled.flatMap((t) => [t.start, t.end]), today, projectStart, projectEnd].filter(Boolean) as string[];
  const rangeStart = Math.min(...dates.map(toMs)) - 3 * DAY;
  const rangeEnd = Math.max(...dates.map(toMs)) + 4 * DAY;
  const days = Math.round((rangeEnd - rangeStart) / DAY);
  const scale = days <= 60 ? "day" : days <= 240 ? "week" : "month";
  const pxPerDay = scale === "day" ? 28 : scale === "week" ? 9 : 3;
  const width = days * pxPerDay;
  const x = (iso: string) => ((toMs(iso) - rangeStart) / DAY) * pxPerDay;

  // Header: months on top, then days (day scale) or week starts (week scale).
  const months: { label: string; left: number; width: number }[] = [];
  const ticks: { label: string; left: number; strong: boolean }[] = [];
  for (let ms = rangeStart; ms < rangeEnd; ms += DAY) {
    const d = new Date(ms);
    const iso = toISO(ms);
    if (d.getUTCDate() === 1 || ms === rangeStart) {
      const nextMonth = Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1);
      months.push({
        label: d.toLocaleDateString(undefined, { month: "short", year: "numeric", timeZone: "UTC" }),
        left: x(iso),
        width: ((Math.min(nextMonth, rangeEnd) - ms) / DAY) * pxPerDay,
      });
    }
    if (scale === "day") ticks.push({ label: String(d.getUTCDate()), left: x(iso), strong: d.getUTCDay() === 1 });
    if (scale === "week" && d.getUTCDay() === 1) ticks.push({ label: String(d.getUTCDate()), left: x(iso), strong: true });
  }

  // Dependency arrows: from the end of the predecessor to the start of the task.
  const byId = new Map(tasks.map((t) => [t.id, t]));
  const waitsOn = new Map<string, string[]>();
  for (const d of dependencies) waitsOn.set(d.taskId, [...(waitsOn.get(d.taskId) ?? []), d.dependsOnId]);
  const rowOf = new Map(scheduled.map((t, i) => [t.id, i]));
  const arrows = dependencies.flatMap((d) => {
    const from = rowOf.get(d.dependsOnId);
    const to = rowOf.get(d.taskId);
    if (from === undefined || to === undefined) return [];
    const pred = scheduled[from];
    const succ = scheduled[to];
    const x1 = pred.isMilestone ? x(pred.end) + pxPerDay / 2 + 7 : x(pred.end) + pxPerDay;
    const x2 = succ.isMilestone ? x(succ.end) + pxPerDay / 2 - 8 : x(succ.start);
    const y1 = from * ROW_H + ROW_H / 2;
    const y2 = to * ROW_H + ROW_H / 2;
    const conflict = startsTooEarly(succ.isMilestone ? succ.end : succ.start, pred.end);
    const elbow = Math.max(x1 + 6, Math.min(x2 - 6, x1 + 12));
    const d2 = `M${x1},${y1} H${elbow} V${y2} H${x2 - 1}`;
    return [{ key: `${d.dependsOnId}-${d.taskId}`, d: d2, conflict }];
  });

  const todayX = x(today) + pxPerDay / 2;
  const endX = projectEnd ? x(projectEnd) + pxPerDay : null;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex-1 overflow-auto">
        <div className="relative" style={{ width: LABEL_WIDTH + width }}>
          {/* Header */}
          <div className="sticky top-0 z-20 flex border-b bg-background">
            <div className="sticky left-0 z-10 shrink-0 border-r bg-background px-4 py-2 text-xs font-medium text-muted-foreground sm:px-6" style={{ width: LABEL_WIDTH }}>
              Task
            </div>
            <div className="relative" style={{ width }}>
              <div className="relative h-6 border-b">
                {months.map((m) => (
                  <div key={m.left} className="absolute top-0 h-full truncate border-l px-1.5 text-xs leading-6 font-medium" style={{ left: m.left, width: m.width }}>
                    {m.label}
                  </div>
                ))}
              </div>
              <div className="relative h-6">
                {ticks.map((t) => (
                  <div
                    key={t.left}
                    className={cn("absolute top-0 h-full text-center text-[11px] leading-6 text-muted-foreground tabular-nums", t.strong && "font-medium text-foreground")}
                    style={{ left: t.left, width: scale === "day" ? pxPerDay : undefined }}
                  >
                    {t.label}
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Rows */}
          <ul aria-label="Scheduled tasks" className="relative">
            {arrows.length > 0 && (
              <svg
                aria-hidden
                className="pointer-events-none absolute top-0 z-[5] overflow-visible"
                style={{ left: LABEL_WIDTH, width, height: scheduled.length * ROW_H }}
              >
                <defs>
                  <marker id="dep-arrow" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto">
                    <path d="M0,0 L8,4 L0,8 z" fill="var(--muted-foreground)" />
                  </marker>
                  <marker id="dep-arrow-bad" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto">
                    <path d="M0,0 L8,4 L0,8 z" fill="var(--destructive)" />
                  </marker>
                </defs>
                {arrows.map((a) => (
                  <path
                    key={a.key}
                    d={a.d}
                    fill="none"
                    stroke={a.conflict ? "var(--destructive)" : "var(--muted-foreground)"}
                    strokeWidth={a.conflict ? 2 : 1.5}
                    strokeDasharray={a.conflict ? "4 3" : undefined}
                    markerEnd={`url(#${a.conflict ? "dep-arrow-bad" : "dep-arrow"})`}
                  />
                ))}
              </svg>
            )}
            {scheduled.map((t) => {
              const status = statusById.get(t.statusId);
              const done = status?.category === "done" || status?.category === "canceled";
              const late = !done && t.end < today;
              const left = x(t.start);
              const barWidth = Math.max(pxPerDay, x(t.end) + pxPerDay - left);
              const key = `${projectKey}-${t.number}`;
              const waits = (waitsOn.get(t.id) ?? []).map((id) => byId.get(id)?.title).filter(Boolean);
              const description = t.isMilestone
                ? `Milestone ${t.title}: ${formatDate(t.end)}${done ? ", reached" : late ? ", missed" : ""}`
                : `${t.title}: ${formatDate(t.start)} to ${formatDate(t.end)}, ${t.progress}% done${late ? ", late" : ""}${
                    waits.length ? `, waits on ${waits.join(", ")}` : ""
                  }`;
              if (t.isMilestone) {
                const cx = x(t.end) + pxPerDay / 2;
                return (
                  <li key={t.id} className="group flex border-b hover:bg-accent/40" style={{ height: ROW_H }}>
                    <Link
                      href={`?view=timeline&task=${key}`}
                      scroll={false}
                      className="sticky left-0 z-10 flex shrink-0 items-center gap-2 border-r bg-background px-4 py-2 text-sm group-hover:bg-accent sm:px-6"
                      style={{ width: LABEL_WIDTH }}
                      aria-label={description}
                    >
                      <Diamond className="size-3.5 shrink-0 fill-current text-brand-accent" aria-hidden />
                      <span className="shrink-0 font-mono text-xs whitespace-nowrap text-muted-foreground">{key}</span>
                      <span className={cn("truncate font-medium", done && "text-muted-foreground line-through")}>{t.title}</span>
                    </Link>
                    <div className="relative" style={{ width }}>
                      <span
                        aria-hidden
                        title={description}
                        className={cn(
                          "absolute top-1/2 size-3.5 -translate-x-1/2 -translate-y-1/2 rotate-45 rounded-[2px] ring-2 ring-background",
                          done ? "bg-green-600 dark:bg-green-500" : late ? "bg-destructive" : "bg-brand-accent",
                        )}
                        style={{ left: cx }}
                      />
                      <span aria-hidden className="absolute top-1/2 -translate-y-1/2 text-xs whitespace-nowrap text-muted-foreground" style={{ left: cx + 12 }}>
                        {formatDate(t.end)}
                      </span>
                    </div>
                  </li>
                );
              }
              return (
                <li key={t.id} className="group flex border-b hover:bg-accent/40" style={{ height: ROW_H }}>
                  <Link
                    href={`?view=timeline&task=${key}`}
                    scroll={false}
                    className="sticky left-0 z-10 flex shrink-0 items-center gap-2 border-r bg-background px-4 py-2 text-sm group-hover:bg-accent sm:px-6"
                    style={{ width: LABEL_WIDTH }}
                    aria-label={description}
                  >
                    {status && <StatusDot color={status.color} />}
                    <span className="shrink-0 font-mono text-xs whitespace-nowrap text-muted-foreground">{key}</span>
                    <span className={cn("truncate", done && "text-muted-foreground line-through")}>{t.title}</span>
                  </Link>
                  <div className="relative" style={{ width }}>
                    <Link
                      href={`?view=timeline&task=${key}`}
                      scroll={false}
                      // Mouse shortcut only; the row's label link is the keyboard/screen-reader target.
                      tabIndex={-1}
                      aria-hidden
                      title={description}
                      className={cn(
                        "absolute top-2 flex h-6 items-center overflow-hidden rounded-md transition-shadow hover:shadow-md",
                        done ? "bg-green-600/20 dark:bg-green-500/25" : late ? "bg-destructive/15 ring-1 ring-destructive" : "bg-primary/20",
                      )}
                      style={{ left, width: barWidth }}
                    >
                      <span
                        aria-hidden
                        className={cn("absolute inset-y-0 left-0", done ? "bg-green-600 dark:bg-green-500" : late ? "bg-destructive" : "bg-primary")}
                        style={{ width: `${t.progress}%` }}
                      />
                      {barWidth > 44 && (
                        <span className="relative z-10 flex items-center gap-1 px-2 text-xs font-medium text-foreground mix-blend-normal">
                          {late && <AlertTriangle className="size-3 text-destructive" aria-hidden />}
                          <span className="rounded bg-background/80 px-1 tabular-nums">{t.progress}%</span>
                        </span>
                      )}
                    </Link>
                  </div>
                </li>
              );
            })}
          </ul>

          {/* Today + project end lines, drawn over the rows */}
          {/* Above the sticky header (z-20) so the label stays visible. */}
          <div aria-hidden className="pointer-events-none absolute top-0 bottom-0 z-30" style={{ left: LABEL_WIDTH + todayX }}>
            <div className="h-full w-0.5 bg-brand-accent" />
            <span className="absolute top-1 left-1 rounded border border-brand-accent bg-background px-1 text-[10px] leading-4 font-medium text-foreground">
              Today
            </span>
          </div>
          {endX !== null && (
            <div aria-hidden className="pointer-events-none absolute top-12 bottom-0 z-10 border-l-2 border-dashed border-foreground/40" style={{ left: LABEL_WIDTH + endX }}>
              <span className="absolute top-0 left-1 text-[10px] whitespace-nowrap text-muted-foreground">Project end</span>
            </div>
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-x-5 gap-y-1 border-t px-4 py-2 text-xs text-muted-foreground sm:px-6">
        <span className="flex items-center gap-1.5"><span aria-hidden className="h-2.5 w-4 rounded-sm bg-primary" /> Done part of a task</span>
        <span className="flex items-center gap-1.5"><span aria-hidden className="h-2.5 w-4 rounded-sm bg-destructive/40 ring-1 ring-destructive" /> Late</span>
        <span className="flex items-center gap-1.5"><span aria-hidden className="h-2.5 w-4 rounded-sm bg-green-600" /> Finished</span>
        <span className="flex items-center gap-1.5"><span aria-hidden className="h-3 w-0.5 bg-brand-accent" /> Today</span>
        <span className="flex items-center gap-1.5"><span aria-hidden className="size-2.5 rotate-45 rounded-[1px] bg-brand-accent" /> Milestone</span>
        {arrows.length > 0 && (
          <span className="flex items-center gap-1.5"><span aria-hidden className="h-px w-4 bg-muted-foreground" />→ waits on · <span className="text-destructive">red = starts too early</span></span>
        )}
        {unscheduled.length > 0 && (
          <span className="ml-auto">
            {unscheduled.length} {unscheduled.length === 1 ? "task has" : "tasks have"} no dates and {unscheduled.length === 1 ? "isn't" : "aren't"} shown
          </span>
        )}
      </div>
    </div>
  );
}
