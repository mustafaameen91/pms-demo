import Link from "next/link";
import { Archive, Building2, Calendar, CircleCheck, FolderKanban, Gauge, TrendingDown, Wallet } from "lucide-react";
import { requireWorkspace } from "@/lib/auth/session";
import { getWorkspaceAccomplishmentTasks, listProjects } from "@/lib/data/projects";
import { computeAccomplishment } from "@/lib/accomplishment";
import { AccomplishmentMeter, AccomplishmentSummary, fmtPct } from "@/components/projects/accomplishment";
import { cn, formatDate, formatMoney } from "@/lib/utils";
import { NewProjectButton } from "@/components/projects/new-project-button";
import { ProjectStatusBadge } from "@/components/projects/project-status-badge";
import { getT } from "@/i18n/server";
import { visibleProjectIds } from "@/lib/data/project-access";
import { EmptyState, PageHeader, PageShell, StatTile } from "@/components/page/kit";

export async function generateMetadata() {
  const t = await getT();
  return { title: t("Projects") };
}

export default async function ProjectsPage({ params, searchParams }: PageProps<"/w/[slug]">) {
  const [{ slug }, query] = await Promise.all([params, searchParams]);
  const { user, workspace } = await requireWorkspace(slug);
  const isAdmin = workspace.role === "owner" || workspace.role === "admin";
  const t = await getT();
  const showArchived = query.archived === "1";
  const [projects, tasksByProject] = await Promise.all([
    listProjects(workspace.id, { archived: showArchived, only: await visibleProjectIds(workspace.id, user.id, workspace.role) }),
    getWorkspaceAccomplishmentTasks(workspace.id),
  ]);
  const base = `/w/${workspace.slug}`;

  const rows = projects.map((p) => ({ p, a: computeAccomplishment(tasksByProject.get(p.id) ?? [], p) }));
  const behind = rows.filter((r) => r.a.schedule === "behind").length;
  const onTrack = rows.filter((r) => r.a.schedule === "on_track" || r.a.schedule === "ahead").length;
  const done = rows.flatMap((r) => (r.a.actual === null ? [] : [r.a.actual]));
  const avg = done.length ? Math.round((done.reduce((x, y) => x + y, 0) / done.length) * 10) / 10 : null;

  return (
    <PageShell>
      <PageHeader
        icon={showArchived ? Archive : FolderKanban}
        title={showArchived ? t("Archived projects") : t("Projects")}
        description={t.plural(projects.length, "{count} project in {workspace}", "{count} projects in {workspace}", { workspace: workspace.name })}
        actions={
          <>
            <Link
              href={showArchived ? base : `${base}?archived=1`}
              className="flex h-8 items-center gap-1.5 rounded-lg border border-white/25 bg-white/10 px-3 text-sm text-white transition-colors hover:bg-white/20"
            >
              {showArchived ? <FolderKanban className="size-4" /> : <Archive className="size-4" />}
              {showArchived ? t("Active projects") : t("Archived")}
            </Link>
            {!showArchived && projects.length > 0 && isAdmin && <NewProjectButton workspaceSlug={workspace.slug} />}
          </>
        }
      >
      </PageHeader>

      {!showArchived && projects.length > 0 && (
        <dl className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatTile icon={FolderKanban} label={t("Projects")} value={projects.length} hint={t("Active in {workspace}", { workspace: workspace.name })} />
          <StatTile icon={Gauge} label={t("Average progress")} value={fmtPct(avg)} hint={t("Done across projects with tasks")} />
          <StatTile icon={CircleCheck} tone="good" label={t("On track")} value={onTrack} hint={t("On or ahead of plan")} share={onTrack / projects.length} shareLabel={t("Share of projects on track")} />
          <StatTile icon={TrendingDown} tone={behind ? "bad" : "good"} label={t("Behind schedule")} value={behind} hint={t("Done less than planned")} share={behind / projects.length} shareLabel={t("Share of open projects behind schedule")} />
        </dl>
      )}

      {projects.length === 0 ? (
        showArchived ? (
          <EmptyState icon={Archive} title={t("No archived projects.")} />
        ) : isAdmin ? (
          <EmptyState
            icon={FolderKanban}
            title={t("Create your first project")}
            action={<NewProjectButton workspaceSlug={workspace.slug} />}
          >
            {t("A project holds its tasks, budget, resources and expenses — for example a new branch, a building, an event or a client contract.")}
          </EmptyState>
        ) : (
          <EmptyState icon={FolderKanban} title={t("You're not on any project yet")}>
            {t("Projects appear here when a project manager adds you to the team or assigns you a task.")}
          </EmptyState>
        )
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
          {rows.map(({ p, a: accomplishment }) => (
            <li key={p.id}>
              <Link
                href={`${base}/p/${p.key}`}
                className={cn(
                  "group relative flex h-full flex-col overflow-hidden rounded-2xl border bg-card p-5 transition-all hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-lg hover:shadow-primary/5 focus-visible:outline-2 focus-visible:outline-ring motion-reduce:hover:translate-y-0",
                  showArchived && "opacity-80",
                )}
              >
                <span aria-hidden className="absolute inset-x-0 top-0 h-1" style={{ backgroundColor: p.color }} />
                <div className="flex items-start gap-3">
                  <span
                    aria-hidden
                    className="grid size-10 shrink-0 place-items-center rounded-xl font-mono text-xs font-bold text-white"
                    style={{ backgroundColor: p.color }}
                  >
                    {p.key.slice(0, 3)}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-semibold group-hover:text-primary">{p.name}</span>
                    <span className="mt-1 flex items-center gap-2">
                      <ProjectStatusBadge status={p.status} />
                      <span className="font-mono text-xs text-muted-foreground">{p.key}</span>
                    </span>
                  </span>
                </div>

                <dl className="mt-4 grid gap-1.5 text-sm text-muted-foreground">
                  {p.client && (
                    <div className="flex items-center gap-2">
                      <dt>
                        <Building2 className="size-3.5" aria-label={t("Client")} />
                      </dt>
                      <dd className="truncate">{p.client}</dd>
                    </div>
                  )}
                  {(p.startDate || p.endDate) && (
                    <div className="flex items-center gap-2">
                      <dt>
                        <Calendar className="size-3.5" aria-label={t("Dates")} />
                      </dt>
                      <dd className="tabular-nums">
                        {formatDate(p.startDate, t.intl)} {t("→")} {formatDate(p.endDate, t.intl)}
                      </dd>
                    </div>
                  )}
                  {p.budget && (
                    <div className="flex items-center gap-2">
                      <dt>
                        <Wallet className="size-3.5" aria-label={t("Budget")} />
                      </dt>
                      <dd className="tabular-nums">{formatMoney(p.budget, p.currency, t.intl)}</dd>
                    </div>
                  )}
                </dl>

                <div className="mt-auto pt-5">
                  <div className="grid gap-2 border-t pt-4">
                    <AccomplishmentSummary a={accomplishment} />
                    {accomplishment.mode !== "empty" && (
                      <AccomplishmentMeter actual={accomplishment.actual} planned={accomplishment.planned} label={t("{name} accomplishment", { name: p.name })} />
                    )}
                  </div>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </PageShell>
  );
}
