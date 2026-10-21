/** Weekly report rules (pure). Weeks run Saturday–Friday, like timesheets. */
import { addDays, weekStartOf } from "@/lib/timesheets";
import type { CostHealth } from "@/lib/forecast";

/** The last full week before `today`: the report that is due. */
export function reportWeek(today: string) {
  const start = addDays(weekStartOf(today), -7);
  return { start, end: addDays(start, 6) };
}

export type ReportProject = {
  id: string;
  key: string;
  name: string;
  leadId: string | null;
  currency: string;
  /** Accomplishment 0–100 now, and the change since the previous report (points), when there is one. */
  actual: number | null;
  change: number | null;
  planned: number | null;
  schedule: "ahead" | "on_track" | "behind" | null;
  budget: number | null;
  spent: number;
  spentThisWeek: number;
  overBudget: boolean;
  forecast: { final: number; overBy: number | null; overPct: number | null; health: CostHealth | null; early: boolean } | null;
  late: { number: number; title: string; dueDate: string }[];
  lateCount: number;
  done: { number: number; title: string }[];
  doneCount: number;
  risks: { number: number; title: string; likelihood: number; impact: number }[];
  newRisks: number;
};

export type WeeklyReportData = { start: string; end: string; projects: ReportProject[] };

/** Progress since last week, in points (null when there is nothing to compare with). */
export function progressChange(now: number | null, before: number | null | undefined) {
  if (now === null || before === null || before === undefined) return null;
  return Math.round((now - before) * 10) / 10;
}

/** The numbers in the inbox line: what needs attention across these projects. */
export function headline(projects: ReportProject[]) {
  return {
    projects: projects.length,
    behind: projects.filter((p) => p.schedule === "behind").length,
    overBudget: projects.filter((p) => p.overBudget).length,
    headingOver: projects.filter((p) => !p.overBudget && p.forecast && !p.forecast.early && (p.forecast.health === "watch" || p.forecast.health === "bad")).length,
    late: projects.reduce((s, p) => s + p.lateCount, 0),
    done: projects.reduce((s, p) => s + p.doneCount, 0),
  };
}
