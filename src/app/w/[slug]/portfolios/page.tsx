import Link from "next/link";
import { AlertTriangle, CircleCheck, FolderKanban, Layers, TrendingDown } from "lucide-react";
import { requireWorkspace } from "@/lib/auth/session";
import { getProjectHealth, toHealthRow } from "@/lib/data/project-health";
import { listPortfolios } from "@/lib/data/portfolios";
import { summarizePortfolio } from "@/lib/portfolio";
import { isWorkspaceAdmin } from "@/lib/permissions";
import { cn, formatMoney } from "@/lib/utils";
import { getT } from "@/i18n/server";
import { AccomplishmentMeter, fmtPct } from "@/components/projects/accomplishment";
import { PortfolioFormButton } from "@/components/portfolios/portfolio-dialogs";
import { EmptyState, PageHeader, PageShell, StatTile } from "@/components/page/kit";

export async function generateMetadata() {
  const t = await getT();
  return { title: t("Portfolios") };
}

export default async function PortfoliosPage({ params }: PageProps<"/w/[slug]/portfolios">) {
  const { slug } = await params;
  const { user, workspace } = await requireWorkspace(slug);
  const t = await getT();
  const [portfolios, health] = await Promise.all([listPortfolios(workspace.id), getProjectHealth(workspace, user.id)]);
  const admin = isWorkspaceAdmin(workspace.role);
  const base = `/w/${workspace.slug}`;
  const ungrouped = health.filter((r) => !r.p.portfolioId).length;

  const summaries = portfolios.map((pf) => ({ pf, s: summarizePortfolio(health.filter((r) => r.p.portfolioId === pf.id).map(toHealthRow)) }));
  const grouped = summaries.reduce((n, x) => n + x.s.projects, 0);
  const behind = summaries.reduce((n, x) => n + x.s.behind, 0);
  const over = summaries.reduce((n, x) => n + x.s.overBudget + x.s.headingOver, 0);

  return (
    <PageShell>
      <PageHeader
        icon={Layers}
        title={t("Portfolios")}
        description={t("Group projects (by branch, client or kind of work) and see their progress, money and risks added up.")}
        actions={admin && portfolios.length > 0 && <PortfolioFormButton slug={workspace.slug} />}
      />

      {portfolios.length > 0 && (
        <dl className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatTile icon={Layers} label={t("Portfolios")} value={portfolios.length} />
          <StatTile
            icon={FolderKanban}
            label={t("Projects in portfolios")}
            value={grouped}
            hint={ungrouped ? t.plural(ungrouped, "{count} project isn't in a portfolio.", "{count} projects aren't in a portfolio.") : t("Every project is in a portfolio")}
          />
          <StatTile icon={TrendingDown} tone={behind ? "bad" : "good"} label={t("Behind schedule")} value={behind} hint={t("Done less than planned")} />
          <StatTile icon={AlertTriangle} tone={over ? "bad" : "good"} label={t("Over / heading over budget")} value={over} hint={t("Spent more than budget")} />
        </dl>
      )}

      {portfolios.length === 0 ? (
        <EmptyState icon={Layers} title={t("No portfolios yet.")} action={admin && <PortfolioFormButton slug={workspace.slug} />}>
          {admin ? t("Create one, then choose its projects.") : t("Group projects (by branch, client or kind of work) and see their progress, money and risks added up.")}
        </EmptyState>
      ) : (
        <ul className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
          {summaries.map(({ pf, s }) => {
            const alerts = s.behind + s.overBudget + s.headingOver;
            return (
              <li key={pf.id}>
                <Link
                  href={`${base}/portfolios/${pf.id}`}
                  className="group relative flex h-full flex-col gap-4 overflow-hidden rounded-2xl border bg-card p-5 transition-all hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-lg hover:shadow-primary/5 focus-visible:outline-2 focus-visible:outline-ring motion-reduce:hover:translate-y-0"
                >
                  <span aria-hidden className="absolute inset-x-0 top-0 h-1" style={{ backgroundColor: pf.color }} />
                  <div className="flex items-start gap-3">
                    <span aria-hidden className="grid size-10 shrink-0 place-items-center rounded-xl text-white" style={{ backgroundColor: pf.color }}>
                      <Layers className="size-5" />
                    </span>
                    <div className="min-w-0">
                      <h2 className="truncate font-semibold group-hover:text-primary" dir="auto">
                        {pf.name}
                      </h2>
                      <p className="text-xs text-muted-foreground">
                        {t.plural(s.projects, "{count} project", "{count} projects")}
                        {s.finished > 0 && ` · ${t("{finished} finished", { finished: s.finished })}`}
                      </p>
                    </div>
                  </div>
                  {s.avgActual !== null ? (
                    <div>
                      <p className="flex items-baseline justify-between text-sm">
                        <span className="text-muted-foreground">{t("Average accomplishment")}</span>
                        <span className="text-2xl font-bold tracking-tight tabular-nums">{fmtPct(s.avgActual)}</span>
                      </p>
                      <AccomplishmentMeter actual={s.avgActual} planned={s.avgPlanned} size="sm" label={t("{name} accomplishment", { name: pf.name })} className="mt-2" />
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">{s.projects === 0 ? t("No projects in it yet.") : t("No tasks yet")}</p>
                  )}
                  {s.money.length > 0 && (
                    <div className="grid gap-1 rounded-xl bg-muted/50 px-3 py-2">
                      {s.money.slice(0, 2).map((m) => (
                        <p key={m.currency} className="text-sm">
                          <span className={cn("font-semibold tabular-nums", m.overBy !== null && m.overBy > 0 && "text-destructive")}>{formatMoney(m.spent, m.currency, t.intl)}</span>
                          <span className="text-muted-foreground"> {t("spent of {amount}", { amount: formatMoney(m.budget, m.currency, t.intl) })}</span>
                        </p>
                      ))}
                    </div>
                  )}
                  <p
                    className={cn(
                      "mt-auto inline-flex w-fit items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium",
                      alerts ? "bg-destructive/10 text-destructive" : "bg-green-600/10 text-green-700 dark:text-green-400",
                    )}
                  >
                    {alerts ? <AlertTriangle className="size-3.5" aria-hidden /> : <CircleCheck className="size-3.5" aria-hidden />}
                    {alerts ? t("{behind} behind · {over} over budget · {heading} heading over", { behind: s.behind, over: s.overBudget, heading: s.headingOver }) : t("Nothing needs attention")}
                  </p>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
      {ungrouped > 0 && portfolios.length > 0 && (
        <p className="text-sm text-muted-foreground">
          {t.plural(ungrouped, "{count} project isn't in a portfolio.", "{count} projects aren't in a portfolio.")}{" "}
          <Link href={`${base}/dashboard`} className="text-primary underline-offset-4 hover:underline">
            {t("Dashboard")}
          </Link>
        </p>
      )}
    </PageShell>
  );
}
