import Link from "next/link";
import { ListTree } from "lucide-react";
import type { BoardStatus, BoardTask } from "@/lib/data/projects";
import { cn, formatMoney, formatNumber } from "@/lib/utils";
import { getT } from "@/i18n/server";
import { formatFieldValue, type FieldDef } from "@/lib/custom-fields";
import { QuickAddTask } from "./quick-add-task";
import { BlockedBadge, MilestoneIcon, RepeatIcon, ProgressBar, StatusDot, UserAvatar, formatDue } from "./task-bits";

export async function TaskTable({
  projectId,
  projectKey,
  currency,
  statuses,
  tasks,
  accomplishment,
  fields,
}: {
  projectId: string;
  projectKey: string;
  currency: string;
  statuses: BoardStatus[];
  tasks: BoardTask[];
  /** Project accomplishment % (see lib/accomplishment). */
  accomplishment: number | null;
  fields: FieldDef[];
}) {
  const t = await getT();
  const statusById = new Map(statuses.map((s) => [s.id, s]));
  const ordered = [...tasks].sort(
    (a, b) =>
      (statusById.get(a.statusId)?.position ?? 0) - (statusById.get(b.statusId)?.position ?? 0) ||
      a.position - b.position,
  );
  const totalWeight = tasks.reduce((sum, t) => sum + (t.weight ? Number(t.weight) : 0), 0);
  const totalBudget = tasks.reduce((sum, t) => sum + (t.budget ? Number(t.budget) : 0), 0);
  const fmtPct = (n: number) => `${Number.isInteger(n) ? n : n.toFixed(2)}%`;
  // Checkbox and number values are formatted in the viewer's language; the rest is user data.
  const fieldText = (f: FieldDef, v: unknown) => {
    if (v === null || v === undefined || v === "") return "";
    if (f.type === "checkbox") return v ? t("Yes") : t("No");
    if (f.type === "number") return formatNumber(Number(v), t.intl, 3);
    return formatFieldValue(f, v);
  };

  return (
    <div className="flex-1 overflow-auto pb-10">
      <table className="w-full border-collapse text-sm" style={{ minWidth: 1040 + fields.length * 140 }}>
        <thead className="sticky top-0 z-10 bg-muted/80 text-start text-xs text-muted-foreground backdrop-blur">
          <tr className="border-b">
            <th scope="col" className="w-[34%] py-2 pe-3 ps-4 font-medium sm:ps-6">{t("Task")}</th>
            <th scope="col" className="px-3 py-2 font-medium">{t("Status")}</th>
            <th scope="col" className="px-3 py-2 text-end font-medium">{t("Weight")}</th>
            <th scope="col" className="w-40 px-3 py-2 font-medium">{t("Progress")}</th>
            <th scope="col" className="px-3 py-2 font-medium">{t("Start")}</th>
            <th scope="col" className="px-3 py-2 font-medium">{t("End")}</th>
            <th scope="col" className="px-3 py-2 text-end font-medium">{t("Budget")}</th>
            {fields.map((f) => (
              <th key={f.id} scope="col" className="max-w-40 truncate px-3 py-2 font-medium" title={f.name}>
                {f.name}
              </th>
            ))}
            <th scope="col" className="py-2 pe-4 ps-3 font-medium sm:pe-6">
              <span className="sr-only">{t("Assignee")}</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {ordered.map((task) => {
            const key = `${projectKey}-${task.number}`;
            const status = statusById.get(task.statusId);
            const done = status?.category === "done" || status?.category === "canceled";
            const end = task.dueDate ? formatDue(task.dueDate, done, t.intl) : null;
            const href = `?task=${key}`;
            // The whole row is clickable; the title link is the keyboard/screen-reader target.
            return (
              <tr key={task.id} className="group relative border-b transition-colors hover:bg-accent/50">
                <td className="max-w-0 py-2.5 pe-3 ps-4 sm:ps-6">
                  <Link
                    href={href}
                    scroll={false}
                    className="flex items-center gap-2 after:absolute after:inset-0 focus-visible:outline-none focus-visible:after:outline-2 focus-visible:after:outline-ring"
                  >
                    <span className="w-16 shrink-0 font-mono text-xs text-muted-foreground">{key}</span>
                    {task.isMilestone && <MilestoneIcon />}
                    <span className={cn("truncate font-medium", done && "text-muted-foreground line-through")}>
                      {task.title}
                    </span>
                    {task.recurrence && <RepeatIcon rule={task.recurrence} />}
                    {!done && task.blockedBy > 0 && <BlockedBadge count={task.blockedBy} />}
                    {task.subtaskCount > 0 && (
                      <span
                        className="flex shrink-0 items-center gap-1 text-xs text-muted-foreground tabular-nums"
                        title={t("{done} of {total} sub-tasks done", { done: task.subtaskDone, total: task.subtaskCount })}
                      >
                        <ListTree className="size-3.5" aria-hidden />
                        {task.subtaskDone}/{task.subtaskCount}
                        <span className="sr-only">{t("sub-tasks done")}</span>
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
                <td className="px-3 py-2.5 text-end tabular-nums">
                  {task.weight ? fmtPct(Number(task.weight)) : <span className="text-muted-foreground">—</span>}
                </td>
                <td className="px-3 py-2.5">
                  {task.isMilestone ? (
                    <span className="text-xs text-muted-foreground">{done ? t("Reached") : t("Milestone")}</span>
                  ) : (
                    <ProgressBar value={task.progress} label={t("{title} progress", { title: task.title })} />
                  )}
                </td>
                <td className="px-3 py-2.5 whitespace-nowrap tabular-nums text-muted-foreground">
                  {task.startDate ? formatDue(task.startDate, true, t.intl).label : "—"}
                </td>
                <td
                  className={cn(
                    "px-3 py-2.5 whitespace-nowrap tabular-nums",
                    end?.overdue ? "font-medium text-destructive" : "text-muted-foreground",
                  )}
                >
                  {end ? (end.overdue ? t("Overdue · {date}", { date: end.label }) : end.label) : "—"}
                </td>
                <td className="px-3 py-2.5 text-end whitespace-nowrap tabular-nums">
                  {task.budget ? formatMoney(task.budget, currency, t.intl) : <span className="text-muted-foreground">—</span>}
                </td>
                {fields.map((f) => (
                  <td key={f.id} className="max-w-40 truncate px-3 py-2.5 text-muted-foreground">
                    {fieldText(f, task.customFields?.[f.id]) || "—"}
                  </td>
                ))}
                <td className="py-2.5 pe-4 ps-3 sm:pe-6">
                  {task.assigneeName && <UserAvatar name={task.assigneeName} image={task.assigneeImage} />}
                </td>
              </tr>
            );
          })}
        </tbody>
        {tasks.length > 0 && (
          <tfoot>
            <tr className="border-b bg-muted/40 text-xs text-muted-foreground">
              <th scope="row" className="py-2 pe-3 ps-4 text-start font-medium sm:ps-6">
                {t.plural(tasks.length, "Total · {count} task", "Total · {count} tasks")}
              </th>
              <td />
              <td
                className={cn(
                  "px-3 py-2 text-end font-medium tabular-nums",
                  totalWeight > 100 ? "text-destructive" : "text-foreground",
                )}
              >
                {fmtPct(totalWeight)}
              </td>
              <td className="px-3 py-2">
                {accomplishment !== null && (
                  <ProgressBar value={Math.round(accomplishment)} label={t("Project accomplishment")} />
                )}
              </td>
              <td colSpan={2} className="px-3 py-2 text-foreground">
                {accomplishment !== null && <span className="font-medium">{t("Project accomplishment")}</span>}
              </td>
              <td className="px-3 py-2 text-end font-medium whitespace-nowrap text-foreground tabular-nums">
                {formatMoney(totalBudget, currency, t.intl)}
              </td>
              {fields.map((f) => (
                <td key={f.id} />
              ))}
              <td />
            </tr>
          </tfoot>
        )}
      </table>

      {tasks.length === 0 && (
        <p className="px-4 pt-8 pb-2 text-center text-sm text-muted-foreground sm:px-6">
          {t("No tasks yet. Add the main pieces of work for this project, then give each one a weight.")}
        </p>
      )}
      <div className="px-2 py-1 sm:px-4">
        <QuickAddTask projectId={projectId} className="max-w-xl" />
      </div>
    </div>
  );
}
