import Link from "next/link";
import type { BoardStatus, BoardTask } from "@/lib/data/projects";
import { cn } from "@/lib/utils";
import { getT } from "@/i18n/server";
import { QuickAddTask } from "./quick-add-task";
import { BlockedBadge, MilestoneIcon, RepeatIcon, PriorityIcon, StatusDot, UserAvatar, formatDue, priorityLabel } from "./task-bits";

export async function TaskList({
  projectId,
  projectKey,
  statuses,
  tasks,
}: {
  projectId: string;
  projectKey: string;
  statuses: BoardStatus[];
  tasks: BoardTask[];
}) {
  const t = await getT();
  return (
    <div className="flex-1 overflow-y-auto pb-10">
      {statuses.map((status) => {
        const rows = tasks.filter((t) => t.statusId === status.id);
        const done = status.category === "done" || status.category === "canceled";
        return (
          <section key={status.id} aria-label={status.name}>
            <h2 className="sticky top-0 z-10 flex items-center gap-2 border-b bg-muted/70 px-4 py-2 text-sm font-medium backdrop-blur sm:px-6">
              <StatusDot color={status.color} />
              {status.name}
              <span className="text-xs font-normal text-muted-foreground tabular-nums">{rows.length}</span>
            </h2>
            <ul>
              {rows.map((task) => {
                const key = `${projectKey}-${task.number}`;
                const due = task.dueDate ? formatDue(task.dueDate, done, t.intl) : null;
                return (
                  <li key={task.id} className="border-b">
                    <Link
                      href={`?view=list&task=${key}`}
                      scroll={false}
                      className="flex h-10 items-center gap-3 px-4 text-sm transition-colors hover:bg-accent/50 focus-visible:bg-accent focus-visible:outline-none sm:px-6"
                    >
                      <PriorityIcon priority={task.priority} />
                      <span className="w-16 shrink-0 font-mono text-xs text-muted-foreground">{key}</span>
                      {task.isMilestone && <MilestoneIcon />}
                      <span className={cn("min-w-0 flex-1 truncate", done && "text-muted-foreground line-through")}>
                        {task.title}
                      </span>
                      {task.recurrence && <RepeatIcon rule={task.recurrence} />}
                      {!done && task.blockedBy > 0 && <BlockedBadge count={task.blockedBy} />}
                      <span className="sr-only">{t("Priority: {priority}", { priority: priorityLabel(task.priority, t) })}</span>
                      {due && (
                        <span
                          className={cn(
                            "hidden shrink-0 text-xs tabular-nums sm:inline",
                            due.overdue ? "font-medium text-destructive" : "text-muted-foreground",
                          )}
                        >
                          {due.overdue ? t("Overdue · {date}", { date: due.label }) : due.label}
                        </span>
                      )}
                      <span className="w-6 shrink-0">
                        {task.assigneeName && (
                          <UserAvatar name={task.assigneeName} image={task.assigneeImage} />
                        )}
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
            <div className="px-2 py-1 sm:px-4">
              <QuickAddTask projectId={projectId} statusId={status.id} className="max-w-xl" />
            </div>
          </section>
        );
      })}
    </div>
  );
}
