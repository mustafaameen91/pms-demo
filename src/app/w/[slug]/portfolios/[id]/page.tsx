import { notFound } from "next/navigation";
import { FolderKanban, Layers } from "lucide-react";
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
import { BandIcon, EmptyState, PageHeader, PageShell, Panel } from "@/components/page/kit";

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
    <PageShell>
      <PageHeader
        back={{ href: `${base}/portfolios`, label: t("Portfolios") }}
        mark={
          <span className="relative">
            <BandIcon icon={Layers} />
            <span aria-hidden className="absolute -end-1 -bottom-1 size-4 rounded-full ring-2 ring-white" style={{ backgroundColor: pf.color }} />
          </span>
        }
        title={<span dir="auto">{pf.name}</span>}
        description={pf.description && <span dir="auto">{pf.description}</span>}
        actions={
          admin && (
            <>
            <ManageProjectsButton
              portfolioId={pf.id}
              projects={allProjects.map((p) => ({ id: p.id, name: p.name, key: p.key, portfolioId: p.portfolioId, portfolioName: p.portfolioId ? (portfolioName.get(p.portfolioId) ?? null) : null }))}
            />
            <PortfolioFormButton slug={workspace.slug} portfolio={{ id: pf.id, name: pf.name, description: pf.description, color: pf.color }} />
            <DeletePortfolioButton slug={workspace.slug} id={pf.id} />
            </>
          )
        }
      />

      <PortfolioSummaryView summary={summarizePortfolio(rows.map(toHealthRow))} risks={risks} base={base} />

      {rows.length === 0 ? (
        <EmptyState icon={FolderKanban} title={t("No projects in it yet.")}>
          {admin ? t("No projects in this portfolio yet. Use “Choose projects” to add some.") : null}
        </EmptyState>
      ) : (
        <Panel
          id="pf-projects"
          title={t("Projects")}
          icon={FolderKanban}
          count={rows.length}
          action={<p className="hidden text-xs text-muted-foreground sm:block">{t("Projects that need attention are listed first")}</p>}
        >
          <div className="border-t">
            <ProjectHealthTable rows={rows} base={base} />
          </div>
        </Panel>
      )}
    </PageShell>
  );
}
