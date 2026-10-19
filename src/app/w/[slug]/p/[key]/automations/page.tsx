import { notFound } from "next/navigation";
import { asc, eq } from "drizzle-orm";
import { requireWorkspace } from "@/lib/auth/session";
import { getT } from "@/i18n/server";
import { getProjectByKey, listMembers } from "@/lib/data/projects";
import { getAutomationRuns, getProjectAutomations } from "@/lib/data/automations";
import { db } from "@/lib/db";
import { taskStatuses } from "@/lib/db/schema";
import { canManageProject } from "@/lib/permissions";
import { AutomationsView } from "@/components/automations/automations-view";

export async function generateMetadata({ params }: PageProps<"/w/[slug]/p/[key]/automations">) {
  const [{ key }, t] = await Promise.all([params, getT()]);
  return { title: t("Automations · {key}", { key: key.toUpperCase() }) };
}

export default async function AutomationsPage({ params }: PageProps<"/w/[slug]/p/[key]/automations">) {
  const { slug, key } = await params;
  const { user, workspace } = await requireWorkspace(slug);
  const project = await getProjectByKey(workspace.id, key);
  if (!project) notFound();

  const [members, statuses, rules, runs] = await Promise.all([
    listMembers(workspace.id),
    db
      .select({ id: taskStatuses.id, name: taskStatuses.name })
      .from(taskStatuses)
      .where(eq(taskStatuses.projectId, project.id))
      .orderBy(asc(taskStatuses.position)),
    getProjectAutomations(project.id),
    getAutomationRuns(project.id),
  ]);

  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-6 sm:px-6">
      <AutomationsView
        projectId={project.id}
        projectKey={project.key}
        basePath={`/w/${workspace.slug}/p/${project.key}`}
        currency={project.currency}
        canManage={canManageProject(workspace.role, user.id, project) && !project.archivedAt}
        statuses={statuses}
        members={members.map((m) => ({ id: m.id, name: m.name }))}
        rules={rules}
        runs={runs}
      />
    </div>
  );
}
