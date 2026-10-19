import Link from "next/link";
import { notFound } from "next/navigation";
import { AlertTriangle, Info } from "lucide-react";
import { requireWorkspace } from "@/lib/auth/session";
import { getAccomplishmentTasks, getBoard, getProjectByKey } from "@/lib/data/projects";
import { getProjectResources } from "@/lib/data/resources";
import { getProjectExpenses } from "@/lib/data/expenses";
import { computeBudget } from "@/lib/budget";
import { lateTasks, upcomingTasks } from "@/lib/schedule";
import { DeadlinesPanel, MilestonesPanel, MoneyPanel } from "@/components/projects/overview-panels";
import {
  SCHEDULE_TOLERANCE,
  computeAccomplishment,
  plannedProgress,
  todayISO,
  weightWarnings,
} from "@/lib/accomplishment";
import { cn, formatDate } from "@/lib/utils";
import { AccomplishmentMeter, ScheduleBadge, fmtPct } from "@/components/projects/accomplishment";
import { StatusDot } from "@/components/tasks/task-bits";

export async function generateMetadata({ params }: PageProps<"/w/[slug]/p/[key]/overview">) {
  const { key } = await params;
  return { title: `Overview · ${key.toUpperCase()}` };
}

export default async function OverviewPage({ params }: PageProps<"/w/[slug]/p/[key]/overview">) {
  const { slug, key } = await params;
  const { workspace } = await requireWorkspace(slug);
  const project = await getProjectByKey(workspace.id, key);
  if (!project) notFound();

  const [rows, board, usages, expenseRows] = await Promise.all([
    getAccomplishmentTasks(project.id),
    getBoard(project.id),
    getProjectResources(project.id),
    getProjectExpenses(project.id),
  ]);
  const today = todayISO();
  const money = computeBudget(project.budget, usages, expenseRows, board.tasks);
  const overPlanCount = usages.filter((u) => Number(u.plannedQty) > 0 && Number(u.usedQty) > Number(u.plannedQty)).length;
  const a = computeAccomplishment(rows, project, today);
  const warnings = weightWarnings(a);
  const tasksHref = `/w/${workspace.slug}/p/${project.key}`;

  const weightOf = (w: string | null) => (a.mode === "weighted" ? (w ? Number(w) : 0) : 1);
  const denominator = rows.filter((r) => !r.cancelled && !r.isMilestone).reduce((s, r) => s + weightOf(r.weight), 0);

  return (
    <div className="mx-auto grid w-full max-w-5xl grid-cols-1 gap-6 px-4 py-6 sm:px-6">
      {/* Headline + KPIs */}
      <section aria-labelledby="accomplishment-heading" className="rounded-xl border bg-card p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 id="accomplishment-heading" className="text-sm font-medium text-muted-foreground">
              Accomplishment
            </h2>
            <p className="mt-1 text-5xl font-semibold tracking-tight">{fmtPct(a.actual)}</p>
          </div>
          <ScheduleBadge state={a.schedule} className="text-sm" />
        </div>

        <AccomplishmentMeter actual={a.actual} planned={a.planned} size="lg" label="Project accomplishment" className="mt-5" />
        <div className="mt-2 flex flex-wrap items-center gap-x-5 gap-y-1 text-xs text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <span aria-hidden className="h-2 w-4 rounded-full bg-primary" /> Done
          </span>
          {a.planned !== null && (
            <span className="flex items-center gap-1.5">
              <span aria-hidden className="h-3 w-0.5 rounded-full bg-foreground/70" /> Planned by today
            </span>
          )}
        </div>

        <dl className="mt-6 grid gap-4 border-t pt-5 sm:grid-cols-3">
          <div>
            <dt className="text-sm text-muted-foreground">Planned by today</dt>
            <dd className="mt-1 text-2xl font-semibold">{fmtPct(a.planned)}</dd>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {a.planned === null ? "Add start and end dates to tasks or the project" : `As of ${formatDate(today)}`}
            </p>
          </div>
          <div>
            <dt className="text-sm text-muted-foreground">Difference</dt>
            <dd
              className={cn(
                "mt-1 text-2xl font-semibold",
                a.schedule === "behind" && "text-destructive",
                a.schedule === "ahead" && "text-green-700 dark:text-green-400",
              )}
            >
              {a.variance === null ? "—" : `${a.variance > 0 ? "+" : ""}${fmtPct(a.variance)}`}
            </dd>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Done minus planned · ±{SCHEDULE_TOLERANCE}% counts as on track
            </p>
          </div>
          <div>
            <dt className="text-sm text-muted-foreground">Total task weight</dt>
            <dd
              className={cn(
                "mt-1 text-2xl font-semibold",
                a.mode === "weighted" && a.totalWeight !== 100 && "text-destructive",
              )}
            >
              {a.mode === "weighted" ? fmtPct(a.totalWeight) : "—"}
            </dd>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {a.taskCount} {a.taskCount === 1 ? "task" : "tasks"}
              {project.startDate || project.endDate
                ? ` · ${formatDate(project.startDate)} → ${formatDate(project.endDate)}`
                : ""}
            </p>
          </div>
        </dl>
      </section>

      {warnings.length > 0 && (
        <div role="status" className="grid gap-1.5 rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm">
          {warnings.map((w) => (
            <p key={w} className="flex gap-2">
              <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-600 dark:text-amber-400" aria-hidden />
              <span>
                {w}{" "}
                <Link href={tasksHref} className="font-medium text-primary underline-offset-4 hover:underline">
                  Edit weights
                </Link>
              </span>
            </p>
          ))}
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <MoneyPanel
          summary={money}
          currency={project.currency}
          href={`${tasksHref}/expenses`}
          overPlanCount={overPlanCount}
        />
        <DeadlinesPanel
          late={lateTasks(rows, today)}
          upcoming={upcomingTasks(rows, today)}
          today={today}
          taskHref={(n) => `${tasksHref}?task=${project.key}-${n}`}
        />
      </div>

      <MilestonesPanel
        milestones={rows.filter((r) => r.isMilestone)}
        today={today}
        taskHref={(n) => `${tasksHref}?task=${project.key}-${n}`}
      />

      {/* Per-task breakdown */}
      <section aria-labelledby="breakdown-heading" className="rounded-xl border bg-card">
        <div className="flex items-center justify-between gap-4 px-5 pt-5 sm:px-6">
          <h2 id="breakdown-heading" className="font-semibold">
            How each task contributes
          </h2>
          {a.mode !== "empty" && (
            <p className="hidden items-center gap-1.5 text-xs text-muted-foreground sm:flex">
              <Info className="size-3.5" aria-hidden />
              Contribution = weight × progress
            </p>
          )}
        </div>

        {rows.length === 0 ? (
          <p className="px-5 py-10 text-center text-sm text-muted-foreground sm:px-6">
            No tasks yet.{" "}
            <Link href={tasksHref} className="font-medium text-primary underline-offset-4 hover:underline">
              Add tasks
            </Link>{" "}
            to start tracking accomplishment.
          </p>
        ) : (
          <div className="relative mt-3 overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead className="text-start text-xs text-muted-foreground">
                <tr className="border-y bg-muted/40">
                  <th scope="col" className="w-2/5 py-2 pe-3 ps-5 font-medium sm:ps-6">Task</th>
                  <th scope="col" className="px-3 py-2 text-end font-medium">Weight</th>
                  <th scope="col" className="w-64 px-3 py-2 font-medium">Progress vs planned</th>
                  <th scope="col" className="px-3 py-2 text-end font-medium">Contributes</th>
                  <th scope="col" className="py-2 pe-5 ps-3 font-medium sm:pe-6">Schedule</th>
                </tr>
              </thead>
              <tbody>
                {rows.filter((r) => !r.isMilestone).map((r) => {
                  const planned = plannedProgress(
                    r.startDate ?? project.startDate,
                    r.dueDate ?? project.endDate,
                    today,
                  );
                  const contributes =
                    r.cancelled || denominator === 0 ? null : (weightOf(r.weight) * r.progress) / denominator;
                  const state =
                    r.cancelled || planned === null
                      ? null
                      : r.progress - planned > SCHEDULE_TOLERANCE
                        ? "ahead"
                        : r.progress - planned < -SCHEDULE_TOLERANCE
                          ? "behind"
                          : "on_track";
                  return (
                    <tr key={r.id} className={cn("border-b last:border-b-0", r.cancelled && "text-muted-foreground")}>
                      <td className="max-w-0 py-2.5 pe-3 ps-5 sm:ps-6">
                        <Link
                          href={`${tasksHref}?task=${project.key}-${r.number}`}
                          className="flex items-center gap-2 hover:underline"
                        >
                          <StatusDot color={r.statusColor} />
                          <span className="font-mono text-xs text-muted-foreground">
                            {project.key}-{r.number}
                          </span>
                          <span className="truncate font-medium">{r.title}</span>
                        </Link>
                      </td>
                      <td className="px-3 py-2.5 text-end tabular-nums">
                        {r.weight ? fmtPct(Number(r.weight)) : "—"}
                      </td>
                      <td className="px-3 py-2.5">
                        <div className="flex items-center gap-2">
                          <AccomplishmentMeter
                            actual={r.progress}
                            planned={r.cancelled ? null : planned === null ? null : Math.round(planned)}
                            size="sm"
                            label={`${r.title} progress`}
                            className="flex-1"
                          />
                          <span className="w-20 text-end text-xs text-muted-foreground tabular-nums">
                            {r.progress}%{planned !== null && !r.cancelled ? ` / ${Math.round(planned)}%` : ""}
                          </span>
                        </div>
                      </td>
                      <td className="px-3 py-2.5 text-end font-medium tabular-nums">
                        {r.cancelled ? "Cancelled" : contributes === null ? "—" : fmtPct(Math.round(contributes * 10) / 10)}
                      </td>
                      <td className="py-2.5 pe-5 ps-3 sm:pe-6">
                        {!r.cancelled && <ScheduleBadge state={state} short />}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="border-t bg-muted/40 text-xs">
                  <th scope="row" className="py-2 pe-3 ps-5 text-start font-medium sm:ps-6">
                    Project
                  </th>
                  <td className="px-3 py-2 text-end font-medium tabular-nums">
                    {a.mode === "weighted" ? fmtPct(a.totalWeight) : "—"}
                  </td>
                  <td className="px-3 py-2 text-end text-muted-foreground tabular-nums">
                    {fmtPct(a.actual)}
                    {a.planned !== null ? ` / ${fmtPct(a.planned)}` : ""}
                  </td>
                  <td className="px-3 py-2 text-end font-semibold tabular-nums">{fmtPct(a.actual)}</td>
                  <td className="py-2 pe-5 ps-3 sm:pe-6">
                    <ScheduleBadge state={a.schedule} short />
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
