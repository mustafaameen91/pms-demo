/** Recurring-task date math (pure). */
export type Recurrence = "daily" | "weekly" | "monthly" | "yearly";

export const RECURRENCE_LABELS: Record<Recurrence, string> = {
  daily: "Every day",
  weekly: "Every week",
  monthly: "Every month",
  yearly: "Every year",
};

/** Next date for a rule. Months/years clamp to the last valid day (Jan 31 → Feb 28). */
export function nextDate(iso: string, rule: Recurrence) {
  const [y, m, d] = iso.split("-").map(Number);
  if (rule === "daily" || rule === "weekly") {
    return new Date(Date.UTC(y, m - 1, d + (rule === "daily" ? 1 : 7))).toISOString().slice(0, 10);
  }
  const months = rule === "monthly" ? 1 : 12;
  const lastDay = new Date(Date.UTC(y, m - 1 + months + 1, 0)).getUTCDate();
  return new Date(Date.UTC(y, m - 1 + months, Math.min(d, lastDay))).toISOString().slice(0, 10);
}

/**
 * Dates for the next occurrence. The end date moves by one period (from today if
 * the task had none); the start keeps the same distance before the end.
 */
export function nextOccurrence(
  task: { startDate: string | null; dueDate: string | null },
  rule: Recurrence,
  today: string,
) {
  const due = nextDate(task.dueDate ?? today, rule);
  if (!task.startDate) return { startDate: null, dueDate: due };
  const span = task.dueDate
    ? Math.round((Date.parse(task.dueDate) - Date.parse(task.startDate)) / 86_400_000)
    : 0;
  const [y, m, d] = due.split("-").map(Number);
  const start = new Date(Date.UTC(y, m - 1, d - span)).toISOString().slice(0, 10);
  return { startDate: start, dueDate: due };
}
