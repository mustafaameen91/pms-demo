import { getVisibleProjectByKey } from "@/lib/data/project-access";
import { notFound } from "next/navigation";
import { AlertTriangle, Calendar, Hourglass, User, Wallet, Building2 } from "lucide-react";
import { requireWorkspace } from "@/lib/auth/session";
import { getAccomplishmentTasks } from "@/lib/data/projects";
import { computeAccomplishment, todayISO } from "@/lib/accomplishment";
import { daysBetween } from "@/lib/schedule";
import { HeroBand, ProgressRing } from "@/components/dashboard/dashboard-parts";
import { computeBudget } from "@/lib/budget";
import { getProjectResources } from "@/lib/data/resources";
import { getProjectExpenses } from "@/lib/data/expenses";
import { getProjectAdvances } from "@/lib/data/loans";
import { fmtPct } from "@/components/projects/accomplishment";
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
  const project = await getVisibleProjectByKey(workspace, user.id, key);
  if (!project) notFound();

  const basePath = `/w/${workspace.slug}/p/${project.key}`;
  const [accomplishmentTasks, usages, expenseRows, advances] = await Promise.all([
    getAccomplishmentTasks(project.id),
    getProjectResources(project.id),
    getProjectExpenses(project.id),
    getProjectAdvances(workspace.id, project.id),
  ]);
  const accomplishment = computeAccomplishment(accomplishmentTasks, project);
  const budget = computeBudget(project.budget, usages, expenseRows, [], advances);
  const hasDates = project.startDate || project.endDate;
  const finished = project.status === "completed" || project.status === "cancelled";
  const daysLeft = project.endDate ? daysBetween(todayISO(), project.endDate) : null;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {project.archivedAt && (
        <ArchivedBanner
          projectId={project.id}
          canRestore={canManageProject(workspace.role, user.id, project)}
        />
      )}

      <header className="px-4 pt-4 sm:px-6">
        <HeroBand>
          <div className="flex flex-col gap-5 p-5 sm:p-6 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex min-w-0 items-start gap-4">
              <span
                aria-hidden
                className="grid size-14 shrink-0 place-items-center rounded-2xl font-mono text-base font-bold text-white shadow-lg ring-4 ring-white/20"
                style={{ backgroundColor: project.color }}
              >
                {project.key.slice(0, 3)}
              </span>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
                  <h1 className="truncate text-2xl font-bold tracking-tight sm:text-3xl">{project.name}</h1>
                  <span className="rounded-md bg-white/15 px-1.5 py-0.5 font-mono text-xs font-semibold">{project.key}</span>
                  <ProjectStatusBadge status={project.status} className="border-transparent bg-white text-brand" />
                  {budget.overBudget && (
                    <a href={`${basePath}/expenses`} className="inline-flex items-center gap-1 rounded-full bg-white px-2 py-0.5 text-xs font-semibold text-destructive">
                      <AlertTriangle className="size-3.5" aria-hidden />
                      {t("Over budget")}
                    </a>
                  )}
                </div>
                <dl className="mt-3 flex flex-wrap gap-2 text-xs text-white/90">
                  {project.client && (
                    <div className="flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1 ring-1 ring-white/15 backdrop-blur-sm">
                      <dt>
                        <Building2 className="size-3.5" aria-label={t("Client")} />
                      </dt>
                      <dd>{project.client}</dd>
                    </div>
                  )}
                  {hasDates && (
                    <div className="flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1 ring-1 ring-white/15 backdrop-blur-sm">
                      <dt>
                        <Calendar className="size-3.5" aria-label={t("Dates")} />
                      </dt>
                      <dd className="tabular-nums">
                        {formatDate(project.startDate, t.intl)} {t("→")} {formatDate(project.endDate, t.intl)}
                      </dd>
                    </div>
                  )}
                  {project.leadName && (
                    <div className="flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1 ring-1 ring-white/15 backdrop-blur-sm">
                      <dt>
                        <User className="size-3.5" aria-label={t("Project manager")} />
                      </dt>
                      <dd>{project.leadName}</dd>
                    </div>
                  )}
                </dl>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              {accomplishment.mode !== "empty" && (
                <div className="flex items-center gap-4 rounded-2xl bg-white/10 p-3 pe-5 ring-1 ring-white/15 backdrop-blur-sm">
                  <div className="relative">
                    <ProgressRing
                      actual={accomplishment.actual}
                      planned={accomplishment.planned}
                      size="sm"
                      label={t("{actual} done, planned {planned} by today", { actual: fmtPct(accomplishment.actual), planned: fmtPct(accomplishment.planned) })}
                    />
                    <span className="absolute inset-0 grid place-items-center text-base font-bold tabular-nums">{fmtPct(accomplishment.actual)}</span>
                  </div>
                  <dl className="grid gap-1 text-sm">
                    <div>
                      <dt className="text-xs text-white/75">{t("Accomplishment")}</dt>
                      <dd className="font-semibold">
                        {accomplishment.schedule === "behind" ? t("Behind plan") : accomplishment.schedule === "ahead" ? t("Ahead of plan") : accomplishment.schedule === "on_track" ? t("On track") : t("No schedule")}
                      </dd>
                    </div>
                    <div className="flex items-center gap-1.5 text-xs text-white/80">
                      <span aria-hidden className="h-3 w-1 rounded-full bg-brand-accent" />
                      {t("Planned by today")} <span className="font-semibold text-white tabular-nums">{fmtPct(accomplishment.planned)}</span>
                    </div>
                  </dl>
                </div>
              )}
              {project.budget && (
                <div className="grid gap-1 rounded-2xl bg-white/10 px-4 py-3 ring-1 ring-white/15 backdrop-blur-sm">
                  <span className="flex items-center gap-1.5 text-xs text-white/75">
                    <Wallet className="size-3.5" aria-hidden />
                    {t("Budget")}
                  </span>
                  <span className="text-base font-bold tabular-nums">{formatMoney(budget.actual, project.currency, t.intl)}</span>
                  <span className="text-xs text-white/75 tabular-nums">{t("spent of {amount}", { amount: formatMoney(project.budget, project.currency, t.intl) })}</span>
                </div>
              )}
              {daysLeft !== null && !finished && (
                <div className="grid gap-1 rounded-2xl bg-white/10 px-4 py-3 ring-1 ring-white/15 backdrop-blur-sm">
                  <span className="flex items-center gap-1.5 text-xs text-white/75">
                    <Hourglass className="size-3.5" aria-hidden />
                    {t("End date")}
                  </span>
                  <span className="text-base font-bold tabular-nums">
                    {daysLeft < 0
                      ? t.plural(-daysLeft, "{count} days overdue", "{count} days overdue")
                      : daysLeft === 0
                        ? t("Ends today")
                        : t.plural(daysLeft, "{count} days left", "{count} days left")}
                  </span>
                  <span className="text-xs text-white/75 tabular-nums">{formatDate(project.endDate, t.intl)}</span>
                </div>
              )}
            </div>
          </div>
        </HeroBand>

        <div className="mt-4 flex items-center justify-between gap-3 border-b pb-3">
          <ProjectTabs basePath={basePath} canManage={canManageProject(workspace.role, user.id, project)} />
          <ExportMenu excelHref={`${basePath}/export`} printHref={`/print/${workspace.slug}/${project.key}`} />
        </div>
      </header>

      {children}
    </div>
  );
}
