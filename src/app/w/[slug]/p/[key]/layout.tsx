import { notFound } from "next/navigation";
import { AlertTriangle, Calendar, User, Wallet, Building2 } from "lucide-react";
import { requireWorkspace } from "@/lib/auth/session";
import { getAccomplishmentTasks, getProjectByKey } from "@/lib/data/projects";
import { computeAccomplishment } from "@/lib/accomplishment";
import { computeBudget } from "@/lib/budget";
import { getProjectResources } from "@/lib/data/resources";
import { getProjectExpenses } from "@/lib/data/expenses";
import { AccomplishmentMeter, AccomplishmentSummary } from "@/components/projects/accomplishment";
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
  const [accomplishmentTasks, usages, expenseRows] = await Promise.all([
    getAccomplishmentTasks(project.id),
    getProjectResources(project.id),
    getProjectExpenses(project.id),
  ]);
  const accomplishment = computeAccomplishment(accomplishmentTasks, project);
  const budget = computeBudget(project.budget, usages, expenseRows);
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
          {budget.overBudget && (
            <a
              href={`${basePath}/expenses`}
              className="inline-flex items-center gap-1 rounded-full border border-destructive/30 bg-destructive/10 px-2 py-0.5 text-xs font-medium text-destructive"
            >
              <AlertTriangle className="size-3.5" aria-hidden />
              Over budget
            </a>
          )}
          <div className="ml-auto flex items-center gap-3">
            <AccomplishmentSummary a={accomplishment} />
            {accomplishment.mode !== "empty" && (
              <AccomplishmentMeter
                actual={accomplishment.actual}
                planned={accomplishment.planned}
                label="Project accomplishment"
                className="hidden w-32 sm:block"
              />
            )}
          </div>
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
              <dd className="tabular-nums">
                {formatMoney(budget.actual, project.currency)} of {formatMoney(project.budget, project.currency)} spent
              </dd>
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
