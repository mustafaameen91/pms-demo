import { notFound } from "next/navigation";
import { requireWorkspace } from "@/lib/auth/session";
import { getProjectByKey, listMembers } from "@/lib/data/projects";
import { canManageProject } from "@/lib/permissions";
import { ProjectSettings } from "@/components/projects/project-settings";
import { ClientShare } from "@/components/projects/client-share";
import { db } from "@/lib/db";
import { projectShares } from "@/lib/db/schema";
import { and, eq, isNull } from "drizzle-orm";

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
  const canManage = canManageProject(workspace.role, user.id, project);
  const [share] = canManage
    ? await db
        .select({ token: projectShares.token, showBudget: projectShares.showBudget, lastViewedAt: projectShares.lastViewedAt })
        .from(projectShares)
        .where(and(eq(projectShares.projectId, project.id), isNull(projectShares.revokedAt)))
        .limit(1)
    : [];

  return (
    <div className="mx-auto grid w-full max-w-2xl grid-cols-1 gap-8 px-4 py-6 sm:px-6">
      {canManage && (
        <ClientShare
          projectId={project.id}
          share={share ?? null}
          appOrigin={process.env.BETTER_AUTH_URL ?? "http://localhost:3001"}
        />
      )}
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
        canManage={canManage}
        canDelete={workspace.role === "owner" || workspace.role === "admin"}
      />
    </div>
  );
}
