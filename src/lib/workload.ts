/** Workload grid (pure): open tasks per person per week. */
import { daysBetween } from "@/lib/schedule";

export type WorkloadTask = {
  id: string;
  assigneeId: string | null;
  dueDate: string | null;
  category: string;
  isMilestone: boolean;
};

export type Column = { key: string; label: string; start?: string };

/** Monday of the week containing `iso`. */
export function weekStart(iso: string) {
  const [y, m, d] = iso.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  const back = (date.getUTCDay() + 6) % 7;
  date.setUTCDate(date.getUTCDate() - back);
  return date.toISOString().slice(0, 10);
}

export function addDaysISO(iso: string, n: number) {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

export function workloadColumns(today: string, weeks = 6): Column[] {
  const first = weekStart(today);
  return [
    { key: "overdue", label: "Overdue" },
    ...Array.from({ length: weeks }, (_, i) => {
      const start = addDaysISO(first, i * 7);
      return { key: start, label: start, start };
    }),
    { key: "later", label: "Later" },
    { key: "none", label: "No date" },
  ];
}

/** Column a task belongs to, or null if it shouldn't count (finished / milestone). */
export function columnFor(task: WorkloadTask, today: string, columns: Column[]) {
  if (task.isMilestone || task.category === "done" || task.category === "canceled") return null;
  if (!task.dueDate) return "none";
  if (task.dueDate < today) return "overdue";
  const weeks = columns.filter((c) => c.start);
  const lastEnd = addDaysISO(weeks[weeks.length - 1].start!, 6);
  if (task.dueDate > lastEnd) return "later";
  return weeks.find((w) => daysBetween(w.start!, task.dueDate!) >= 0 && daysBetween(w.start!, task.dueDate!) < 7)!.key;
}

/** Map of assignee ("" = unassigned) → column key → task ids. */
export function buildWorkload(tasks: WorkloadTask[], today: string, columns: Column[]) {
  const grid = new Map<string, Map<string, string[]>>();
  for (const t of tasks) {
    const col = columnFor(t, today, columns);
    if (!col) continue;
    const who = t.assigneeId ?? "";
    const row = grid.get(who) ?? new Map<string, string[]>();
    row.set(col, [...(row.get(col) ?? []), t.id]);
    grid.set(who, row);
  }
  return grid;
}
