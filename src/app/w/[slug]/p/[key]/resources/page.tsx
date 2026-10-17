import { notFound } from "next/navigation";
import { requireWorkspace } from "@/lib/auth/session";
import { getAccomplishmentTasks, getProjectByKey } from "@/lib/data/projects";
import { getProjectResources, listResources } from "@/lib/data/resources";
import { ProjectResourcesView } from "@/components/resources/project-resources";

export async function generateMetadata({ params }: PageProps<"/w/[slug]/p/[key]/resources">) {
  const { key } = await params;
  return { title: `Resources · ${key.toUpperCase()}` };
}

export default async function ProjectResourcesPage({ params }: PageProps<"/w/[slug]/p/[key]/resources">) {
  const { slug, key } = await params;
  const { workspace } = await requireWorkspace(slug);
  const project = await getProjectByKey(workspace.id, key);
  if (!project) notFound();

  const [usages, library, tasks] = await Promise.all([
    getProjectResources(project.id),
    listResources(workspace.id),
    getAccomplishmentTasks(project.id),
  ]);

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6">
      <ProjectResourcesView
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
