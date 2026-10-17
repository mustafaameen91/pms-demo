import { notFound } from "next/navigation";
import { requireWorkspace } from "@/lib/auth/session";
import { getProjectByKey, listMembers } from "@/lib/data/projects";
import { canManageProject } from "@/lib/permissions";
import { ProjectSettings } from "@/components/projects/project-settings";

export async function generateMetadata({ params }: PageProps<"/w/[slug]/p/[key]/settings">) {
  const { key } = await params;
  return { title: `Settings · ${key.toUpperCase()}` };
}

export default async function ProjectSettingsPage({ params }: PageProps<"/w/[slug]/p/[key]/settings">) {
  const { slug, key } = await params;
  const { user, workspace } = await requireWorkspace(slug);
  const project = await getProjectByKey(workspace.id, key);
  if (!project) notFound();
  const members = await listMembers(workspace.id);

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-6 sm:px-6">
      <ProjectSettings
        project={{
          id: project.id,
          key: project.key,
          name: project.name,
          color: project.color,
          client: project.client,
          description: project.description,
          startDate: project.startDate,
          endDate: project.endDate,
          budget: project.budget,
          currency: project.currency,
          status: project.status,
          leadId: project.leadId,
          archived: Boolean(project.archivedAt),
        }}
        members={members.map((m) => ({ id: m.id, name: m.name }))}
        canManage={canManageProject(workspace.role, user.id, project)}
        canDelete={workspace.role === "owner" || workspace.role === "admin"}
      />
    </div>
  );
}
