import Link from "next/link";
import { Archive, Building2, Calendar, FolderKanban, Wallet } from "lucide-react";
import { requireWorkspace } from "@/lib/auth/session";
import { getWorkspaceAccomplishmentTasks, listProjects } from "@/lib/data/projects";
import { computeAccomplishment } from "@/lib/accomplishment";
import { AccomplishmentMeter, AccomplishmentSummary } from "@/components/projects/accomplishment";
import { cn, formatDate, formatMoney } from "@/lib/utils";
import { NewProjectButton } from "@/components/projects/new-project-button";
import { ProjectStatusBadge } from "@/components/projects/project-status-badge";
import { getT } from "@/i18n/server";

export async function generateMetadata() {
  const t = await getT();
  return { title: t("Projects") };
}

export default async function ProjectsPage({ params, searchParams }: PageProps<"/w/[slug]">) {
  const [{ slug }, query] = await Promise.all([params, searchParams]);
  const { workspace } = await requireWorkspace(slug);
  const t = await getT();
  const showArchived = query.archived === "1";
  const [projects, tasksByProject] = await Promise.all([
    listProjects(workspace.id, { archived: showArchived }),
    getWorkspaceAccomplishmentTasks(workspace.id),
  ]);
  const base = `/w/${workspace.slug}`;

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-6 sm:px-6 lg:py-8">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">
            {showArchived ? t("Archived projects") : t("Projects")}
          </h1>
          <p className="text-sm text-muted-foreground">
            {t.plural(projects.length, "{count} project in {workspace}", "{count} projects in {workspace}", {
              workspace: workspace.name,
            })}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href={showArchived ? base : `${base}?archived=1`}
            className="flex h-8 items-center gap-1.5 rounded-md px-2.5 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            {showArchived ? <FolderKanban className="size-4" /> : <Archive className="size-4" />}
            {showArchived ? t("Active projects") : t("Archived")}
          </Link>
          {!showArchived && projects.length > 0 && <NewProjectButton workspaceSlug={workspace.slug} />}
        </div>
      </div>

      {projects.length === 0 ? (
        showArchived ? (
          <p className="rounded-xl border border-dashed px-6 py-12 text-center text-sm text-muted-foreground">
            {t("No archived projects.")}
          </p>
        ) : (
          <div className="flex flex-col items-center rounded-xl border border-dashed px-6 py-16 text-center">
            <div className="mb-4 grid size-12 place-items-center rounded-full bg-accent text-primary">
              <FolderKanban className="size-6" />
            </div>
            <h2 className="font-semibold">{t("Create your first project")}</h2>
            <p className="mt-1 mb-6 max-w-sm text-sm text-muted-foreground">
              {t(
                "A project holds its tasks, budget, resources and expenses — for example a new branch, a building, an event or a client contract.",
              )}
            </p>
            <NewProjectButton workspaceSlug={workspace.slug} />
          </div>
        )
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {projects.map((p) => {
            const accomplishment = computeAccomplishment(tasksByProject.get(p.id) ?? [], p);
            return (
              <li key={p.id}>
                <Link
                  href={`${base}/p/${p.key}`}
                  className={cn(
                    "group flex h-full flex-col rounded-xl border bg-card p-4 transition-colors hover:border-primary/40 hover:bg-accent/40 focus-visible:outline-2 focus-visible:outline-ring",
                    showArchived && "opacity-80",
                  )}
                >
                  <div className="flex items-center gap-2">
                    <span aria-hidden className="size-3 shrink-0 rounded-sm" style={{ backgroundColor: p.color }} />
                    <span className="truncate font-medium">{p.name}</span>
                    <span className="ms-auto font-mono text-xs text-muted-foreground">{p.key}</span>
                  </div>
                  <div className="mt-2">
                    <ProjectStatusBadge status={p.status} />
                  </div>

                  <dl className="mt-3 grid gap-1 text-sm text-muted-foreground">
                    {p.client && (
                      <div className="flex items-center gap-1.5">
                        <dt>
                          <Building2 className="size-3.5" aria-label={t("Client")} />
                        </dt>
                        <dd className="truncate">{p.client}</dd>
                      </div>
                    )}
                    {(p.startDate || p.endDate) && (
                      <div className="flex items-center gap-1.5">
                        <dt>
                          <Calendar className="size-3.5" aria-label={t("Dates")} />
                        </dt>
                        <dd className="tabular-nums">
                          {formatDate(p.startDate, t.intl)} {t("→")} {formatDate(p.endDate, t.intl)}
                        </dd>
                      </div>
                    )}
                    {p.budget && (
                      <div className="flex items-center gap-1.5">
                        <dt>
                          <Wallet className="size-3.5" aria-label={t("Budget")} />
                        </dt>
                        <dd className="tabular-nums">{formatMoney(p.budget, p.currency, t.intl)}</dd>
                      </div>
                    )}
                  </dl>

                  <div className="mt-auto grid gap-2 pt-4">
                    <AccomplishmentSummary a={accomplishment} />
                    {accomplishment.mode !== "empty" && (
                      <AccomplishmentMeter
                        actual={accomplishment.actual}
                        planned={accomplishment.planned}
                        label={t("{name} accomplishment", { name: p.name })}
                      />
                    )}
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
