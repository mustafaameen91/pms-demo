import { notFound } from "next/navigation";
import { requireWorkspace } from "@/lib/auth/session";
import { getProjectByKey, listMembers } from "@/lib/data/projects";
import { canManageProject } from "@/lib/permissions";
import { ProjectSettings } from "@/components/projects/project-settings";
import { ClientShare } from "@/components/projects/client-share";
import { SaveAsTemplate } from "@/components/projects/save-as-template";
import { ApprovalThreshold } from "@/components/projects/approval-threshold";
import { RequestForms } from "@/components/projects/request-forms";
import { formSubmissions, requestForms, taskStatuses } from "@/lib/db/schema";
import { asc, count, max } from "drizzle-orm";
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
  const [forms, statuses] = canManage
    ? await Promise.all([
        db
          .select({
            form: requestForms,
            submissions: count(formSubmissions.id),
            lastSubmission: max(formSubmissions.createdAt),
          })
          .from(requestForms)
          .leftJoin(formSubmissions, eq(formSubmissions.formId, requestForms.id))
          .where(eq(requestForms.projectId, project.id))
          .groupBy(requestForms.id)
          .orderBy(asc(requestForms.createdAt)),
        db
          .select({ id: taskStatuses.id, name: taskStatuses.name })
          .from(taskStatuses)
          .where(eq(taskStatuses.projectId, project.id))
          .orderBy(asc(taskStatuses.position)),
      ])
    : [[], []];
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
      {canManage && (
        <RequestForms
          projectId={project.id}
          forms={forms.map(({ form, submissions, lastSubmission }) => ({
            id: form.id,
            token: form.token,
            title: form.title,
            intro: form.intro,
            config: form.config,
            statusId: form.statusId,
            assigneeId: form.assigneeId,
            enabled: form.enabled,
            submissions,
            lastSubmission,
          }))}
          statuses={statuses}
          members={members.map((m) => ({ id: m.id, name: m.name }))}
          appOrigin={process.env.BETTER_AUTH_URL ?? "http://localhost:3001"}
        />
      )}
      {canManage && (
        <ApprovalThreshold projectId={project.id} currency={project.currency} current={project.approvalThreshold} />
      )}
      {canManage && <SaveAsTemplate projectId={project.id} projectName={project.name} />}
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
