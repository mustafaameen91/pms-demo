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
import { ExportMenu } from "@/components/projects/export-menu";
import { getT } from "@/i18n/server";

export default async function ProjectLayout({ children, params }: LayoutProps<"/w/[slug]/p/[key]">) {
  const { slug, key } = await params;
  const { user, workspace } = await requireWorkspace(slug);
  const t = await getT();
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
              {t("Over budget")}
            </a>
          )}
          <div className="ms-auto flex items-center gap-3">
            <AccomplishmentSummary a={accomplishment} />
            {accomplishment.mode !== "empty" && (
              <AccomplishmentMeter
                actual={accomplishment.actual}
                planned={accomplishment.planned}
                label={t("Project accomplishment")}
                className="hidden w-32 sm:block"
              />
            )}
          </div>
        </div>

        <dl className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-sm text-muted-foreground">
          {project.client && (
            <div className="flex items-center gap-1.5">
              <dt>
                <Building2 className="size-4" aria-label={t("Client")} />
              </dt>
              <dd>{project.client}</dd>
            </div>
          )}
          {hasDates && (
            <div className="flex items-center gap-1.5">
              <dt>
                <Calendar className="size-4" aria-label={t("Dates")} />
              </dt>
              <dd className="tabular-nums">
                {formatDate(project.startDate, t.intl)} {t("→")} {formatDate(project.endDate, t.intl)}
              </dd>
            </div>
          )}
          {project.budget && (
            <div className="flex items-center gap-1.5">
              <dt>
                <Wallet className="size-4" aria-label={t("Budget")} />
              </dt>
              <dd className="tabular-nums">
                {t("{spent} of {budget} spent", {
                  spent: formatMoney(budget.actual, project.currency, t.intl),
                  budget: formatMoney(project.budget, project.currency, t.intl),
                })}
              </dd>
            </div>
          )}
          {project.leadName && (
            <div className="flex items-center gap-1.5">
              <dt>
                <User className="size-4" aria-label={t("Project manager")} />
              </dt>
              <dd>{project.leadName}</dd>
            </div>
          )}
        </dl>

        <div className="flex items-end justify-between gap-3">
          <ProjectTabs basePath={basePath} />
          <div className="mb-1.5">
            <ExportMenu excelHref={`${basePath}/export`} printHref={`/print/${workspace.slug}/${project.key}`} />
          </div>
        </div>
      </header>

      {children}
    </div>
  );
}
