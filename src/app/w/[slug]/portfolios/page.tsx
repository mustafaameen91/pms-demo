import Link from "next/link";
import { Layers } from "lucide-react";
import { requireWorkspace } from "@/lib/auth/session";
import { getProjectHealth, toHealthRow } from "@/lib/data/project-health";
import { listPortfolios } from "@/lib/data/portfolios";
import { summarizePortfolio } from "@/lib/portfolio";
import { isWorkspaceAdmin } from "@/lib/permissions";
import { cn, formatMoney } from "@/lib/utils";
import { getT } from "@/i18n/server";
import { AccomplishmentMeter, fmtPct } from "@/components/projects/accomplishment";
import { PortfolioFormButton } from "@/components/portfolios/portfolio-dialogs";

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

  return (
    <div className="grid w-full grid-cols-1 gap-6 px-4 py-6 sm:px-6 lg:py-8">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="flex items-center gap-2 text-xl font-semibold tracking-tight">
            <Layers className="size-5 text-primary" aria-hidden />
            {t("Portfolios")}
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            {t("Group projects (by branch, client or kind of work) and see their progress, money and risks added up.")}
          </p>
        </div>
        {admin && <PortfolioFormButton slug={workspace.slug} />}
      </header>

      {portfolios.length === 0 ? (
        <p className="rounded-xl border bg-card px-4 py-10 text-center text-sm text-muted-foreground">
          {admin ? t("No portfolios yet. Create one, then choose its projects.") : t("No portfolios yet.")}
        </p>
      ) : (
        <ul className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
          {portfolios.map((pf) => {
            const rows = health.filter((r) => r.p.portfolioId === pf.id);
            const s = summarizePortfolio(rows.map(toHealthRow));
            const alerts = s.behind + s.overBudget + s.headingOver;
            return (
              <li key={pf.id}>
                <Link href={`${base}/portfolios/${pf.id}`} className="flex h-full flex-col gap-3 rounded-xl border bg-card p-5 hover:bg-accent/40">
                  <div className="flex items-start gap-2.5">
                    <span aria-hidden className="mt-1.5 size-3 shrink-0 rounded-sm" style={{ backgroundColor: pf.color }} />
                    <div className="min-w-0">
                      <h2 className="font-semibold" dir="auto">{pf.name}</h2>
                      <p className="text-xs text-muted-foreground">
                        {t.plural(s.projects, "{count} project", "{count} projects")}
                        {s.finished > 0 && ` · ${t("{finished} finished", { finished: s.finished })}`}
                      </p>
                    </div>
                  </div>
                  {s.avgActual !== null ? (
                    <div>
                      <p className="flex justify-between text-sm">
                        <span className="text-muted-foreground">{t("Average accomplishment")}</span>
                        <span className="font-semibold tabular-nums">{fmtPct(s.avgActual)}</span>
                      </p>
                      <AccomplishmentMeter actual={s.avgActual} planned={s.avgPlanned} size="sm" label={t("{name} accomplishment", { name: pf.name })} className="mt-1.5" />
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">{s.projects === 0 ? t("No projects in it yet.") : t("No tasks yet")}</p>
                  )}
                  {s.money.slice(0, 2).map((m) => (
                    <p key={m.currency} className="text-sm">
                      <span className={cn("font-medium tabular-nums", m.overBy !== null && m.overBy > 0 && "text-destructive")}>{formatMoney(m.spent, m.currency, t.intl)}</span>
                      <span className="text-muted-foreground"> {t("spent of {amount}", { amount: formatMoney(m.budget, m.currency, t.intl) })}</span>
                    </p>
                  ))}
                  <p className={cn("mt-auto text-xs", alerts ? "font-medium text-destructive" : "text-muted-foreground")}>
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
    </div>
  );
}
