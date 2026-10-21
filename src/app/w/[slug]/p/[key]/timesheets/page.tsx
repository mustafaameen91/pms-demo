import { notFound } from "next/navigation";
import { requireWorkspace } from "@/lib/auth/session";
import { getVisibleProjectByKey } from "@/lib/data/project-access";
import { getBoard } from "@/lib/data/projects";
import { listTimeEntries, listWorkersForAttendance, type TimeEntryRow } from "@/lib/data/timesheets";
import { canManageProject } from "@/lib/permissions";
import { addDays, isISODate, weekStartOf } from "@/lib/timesheets";
import { todayISO } from "@/lib/accomplishment";
import { getT } from "@/i18n/server";
import { TimesheetsView, type EntryItem } from "@/components/timesheets/timesheets-view";

export async function generateMetadata({ params }: PageProps<"/w/[slug]/p/[key]/timesheets">) {
  const [{ key }, t] = await Promise.all([params, getT()]);
  return { title: t("Timesheets · {key}", { key: key.toUpperCase() }) };
}

const toItem = (e: TimeEntryRow): EntryItem => ({
  id: e.id,
  date: e.date,
  kind: e.kind,
  personKey: e.personKey,
  personName: e.personName,
  userId: e.userId,
  taskId: e.taskNumber ? e.taskId : null,
  taskNumber: e.taskNumber,
  taskTitle: e.taskTitle,
  quantity: e.quantity,
  unit: e.unit,
  note: e.note,
  status: e.status,
  decisionNote: e.decisionNote,
  deciderName: e.deciderName,
});

export default async function TimesheetsPage({ params, searchParams }: PageProps<"/w/[slug]/p/[key]/timesheets">) {
  const [{ slug, key }, query] = await Promise.all([params, searchParams]);
  const { user, workspace } = await requireWorkspace(slug);
  const project = await getVisibleProjectByKey(workspace, user.id, key);
  if (!project) notFound();

  const today = todayISO();
  // ?week= any date in the week; weeks start on Saturday.
  const start = weekStartOf(isISODate(query.week) ? query.week : today);
  const canManage = canManageProject(workspace.role, user.id, project);
  const [entries, pending, board, workers] = await Promise.all([
    listTimeEntries(project.id, start, addDays(start, 6)),
    canManage ? listTimeEntries(project.id, start, start, { status: "pending" }) : [],
    getBoard(project.id),
    canManage ? listWorkersForAttendance(workspace.id, project.id) : [],
  ]);
  // Members only see their own time; managers everyone's.
  const visible = canManage ? entries : entries.filter((e) => e.userId === user.id);

  return (
    <div className="w-full px-4 py-6 sm:px-6">
      <TimesheetsView
        projectId={project.id}
        projectKey={project.key}
        basePath={`/w/${workspace.slug}/p/${project.key}`}
        weekStart={start}
        today={today}
        entries={visible.map(toItem)}
        pending={pending.map(toItem)}
        workers={workers}
        tasks={board.tasks.map((task) => ({ id: task.id, number: task.number, title: task.title }))}
        canManage={canManage}
        currentUserId={user.id}
      />
    </div>
  );
}
