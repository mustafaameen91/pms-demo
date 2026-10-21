import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { requireWorkspace } from "@/lib/auth/session";
import { getProjectHealth, toHealthRow } from "@/lib/data/project-health";
import { activeRisksOf, getPortfolio, listPortfolios } from "@/lib/data/portfolios";
import { listProjects } from "@/lib/data/projects";
import { summarizePortfolio } from "@/lib/portfolio";
import { isWorkspaceAdmin } from "@/lib/permissions";
import { getT } from "@/i18n/server";
import { PortfolioSummaryView } from "@/components/portfolios/portfolio-summary";
import { ProjectHealthTable } from "@/components/projects/project-health-table";
import { DeletePortfolioButton, ManageProjectsButton, PortfolioFormButton } from "@/components/portfolios/portfolio-dialogs";

export async function generateMetadata({ params }: PageProps<"/w/[slug]/portfolios/[id]">) {
  const { slug, id } = await params;
  const { workspace } = await requireWorkspace(slug);
  const pf = await getPortfolio(workspace.id, id);
  return { title: pf?.name ?? "" };
}

export default async function PortfolioPage({ params }: PageProps<"/w/[slug]/portfolios/[id]">) {
  const { slug, id } = await params;
  const { user, workspace } = await requireWorkspace(slug);
  const t = await getT();
  const pf = await getPortfolio(workspace.id, id);
  if (!pf) notFound();
  const admin = isWorkspaceAdmin(workspace.role);
  // Members see the projects of this portfolio they're on.
  const rows = (await getProjectHealth(workspace, user.id)).filter((r) => r.p.portfolioId === pf.id);
  const [risks, allProjects, portfolios] = await Promise.all([
    activeRisksOf(rows.map((r) => r.p.id)),
    admin ? listProjects(workspace.id) : [],
    admin ? listPortfolios(workspace.id) : [],
  ]);
  const portfolioName = new Map(portfolios.map((p) => [p.id, p.name]));
  const base = `/w/${workspace.slug}`;

  return (
    <div className="grid w-full grid-cols-1 gap-6 px-4 py-6 sm:px-6 lg:py-8">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <Link href={`${base}/portfolios`} className="mb-1 flex w-fit items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
            <ArrowLeft className="size-4 rtl:-scale-x-100" aria-hidden />
            {t("Portfolios")}
          </Link>
          <h1 className="flex items-center gap-2 text-xl font-semibold tracking-tight" dir="auto">
            <span aria-hidden className="size-3.5 rounded-sm" style={{ backgroundColor: pf.color }} />
            {pf.name}
          </h1>
          {pf.description && <p className="mt-1 max-w-2xl text-sm text-muted-foreground" dir="auto">{pf.description}</p>}
        </div>
        {admin && (
          <div className="flex flex-wrap gap-2">
            <ManageProjectsButton
              portfolioId={pf.id}
              projects={allProjects.map((p) => ({ id: p.id, name: p.name, key: p.key, portfolioId: p.portfolioId, portfolioName: p.portfolioId ? (portfolioName.get(p.portfolioId) ?? null) : null }))}
            />
            <PortfolioFormButton slug={workspace.slug} portfolio={{ id: pf.id, name: pf.name, description: pf.description, color: pf.color }} />
            <DeletePortfolioButton slug={workspace.slug} id={pf.id} />
          </div>
        )}
      </header>

      <PortfolioSummaryView summary={summarizePortfolio(rows.map(toHealthRow))} risks={risks} base={base} />

      <section aria-labelledby="pf-projects" className="overflow-hidden rounded-xl border bg-card">
        <div className="flex items-center justify-between border-b px-4 py-3">
          <h2 id="pf-projects" className="font-semibold">
            {t("Projects")}
          </h2>
          <p className="text-xs text-muted-foreground">{t("Projects that need attention are listed first")}</p>
        </div>
        {rows.length === 0 ? (
          <p className="px-4 py-10 text-center text-sm text-muted-foreground">
            {admin ? t("No projects in this portfolio yet. Use “Choose projects” to add some.") : t("No projects in it yet.")}
          </p>
        ) : (
          <ProjectHealthTable rows={rows} base={base} />
        )}
      </section>
    </div>
  );
}
