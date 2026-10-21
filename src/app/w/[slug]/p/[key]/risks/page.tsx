import { notFound } from "next/navigation";
import { requireWorkspace } from "@/lib/auth/session";
import { getVisibleProjectByKey } from "@/lib/data/project-access";
import { getBoard, listMembers } from "@/lib/data/projects";
import { listRisks } from "@/lib/data/risks";
import { canManageProject } from "@/lib/permissions";
import { getT } from "@/i18n/server";
import { RisksView } from "@/components/risks/risks-view";

export async function generateMetadata({ params }: PageProps<"/w/[slug]/p/[key]/risks">) {
  const [{ key }, t] = await Promise.all([params, getT()]);
  return { title: t("Risks · {key}", { key: key.toUpperCase() }) };
}

export default async function RisksPage({ params, searchParams }: PageProps<"/w/[slug]/p/[key]/risks">) {
  const [{ slug, key }, query] = await Promise.all([params, searchParams]);
  const { user, workspace } = await requireWorkspace(slug);
  const project = await getVisibleProjectByKey(workspace, user.id, key);
  if (!project) notFound();

  const [risks, board, members] = await Promise.all([listRisks(project.id), getBoard(project.id), listMembers(workspace.id)]);

  return (
    <div className="w-full px-4 py-6 sm:px-6">
      <RisksView
        projectId={project.id}
        projectKey={project.key}
        tasksHref={`/w/${workspace.slug}/p/${project.key}`}
        risks={risks}
        members={members.map((m) => ({ id: m.id, name: m.name }))}
        tasks={board.tasks.map((task) => ({ id: task.id, number: task.number, title: task.title }))}
        canManage={canManageProject(workspace.role, user.id, project)}
        currentUserId={user.id}
        openRiskId={typeof query.risk === "string" ? query.risk : undefined}
      />
    </div>
  );
}
