import { notFound } from "next/navigation";
import { requireWorkspace } from "@/lib/auth/session";
import { getVisibleProjectByKey } from "@/lib/data/project-access";
import { getBoard } from "@/lib/data/projects";
import { listFiles } from "@/lib/data/files";
import { canManageProject } from "@/lib/permissions";
import { getT } from "@/i18n/server";
import { FilesView } from "@/components/files/files-view";

export async function generateMetadata({ params }: PageProps<"/w/[slug]/p/[key]/files">) {
  const [{ key }, t] = await Promise.all([params, getT()]);
  return { title: t("Files · {key}", { key: key.toUpperCase() }) };
}

export default async function FilesPage({ params, searchParams }: PageProps<"/w/[slug]/p/[key]/files">) {
  const [{ slug, key }, query] = await Promise.all([params, searchParams]);
  const { user, workspace } = await requireWorkspace(slug);
  const project = await getVisibleProjectByKey(workspace, user.id, key);
  if (!project) notFound();
  const [files, board] = await Promise.all([listFiles(project.id), getBoard(project.id)]);
  const tasks = board.tasks.map((task) => ({ id: task.id, number: task.number, title: task.title }));
  const initialTask = typeof query.task === "string" && tasks.some((task) => task.id === query.task) ? query.task : undefined;

  return (
    <div className="w-full px-4 py-6 sm:px-6">
      <FilesView
        projectId={project.id}
        projectKey={project.key}
        tasksHref={`/w/${workspace.slug}/p/${project.key}`}
        files={files.map((f) => ({ ...f, uploadedAt: f.uploadedAt.toISOString() }))}
        tasks={tasks}
        canManage={canManageProject(workspace.role, user.id, project)}
        currentUserId={user.id}
        initialTask={initialTask}
      />
    </div>
  );
}
