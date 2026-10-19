/** Groups tasks by when they're due (pure). */
import { daysBetween } from "@/lib/schedule";

export type DueGroup = "overdue" | "today" | "week" | "later" | "none" | "done";

export const DUE_GROUP_LABELS: Record<DueGroup, string> = {
  overdue: "Overdue",
  today: "Due today",
  week: "Next 7 days",
  later: "Later",
  none: "No end date",
  done: "Finished",
};

export function dueGroup(t: { dueDate: string | null; category: string }, today: string): DueGroup {
  if (t.category === "done" || t.category === "canceled") return "done";
  if (!t.dueDate) return "none";
  const d = daysBetween(today, t.dueDate);
  if (d < 0) return "overdue";
  if (d === 0) return "today";
  if (d <= 7) return "week";
  return "later";
}
