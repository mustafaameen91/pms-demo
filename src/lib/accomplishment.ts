/**
 * Project accomplishment, shared by every screen that shows it.
 *
 * - Actual %  = Σ(weight × progress) / Σ weight   (weighted average of main tasks)
 *              If no task has a weight, every task counts equally.
 * - Planned % = same weighting, using where each task *should* be today:
 *              0% before its start, 100% after its end, linear in between.
 *              Tasks without dates fall back to the project's dates; tasks with
 *              no dates at all are left out of the planned figure.
 * - Cancelled tasks and milestones are ignored.
 */
import { createT, type T } from "@/i18n/translate";

export type AccomplishmentTask = {
  weight: string | number | null;
  progress: number;
  startDate: string | null;
  dueDate: string | null;
  cancelled?: boolean;
  /** Milestones are key dates, not work: they never count toward the %. */
  isMilestone?: boolean;
};

export type ScheduleState = "ahead" | "on_track" | "behind";

export type Accomplishment = {
  /** 0–100, or null when the project has no tasks. */
  actual: number | null;
  /** 0–100, or null when no task (or the project) has dates. */
  planned: number | null;
  /** actual − planned, in percentage points. */
  variance: number | null;
  schedule: ScheduleState | null;
  /** "weighted" when at least one task has a weight. */
  mode: "weighted" | "equal" | "empty";
  totalWeight: number;
  taskCount: number;
  unweightedCount: number;
  /** Tasks included in the planned figure (have their own or project dates). */
  scheduledCount: number;
};

/** Points of slack before a project counts as ahead or behind. */
export const SCHEDULE_TOLERANCE = 5;

const DAY = 86_400_000;

function toDay(date: string) {
  const [y, m, d] = date.split("-").map(Number);
  return Date.UTC(y, m - 1, d) / DAY;
}

/** Where a task should be on `today` (0–100), or null if it has no usable dates. */
export function plannedProgress(start: string | null, end: string | null, today: string) {
  if (!start || !end) return null;
  const s = toDay(start);
  const e = toDay(end);
  const t = toDay(today);
  if (e < s) return null;
  if (t < s) return 0;
  if (t >= e) return 100;
  return ((t - s) / (e - s)) * 100;
}

/** Today's date as YYYY-MM-DD in the server/browser's local time. */
export function todayISO(now = new Date()) {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

const round1 = (n: number) => Math.round(n * 10) / 10;

export function computeAccomplishment(
  allTasks: AccomplishmentTask[],
  project: { startDate: string | null; endDate: string | null },
  today: string = todayISO(),
): Accomplishment {
  const tasks = allTasks.filter((t) => !t.cancelled && !t.isMilestone);
  const weightOf = (t: AccomplishmentTask) => (t.weight === null || t.weight === "" ? 0 : Number(t.weight));
  const totalWeight = tasks.reduce((sum, t) => sum + weightOf(t), 0);
  const mode = tasks.length === 0 ? "empty" : totalWeight > 0 ? "weighted" : "equal";
  // In "equal" mode every task weighs 1.
  const w = (t: AccomplishmentTask) => (mode === "weighted" ? weightOf(t) : 1);

  let actual: number | null = null;
  const denominator = tasks.reduce((sum, t) => sum + w(t), 0);
  if (denominator > 0) {
    actual = round1(tasks.reduce((sum, t) => sum + w(t) * t.progress, 0) / denominator);
  }

  let plannedSum = 0;
  let plannedWeight = 0;
  let scheduledCount = 0;
  for (const t of tasks) {
    const p = plannedProgress(t.startDate ?? project.startDate, t.dueDate ?? project.endDate, today);
    if (p === null) continue;
    scheduledCount++;
    plannedSum += w(t) * p;
    plannedWeight += w(t);
  }
  let planned = plannedWeight > 0 ? round1(plannedSum / plannedWeight) : null;
  // No tasks yet, but the project itself is scheduled.
  if (planned === null && tasks.length === 0) {
    const p = plannedProgress(project.startDate, project.endDate, today);
    planned = p === null ? null : round1(p);
  }

  const variance = actual !== null && planned !== null ? round1(actual - planned) : null;
  const schedule: ScheduleState | null =
    variance === null
      ? null
      : variance > SCHEDULE_TOLERANCE
        ? "ahead"
        : variance < -SCHEDULE_TOLERANCE
          ? "behind"
          : "on_track";

  return {
    actual,
    planned,
    variance,
    schedule,
    mode,
    totalWeight: round1(totalWeight),
    taskCount: tasks.length,
    unweightedCount: mode === "weighted" ? tasks.filter((t) => weightOf(t) === 0).length : 0,
    scheduledCount,
  };
}

/** Human-readable problems with the weights, or [] when they're fine. Pass the viewer's translator (English by default). */
export function weightWarnings(a: Accomplishment, t: T = createT("en", {})): string[] {
  if (a.mode === "empty") return [];
  if (a.mode === "equal") {
    return [t("No task has a weight yet, so every task counts equally. Give tasks weights that add up to 100%.")];
  }
  const warnings: string[] = [];
  const diff = round1(a.totalWeight - 100);
  // Numbers passed as text so they print exactly as computed (no grouping).
  if (diff < 0) warnings.push(t("Task weights add up to {total}%. Assign the remaining {rest}%.", { total: String(a.totalWeight), rest: String(-diff) }));
  if (diff > 0) warnings.push(t("Task weights add up to {total}%, which is {over}% over 100%.", { total: String(a.totalWeight), over: String(diff) }));
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
