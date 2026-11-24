import { getVisibleProjectByKey } from "@/lib/data/project-access";
import { listFiles } from "@/lib/data/files";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CalendarDays, CalendarRange, Columns3, List, Table2 } from "lucide-react";
import { requireWorkspace } from "@/lib/auth/session";
import { computeAccomplishment } from "@/lib/accomplishment";
import { getBoard, getDependencies, getTaskDetail, getTaskLinks, listMembers } from "@/lib/data/projects";
import { getProjectResources } from "@/lib/data/resources";
import { getProjectFields } from "@/lib/data/custom-fields";
import { db } from "@/lib/db";
import { formSubmissions, requestForms } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { cn } from "@/lib/utils";
import { Board } from "@/components/tasks/board";
import { TaskList } from "@/components/tasks/task-list";
import { TaskTable } from "@/components/tasks/task-table";
import { TaskTimeline } from "@/components/tasks/task-timeline";
import { TaskCalendar } from "@/components/tasks/task-calendar";
import { todayISO } from "@/lib/accomplishment";
import { TaskSheet } from "@/components/tasks/task-sheet";
import { getT } from "@/i18n/server";
import { canManageProject, taskEdits } from "@/lib/permissions";
import { authorizeTask } from "@/lib/task-access";

export async function generateMetadata({ params }: PageProps<"/w/[slug]/p/[key]">) {
  const { key } = await params;
  return { title: key.toUpperCase() };
}

export default async function ProjectPage({ params, searchParams }: PageProps<"/w/[slug]/p/[key]">) {
  const [{ slug, key }, query] = await Promise.all([params, searchParams]);
  const { user, workspace } = await requireWorkspace(slug);
  const project = await getVisibleProjectByKey(workspace, user.id, key);
  if (!project) notFound();

  const view =
    query.view === "board" || query.view === "list" || query.view === "timeline" || query.view === "calendar"
      ? query.view
      : "table";
  const month =
    typeof query.month === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(query.month) ? query.month : todayISO().slice(0, 7);
  const taskParam = typeof query.task === "string" ? query.task : null;
  const taskNumber = taskParam?.match(/^[A-Z0-9]+-(\d+)$/i)?.[1];

  const [board, members, selectedTask, projectResources, dependencies, fields, projectFiles] = await Promise.all([
    getBoard(project.id),
    listMembers(workspace.id),
    taskNumber ? getTaskDetail(project.id, Number(taskNumber)) : null,
    taskNumber ? getProjectResources(project.id) : [],
    view === "timeline" ? getDependencies(project.id) : [],
    getProjectFields(project.id),
    taskNumber ? listFiles(project.id) : [],
  ]);
  const [links, [request]] = selectedTask
    ? await Promise.all([
        getTaskLinks(selectedTask.id),
        db
          .select({
            formTitle: requestForms.title,
            name: formSubmissions.requesterName,
            email: formSubmissions.requesterEmail,
            phone: formSubmissions.requesterPhone,
            createdAt: formSubmissions.createdAt,
          })
          .from(formSubmissions)
          .innerJoin(requestForms, eq(requestForms.id, formSubmissions.formId))
          .where(eq(formSubmissions.taskId, selectedTask.id))
          .limit(1),
      ])
    : [null, []];

  const basePath = `/w/${workspace.slug}/p/${project.key}`;
  const t = await getT();
  // What the viewer may do: managers everything; members only their own tasks; nobody starts a blocked task.
  const manager = canManageProject(workspace.role, user.id, project);
  const access = selectedTask ? await authorizeTask(selectedTask.id) : null;
  const movable = board.tasks
    .filter((task) => taskEdits({ manager, assignee: task.assigneeId === user.id, blocked: task.blockedBy > 0 }).has("status"))
    .map((task) => task.id);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center gap-3 border-b bg-card/40 px-4 py-2.5 sm:px-6">
        <p className="hidden text-sm text-muted-foreground sm:block">
          {t.plural(board.tasks.length, "{count} task", "{count} tasks")}
        </p>
        <nav aria-label={t("Task views")} className="ms-auto flex max-w-full min-w-0 overflow-x-auto rounded-xl bg-muted p-1">
          {(
            [
              { id: "table", label: "Table", icon: Table2 },
              { id: "timeline", label: "Timeline", icon: CalendarRange },
              { id: "calendar", label: "Calendar", icon: CalendarDays },
              { id: "board", label: "Board", icon: Columns3 },
              { id: "list", label: "List", icon: List },
            ] as const
          ).map(({ id, label, icon: Icon }) => (
            <Link
              key={id}
              href={id === "table" ? basePath : `${basePath}?view=${id}`}
              aria-current={view === id ? "page" : undefined}
              className={cn(
                "flex h-8 shrink-0 items-center gap-1.5 rounded-lg px-3 whitespace-nowrap text-sm font-medium text-muted-foreground transition-colors hover:text-foreground",
                view === id && "bg-card text-primary shadow-sm hover:text-primary",
              )}
            >
              <Icon className="size-4" />
              {t(label)}
            </Link>
          ))}
        </nav>
      </div>

      {view === "table" && (
        <TaskTable
          canAdd={manager}
          projectId={project.id}
          projectKey={project.key}
          currency={project.currency}
          statuses={board.statuses}
          tasks={board.tasks}
          fields={fields}
          accomplishment={
            computeAccomplishment(
              board.tasks.map((t) => ({
                ...t,
                cancelled: board.statuses.find((s) => s.id === t.statusId)?.category === "canceled",
              })),
              project,
            ).actual
          }
        />
      )}
      {view === "timeline" && (
        <TaskTimeline
          projectKey={project.key}
          projectStart={project.startDate}
          projectEnd={project.endDate}
          statuses={board.statuses}
          tasks={board.tasks}
          dependencies={dependencies}
        />
      )}
      {view === "calendar" && (
        <TaskCalendar projectKey={project.key} month={month} statuses={board.statuses} tasks={board.tasks} />
      )}
      {view === "board" && (
        <Board projectId={project.id} projectKey={project.key} statuses={board.statuses} tasks={board.tasks} movable={movable} canAdd={manager} />
      )}
      {view === "list" && (
        <TaskList projectId={project.id} projectKey={project.key} statuses={board.statuses} tasks={board.tasks} canAdd={manager} />
      )}

      {taskParam && (
        <TaskSheet
          key={selectedTask?.id ?? taskParam}
          task={selectedTask}
          taskKey={taskParam.toUpperCase()}
          projectId={project.id}
          projectKey={project.key}
          currency={project.currency}
          statuses={board.statuses}
          members={members}
          resources={projectResources.filter((r) => selectedTask && r.taskId === selectedTask.id)}
          resourcesHref={`${basePath}/resources`}
          files={projectFiles.filter((f) => selectedTask && f.taskId === selectedTask.id)}
          filesHref={`${basePath}/files${selectedTask ? `?task=${selectedTask.id}` : ""}`}
          currentUserId={user.id}
          links={links}
          request={request ?? null}
          fields={fields}
          mainTasks={board.tasks.map((t) => ({ id: t.id, number: t.number, title: t.title }))}
          isAdmin={workspace.role === "owner" || workspace.role === "admin"}
          edits={access ? [...access.edits] : []}
          blockers={access?.blockers.map((b) => ({ number: b.number, title: b.title })) ?? []}
          // Weight already given to the other main tasks, to show what's left of 100%.
          otherWeight={board.tasks
            .filter((t) => t.id !== selectedTask?.id)
            .reduce((sum, t) => sum + (t.weight ? Number(t.weight) : 0), 0)}
        />
      )}
    </div>
  );
}
