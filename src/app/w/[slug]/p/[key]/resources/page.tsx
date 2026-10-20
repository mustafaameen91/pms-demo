import { getVisibleProjectByKey } from "@/lib/data/project-access";
import { notFound } from "next/navigation";
import { requireWorkspace } from "@/lib/auth/session";
import { getAccomplishmentTasks } from "@/lib/data/projects";
import { getProjectResources, listResources } from "@/lib/data/resources";
import { ProjectResourcesView } from "@/components/resources/project-resources";
import { getT } from "@/i18n/server";
import { canManageProject } from "@/lib/permissions";

export async function generateMetadata({ params }: PageProps<"/w/[slug]/p/[key]/resources">) {
  const [{ key }, t] = await Promise.all([params, getT()]);
  return { title: t("Resources · {key}", { key: key.toUpperCase() }) };
}

export default async function ProjectResourcesPage({ params }: PageProps<"/w/[slug]/p/[key]/resources">) {
  const { slug, key } = await params;
  const { user, workspace } = await requireWorkspace(slug);
  const project = await getVisibleProjectByKey(workspace, user.id, key);
  if (!project) notFound();

  const [usages, library, tasks] = await Promise.all([
    getProjectResources(project.id),
    listResources(workspace.id),
    getAccomplishmentTasks(project.id),
  ]);

  return (
    <div className="w-full px-4 py-6 sm:px-6">
      <ProjectResourcesView
        canEdit={canManageProject(workspace.role, user.id, project)}
        project={{
          id: project.id,
          key: project.key,
          currency: project.currency,
          budget: project.budget,
        }}
        workspaceSlug={workspace.slug}
        usages={usages}
        library={library.map((r) => ({
          id: r.id,
          type: r.type,
          name: r.name,
          role: r.role,
          unit: r.unit,
          unitCost: r.unitCost,
          currency: r.currency,
        }))}
        tasks={tasks.map((t) => ({ id: t.id, number: t.number, title: t.title }))}
      />
    </div>
  );
}
