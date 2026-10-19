import Link from "next/link";
import type { Metadata } from "next";
import { CheckSquare } from "lucide-react";
import { requireWorkspace } from "@/lib/auth/session";
import { listMyTasks } from "@/lib/data/my-tasks";
import { todayISO } from "@/lib/accomplishment";
import { DUE_GROUP_LABELS, dueGroup, type DueGroup } from "@/lib/my-tasks-groups";
import { cn, formatDate } from "@/lib/utils";
import { MilestoneIcon, PriorityIcon, ProgressBar, StatusDot } from "@/components/tasks/task-bits";

export const metadata: Metadata = { title: "My tasks" };

const ORDER: DueGroup[] = ["overdue", "today", "week", "later", "none", "done"];

export default async function MyTasksPage({ params, searchParams }: PageProps<"/w/[slug]/my-tasks">) {
  const [{ slug }, query] = await Promise.all([params, searchParams]);
  const { user, workspace } = await requireWorkspace(slug);
  const showDone = query.done === "1";
  const today = todayISO();
  const all = await listMyTasks(workspace.id, user.id);
  const groups = new Map<DueGroup, typeof all>();
  for (const t of all) {
    const g = dueGroup(t, today);
    if (g === "done" && !showDone) continue;
    groups.set(g, [...(groups.get(g) ?? []), t]);
  }
  const open = all.filter((t) => dueGroup(t, today) !== "done").length;
  const base = `/w/${workspace.slug}`;

  return (
    <div className="mx-auto grid w-full max-w-4xl grid-cols-1 gap-5 px-4 py-6 sm:px-6 lg:py-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">My tasks</h1>
          <p className="text-sm text-muted-foreground">
            {open} open {open === 1 ? "task" : "tasks"} assigned to you across all projects.
          </p>
        </div>
        <Link href={showDone ? `${base}/my-tasks` : `${base}/my-tasks?done=1`} className="text-sm text-primary underline-offset-4 hover:underline">
          {showDone ? "Hide finished" : "Show finished"}
        </Link>
      </div>

      {all.length === 0 || (open === 0 && !showDone) ? (
        <div className="rounded-xl border border-dashed px-6 py-14 text-center">
          <CheckSquare className="mx-auto mb-3 size-8 text-muted-foreground" aria-hidden />
          <p className="font-medium">{all.length === 0 ? "Nothing assigned to you yet" : "All done!"}</p>
          <p className="mt-1 text-sm text-muted-foreground">Tasks assigned to you in any project show up here.</p>
        </div>
      ) : (
        ORDER.filter((g) => groups.has(g)).map((g) => (
          <section key={g} aria-labelledby={`grp-${g}`} className="overflow-hidden rounded-xl border bg-card">
            <h2 id={`grp-${g}`} className={cn("flex items-center gap-2 border-b px-4 py-2.5 text-sm font-semibold", g === "overdue" && "text-destructive")}>
              {DUE_GROUP_LABELS[g]}
              <span className="text-xs font-normal text-muted-foreground tabular-nums">{groups.get(g)!.length}</span>
            </h2>
            <ul className="divide-y">
              {groups.get(g)!.map((t) => {
                const key = `${t.projectKey}-${t.number}`;
                return (
                  <li key={t.id}>
                    <Link href={`${base}/p/${t.projectKey}?task=${key}`} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2.5 text-sm hover:bg-accent/50">
                      <PriorityIcon priority={t.priority} />
                      <span className="w-16 shrink-0 font-mono text-xs text-muted-foreground">{key}</span>
                      {t.isMilestone && <MilestoneIcon />}
                      <span className={cn("min-w-0 flex-1 truncate font-medium", g === "done" && "text-muted-foreground line-through")}>
                        {t.title}
                        {t.parentId && <span className="ms-1.5 text-xs font-normal text-muted-foreground">(sub-task)</span>}
                      </span>
                      <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <span aria-hidden className="size-2 rounded-sm" style={{ backgroundColor: t.projectColor }} />
                        {t.projectName}
                      </span>
                      <span className="flex w-24 items-center gap-1.5 text-xs">
                        <StatusDot color={t.statusColor} className="size-2" />
                        {t.statusName}
                      </span>
                      {!t.isMilestone && <ProgressBar value={t.progress} label={`${t.title} progress`} className="w-28" />}
                      <span className={cn("w-24 text-end text-xs tabular-nums", g === "overdue" ? "font-medium text-destructive" : "text-muted-foreground")}>
                        {t.dueDate ? formatDate(t.dueDate) : "—"}
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </section>
        ))
      )}
    </div>
  );
}
