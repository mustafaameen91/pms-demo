import Link from "next/link";
import { notFound } from "next/navigation";
import { Columns3, List, Table2 } from "lucide-react";
import { requireWorkspace } from "@/lib/auth/session";
import { computeAccomplishment } from "@/lib/accomplishment";
import { getBoard, getProjectByKey, getTaskDetail, listMembers } from "@/lib/data/projects";
import { cn } from "@/lib/utils";
import { Board } from "@/components/tasks/board";
import { TaskList } from "@/components/tasks/task-list";
import { TaskTable } from "@/components/tasks/task-table";
import { TaskSheet } from "@/components/tasks/task-sheet";

export async function generateMetadata({ params }: PageProps<"/w/[slug]/p/[key]">) {
  const { key } = await params;
  return { title: key.toUpperCase() };
}

export default async function ProjectPage({ params, searchParams }: PageProps<"/w/[slug]/p/[key]">) {
  const [{ slug, key }, query] = await Promise.all([params, searchParams]);
  const { workspace } = await requireWorkspace(slug);
  const project = await getProjectByKey(workspace.id, key);
  if (!project) notFound();

  const view = query.view === "board" || query.view === "list" ? query.view : "table";
  const taskParam = typeof query.task === "string" ? query.task : null;
  const taskNumber = taskParam?.match(/^[A-Z0-9]+-(\d+)$/i)?.[1];

  const [board, members, selectedTask] = await Promise.all([
    getBoard(project.id),
    listMembers(workspace.id),
    taskNumber ? getTaskDetail(project.id, Number(taskNumber)) : null,
  ]);

  const basePath = `/w/${workspace.slug}/p/${project.key}`;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center border-b px-4 py-2 sm:px-6">
        <nav aria-label="Task views" className="ml-auto flex rounded-lg bg-muted p-0.5">
          {(
            [
              { id: "table", label: "Table", icon: Table2 },
              { id: "board", label: "Board", icon: Columns3 },
              { id: "list", label: "List", icon: List },
            ] as const
          ).map(({ id, label, icon: Icon }) => (
            <Link
              key={id}
              href={id === "table" ? basePath : `${basePath}?view=${id}`}
              aria-current={view === id ? "page" : undefined}
              className={cn(
                "flex h-7 items-center gap-1.5 rounded-md px-2.5 text-sm text-muted-foreground transition-colors hover:text-foreground",
                view === id && "bg-background font-medium text-foreground shadow-sm",
              )}
            >
              <Icon className="size-4" />
              {label}
            </Link>
          ))}
        </nav>
      </div>

      {view === "table" && (
        <TaskTable
          projectId={project.id}
          projectKey={project.key}
          currency={project.currency}
          statuses={board.statuses}
          tasks={board.tasks}
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
      {view === "board" && (
        <Board projectId={project.id} projectKey={project.key} statuses={board.statuses} tasks={board.tasks} />
      )}
      {view === "list" && (
        <TaskList projectId={project.id} projectKey={project.key} statuses={board.statuses} tasks={board.tasks} />
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
          // Weight already given to the other main tasks, to show what's left of 100%.
          otherWeight={board.tasks
            .filter((t) => t.id !== selectedTask?.id)
            .reduce((sum, t) => sum + (t.weight ? Number(t.weight) : 0), 0)}
        />
      )}
    </div>
  );
}
