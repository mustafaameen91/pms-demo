/** Deadline helpers shared by dashboards (pure, no I/O). */

export type DeadlineTask = {
  dueDate: string | null;
  category: string;
};

const isOpen = (t: DeadlineTask) => t.category !== "done" && t.category !== "canceled";

/** Open tasks whose end date has passed. */
export function lateTasks<T extends DeadlineTask>(tasks: T[], today: string) {
  return tasks.filter((t) => isOpen(t) && t.dueDate !== null && t.dueDate < today);
}

/** Open tasks ending today or within the next `days` days. */
export function upcomingTasks<T extends DeadlineTask>(tasks: T[], today: string, days = 14) {
  const [y, m, d] = today.split("-").map(Number);
  const limit = new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
  return tasks
    .filter((t) => isOpen(t) && t.dueDate !== null && t.dueDate >= today && t.dueDate <= limit)
    .sort((a, b) => a.dueDate!.localeCompare(b.dueDate!));
}

/** Whole days from `from` to `to` (positive when `to` is later). */
export function daysBetween(from: string, to: string) {
  const ms = (s: string) => {
    const [y, m, d] = s.split("-").map(Number);
    return Date.UTC(y, m - 1, d);
  };
  return Math.round((ms(to) - ms(from)) / 86_400_000);
}
