import { notFound } from "next/navigation";
import { Calendar, User, Wallet, Building2 } from "lucide-react";
import { requireWorkspace } from "@/lib/auth/session";
import { getProjectByKey } from "@/lib/data/projects";
import { canManageProject } from "@/lib/permissions";
import { formatDate, formatMoney } from "@/lib/utils";
import { ProjectStatusBadge } from "@/components/projects/project-status-badge";
import { ProjectTabs } from "@/components/projects/project-tabs";
import { ArchivedBanner } from "@/components/projects/archived-banner";

export default async function ProjectLayout({ children, params }: LayoutProps<"/w/[slug]/p/[key]">) {
  const { slug, key } = await params;
  const { user, workspace } = await requireWorkspace(slug);
  const project = await getProjectByKey(workspace.id, key);
  if (!project) notFound();

  const basePath = `/w/${workspace.slug}/p/${project.key}`;
  const hasDates = project.startDate || project.endDate;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {project.archivedAt && (
        <ArchivedBanner
          projectId={project.id}
          canRestore={canManageProject(workspace.role, user.id, project)}
        />
      )}

      <header className="border-b px-4 pt-4 sm:px-6">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <span aria-hidden className="size-3 rounded-sm" style={{ backgroundColor: project.color }} />
          <h1 className="truncate text-lg font-semibold">{project.name}</h1>
          <span className="font-mono text-xs text-muted-foreground">{project.key}</span>
          <ProjectStatusBadge status={project.status} />
        </div>

        <dl className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-sm text-muted-foreground">
          {project.client && (
            <div className="flex items-center gap-1.5">
              <dt>
                <Building2 className="size-4" aria-label="Client" />
              </dt>
              <dd>{project.client}</dd>
            </div>
          )}
          {hasDates && (
            <div className="flex items-center gap-1.5">
              <dt>
                <Calendar className="size-4" aria-label="Dates" />
              </dt>
              <dd className="tabular-nums">
                {formatDate(project.startDate)} → {formatDate(project.endDate)}
              </dd>
            </div>
          )}
          {project.budget && (
            <div className="flex items-center gap-1.5">
              <dt>
                <Wallet className="size-4" aria-label="Budget" />
              </dt>
              <dd className="tabular-nums">Budget {formatMoney(project.budget, project.currency)}</dd>
            </div>
          )}
          {project.leadName && (
            <div className="flex items-center gap-1.5">
              <dt>
                <User className="size-4" aria-label="Project manager" />
              </dt>
              <dd>{project.leadName}</dd>
            </div>
          )}
        </dl>

        <ProjectTabs basePath={basePath} />
      </header>

      {children}
    </div>
  );
}
