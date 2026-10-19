import Link from "next/link";
import { ListTree } from "lucide-react";
import type { BoardStatus, BoardTask } from "@/lib/data/projects";
import { cn, formatMoney } from "@/lib/utils";
import { QuickAddTask } from "./quick-add-task";
import { ProgressBar, StatusDot, UserAvatar, formatDue } from "./task-bits";

export function TaskTable({
  projectId,
  projectKey,
  currency,
  statuses,
  tasks,
  accomplishment,
}: {
  projectId: string;
  projectKey: string;
  currency: string;
  statuses: BoardStatus[];
  tasks: BoardTask[];
  /** Project accomplishment % (see lib/accomplishment). */
  accomplishment: number | null;
}) {
  const statusById = new Map(statuses.map((s) => [s.id, s]));
  const ordered = [...tasks].sort(
    (a, b) =>
      (statusById.get(a.statusId)?.position ?? 0) - (statusById.get(b.statusId)?.position ?? 0) ||
      a.position - b.position,
  );
  const totalWeight = tasks.reduce((sum, t) => sum + (t.weight ? Number(t.weight) : 0), 0);
  const totalBudget = tasks.reduce((sum, t) => sum + (t.budget ? Number(t.budget) : 0), 0);
  const fmtPct = (n: number) => `${Number.isInteger(n) ? n : n.toFixed(2)}%`;

  return (
    <div className="flex-1 overflow-auto pb-10">
      <table className="w-full min-w-[1040px] border-collapse text-sm">
        <thead className="sticky top-0 z-10 bg-muted/80 text-left text-xs text-muted-foreground backdrop-blur">
          <tr className="border-b">
            <th scope="col" className="w-[34%] py-2 pr-3 pl-4 font-medium sm:pl-6">Task</th>
            <th scope="col" className="px-3 py-2 font-medium">Status</th>
            <th scope="col" className="px-3 py-2 text-right font-medium">Weight</th>
            <th scope="col" className="w-40 px-3 py-2 font-medium">Progress</th>
            <th scope="col" className="px-3 py-2 font-medium">Start</th>
            <th scope="col" className="px-3 py-2 font-medium">End</th>
            <th scope="col" className="px-3 py-2 text-right font-medium">Budget</th>
            <th scope="col" className="py-2 pr-4 pl-3 font-medium sm:pr-6">
              <span className="sr-only">Assignee</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {ordered.map((task) => {
            const key = `${projectKey}-${task.number}`;
            const status = statusById.get(task.statusId);
            const done = status?.category === "done" || status?.category === "canceled";
            const end = task.dueDate ? formatDue(task.dueDate, done) : null;
            const href = `?task=${key}`;
            // The whole row is clickable; the title link is the keyboard/screen-reader target.
            return (
              <tr key={task.id} className="group relative border-b transition-colors hover:bg-accent/50">
                <td className="max-w-0 py-2.5 pr-3 pl-4 sm:pl-6">
                  <Link
                    href={href}
                    scroll={false}
                    className="flex items-center gap-2 after:absolute after:inset-0 focus-visible:outline-none focus-visible:after:outline-2 focus-visible:after:outline-ring"
                  >
                    <span className="w-16 shrink-0 font-mono text-xs text-muted-foreground">{key}</span>
                    <span className={cn("truncate font-medium", done && "text-muted-foreground line-through")}>
                      {task.title}
                    </span>
                    {task.subtaskCount > 0 && (
                      <span
                        className="flex shrink-0 items-center gap-1 text-xs text-muted-foreground tabular-nums"
                        title={`${task.subtaskDone} of ${task.subtaskCount} sub-tasks done`}
                      >
                        <ListTree className="size-3.5" aria-hidden />
                        {task.subtaskDone}/{task.subtaskCount}
                        <span className="sr-only">sub-tasks done</span>
                      </span>
                    )}
                  </Link>
                </td>
                <td className="px-3 py-2.5 whitespace-nowrap">
                  {status && (
                    <span className="flex items-center gap-1.5">
                      <StatusDot color={status.color} />
                      {status.name}
                    </span>
                  )}
                </td>
                <td className="px-3 py-2.5 text-right tabular-nums">
                  {task.weight ? fmtPct(Number(task.weight)) : <span className="text-muted-foreground">—</span>}
                </td>
                <td className="px-3 py-2.5">
                  <ProgressBar value={task.progress} label={`${task.title} progress`} />
                </td>
                <td className="px-3 py-2.5 whitespace-nowrap tabular-nums text-muted-foreground">
                  {task.startDate ? formatDue(task.startDate, true).label : "—"}
                </td>
                <td
                  className={cn(
                    "px-3 py-2.5 whitespace-nowrap tabular-nums",
                    end?.overdue ? "font-medium text-destructive" : "text-muted-foreground",
                  )}
                >
                  {end ? (end.overdue ? `Overdue · ${end.label}` : end.label) : "—"}
                </td>
                <td className="px-3 py-2.5 text-right whitespace-nowrap tabular-nums">
                  {task.budget ? formatMoney(task.budget, currency) : <span className="text-muted-foreground">—</span>}
                </td>
                <td className="py-2.5 pr-4 pl-3 sm:pr-6">
                  {task.assigneeName && <UserAvatar name={task.assigneeName} image={task.assigneeImage} />}
                </td>
              </tr>
            );
          })}
        </tbody>
        {tasks.length > 0 && (
          <tfoot>
            <tr className="border-b bg-muted/40 text-xs text-muted-foreground">
              <th scope="row" className="py-2 pr-3 pl-4 text-left font-medium sm:pl-6">
                Total · {tasks.length} {tasks.length === 1 ? "task" : "tasks"}
              </th>
              <td />
              <td
                className={cn(
                  "px-3 py-2 text-right font-medium tabular-nums",
                  totalWeight > 100 ? "text-destructive" : "text-foreground",
                )}
              >
                {fmtPct(totalWeight)}
              </td>
              <td className="px-3 py-2">
                {accomplishment !== null && (
                  <ProgressBar value={Math.round(accomplishment)} label="Project accomplishment" />
                )}
              </td>
              <td colSpan={2} className="px-3 py-2 text-foreground">
                {accomplishment !== null && <span className="font-medium">Project accomplishment</span>}
              </td>
              <td className="px-3 py-2 text-right font-medium whitespace-nowrap text-foreground tabular-nums">
                {formatMoney(totalBudget, currency)}
              </td>
              <td />
            </tr>
          </tfoot>
        )}
      </table>

      {tasks.length === 0 && (
        <p className="px-4 pt-8 pb-2 text-center text-sm text-muted-foreground sm:px-6">
          No tasks yet. Add the main pieces of work for this project, then give each one a weight.
        </p>
      )}
      <div className="px-2 py-1 sm:px-4">
        <QuickAddTask projectId={projectId} className="max-w-xl" />
      </div>
    </div>
  );
}
