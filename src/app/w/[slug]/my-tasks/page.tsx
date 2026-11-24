import Link from "next/link";
import { CalendarClock, CalendarDays, CalendarRange, CheckSquare, CircleAlert, CircleCheckBig, Infinity as NoDate, ListTodo, type LucideIcon } from "lucide-react";
import { requireWorkspace } from "@/lib/auth/session";
import { listMyTasks } from "@/lib/data/my-tasks";
import { todayISO } from "@/lib/accomplishment";
import { DUE_GROUP_LABELS, dueGroup, type DueGroup } from "@/lib/my-tasks-groups";
import { cn, formatDate } from "@/lib/utils";
import { MilestoneIcon, PriorityIcon, ProgressBar, StatusDot } from "@/components/tasks/task-bits";
import { getT } from "@/i18n/server";
import { CalendarLinkButton } from "@/components/tasks/calendar-link";
import { visibleProjectIds } from "@/lib/data/project-access";
import { EmptyState, PageHeader, PageShell, Panel, StatTile } from "@/components/page/kit";

export async function generateMetadata() {
  const t = await getT();
  return { title: t("My tasks") };
}

const ORDER: DueGroup[] = ["overdue", "today", "week", "later", "none", "done"];
const GROUP_ICONS: Record<DueGroup, LucideIcon> = {
  overdue: CircleAlert,
  today: CalendarClock,
  week: CalendarRange,
  later: CalendarDays,
  none: NoDate,
  done: CircleCheckBig,
};

export default async function MyTasksPage({ params, searchParams }: PageProps<"/w/[slug]/my-tasks">) {
  const [{ slug }, query] = await Promise.all([params, searchParams]);
  const { user, workspace } = await requireWorkspace(slug);
  const tr = await getT();
  const showDone = query.done === "1";
  const today = todayISO();
  const all = await listMyTasks(workspace.id, user.id, await visibleProjectIds(workspace.id, user.id, workspace.role));
  const groups = new Map<DueGroup, typeof all>();
  for (const t of all) {
    const g = dueGroup(t, today);
    if (g === "done" && !showDone) continue;
    groups.set(g, [...(groups.get(g) ?? []), t]);
  }
  const open = all.filter((t) => dueGroup(t, today) !== "done").length;
  const base = `/w/${workspace.slug}`;

  const size = (g: DueGroup) => all.filter((t) => dueGroup(t, today) === g).length;

  return (
    <PageShell>
      <PageHeader
        icon={CheckSquare}
        title={tr("My tasks")}
        description={tr.plural(open, "{count} open task assigned to you across all projects.", "{count} open tasks assigned to you across all projects.")}
        actions={
          <>
            <CalendarLinkButton slug={workspace.slug} />
            <Link
              href={showDone ? `${base}/my-tasks` : `${base}/my-tasks?done=1`}
              className="flex h-8 items-center rounded-lg border border-white/25 bg-white/10 px-3 text-sm text-white transition-colors hover:bg-white/20"
            >
              {showDone ? tr("Hide finished") : tr("Show finished")}
            </Link>
          </>
        }
      >
      </PageHeader>

      {open > 0 && (
        <dl className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatTile icon={ListTodo} label={tr("Open tasks")} value={open} hint={tr("Assigned to you")} />
          <StatTile icon={CircleAlert} tone={size("overdue") ? "bad" : "good"} label={tr("Overdue")} value={size("overdue")} hint={tr("Past their end date")} share={size("overdue") / open} shareLabel={tr("Share of my open tasks that are overdue")} />
          <StatTile icon={CalendarClock} label={tr("Due today")} value={size("today")} hint={formatDate(today, tr.intl)} />
          <StatTile icon={CalendarRange} label={tr("Next 7 days")} value={size("week")} hint={tr("Coming up this week")} />
        </dl>
      )}

      {all.length === 0 || (open === 0 && !showDone) ? (
        <EmptyState icon={all.length === 0 ? CheckSquare : CircleCheckBig} title={all.length === 0 ? tr("Nothing assigned to you yet") : tr("All done!")}>
          {tr("Tasks assigned to you in any project show up here.")}
        </EmptyState>
      ) : (
        ORDER.filter((g) => groups.has(g)).map((g) => (
          <Panel key={g} id={`grp-${g}`} title={tr(DUE_GROUP_LABELS[g])} icon={GROUP_ICONS[g]} count={groups.get(g)!.length} tone={g === "overdue" ? "danger" : undefined}>
            <ul className="divide-y border-t">
              {groups.get(g)!.map((t) => {
                const key = `${t.projectKey}-${t.number}`;
                return (
                  <li key={t.id}>
                    <Link href={`${base}/p/${t.projectKey}?task=${key}`} className="flex flex-wrap items-center gap-x-3 gap-y-1.5 px-5 py-3 text-sm transition-colors hover:bg-accent">
                      <PriorityIcon priority={t.priority} />
                      <span className="w-16 shrink-0 font-mono text-xs text-muted-foreground">{key}</span>
                      {t.isMilestone && <MilestoneIcon />}
                      <span className={cn("min-w-0 flex-1 truncate font-medium", g === "done" && "text-muted-foreground line-through")}>
                        {t.title}
                        {t.parentId && <span className="ms-1.5 text-xs font-normal text-muted-foreground">{tr("(sub-task)")}</span>}
                      </span>
                      <span className="flex items-center gap-1.5 rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                        <span aria-hidden className="size-2 rounded-full" style={{ backgroundColor: t.projectColor }} />
                        {t.projectName}
                      </span>
                      <span className="flex w-28 items-center gap-1.5 text-xs">
                        <StatusDot color={t.statusColor} className="size-2" />
                        {t.statusName}
                      </span>
                      {!t.isMilestone && <ProgressBar value={t.progress} label={tr("{title} progress", { title: t.title })} className="w-28" />}
                      <span className={cn("w-24 text-end text-xs tabular-nums", g === "overdue" ? "font-semibold text-destructive" : "text-muted-foreground")}>
                        {t.dueDate ? formatDate(t.dueDate, tr.intl) : "—"}
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </Panel>
        ))
      )}
    </PageShell>
  );
}
