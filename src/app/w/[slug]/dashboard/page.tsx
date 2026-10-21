import Link from "next/link";
import { AlertTriangle, CalendarClock, FolderKanban, TrendingDown, Wallet } from "lucide-react";
import { requireWorkspace } from "@/lib/auth/session";
import { getProjectHealth } from "@/lib/data/project-health";
import { ProjectHealthTable } from "@/components/projects/project-health-table";
import { todayISO } from "@/lib/accomplishment";
import { cn, formatDate, formatMoney } from "@/lib/utils";
import { getT } from "@/i18n/server";
import { listPortfolios } from "@/lib/data/portfolios";
import { PortfolioFilter } from "@/components/portfolios/portfolio-filter";

export async function generateMetadata() {
  const t = await getT();
  return { title: t("Dashboard") };
}

export default async function DashboardPage({ params, searchParams }: PageProps<"/w/[slug]/dashboard">) {
  const [{ slug }, query] = await Promise.all([params, searchParams]);
  const { user, workspace } = await requireWorkspace(slug);
  const t = await getT();
  const today = todayISO();
  const [allRows, portfolios] = await Promise.all([getProjectHealth(workspace, user.id), listPortfolios(workspace.id)]);
  // ?portfolio=<id> or "none": the numbers below cover just that group.
  const portfolio = typeof query.portfolio === "string" && (query.portfolio === "none" || portfolios.some((p) => p.id === query.portfolio)) ? query.portfolio : "";
  const rows = portfolio ? allRows.filter((r) => (portfolio === "none" ? !r.p.portfolioId : r.p.portfolioId === portfolio)) : allRows;

  const open = rows.filter((r) => !r.finished);
  const behind = open.filter((r) => r.accomplishment.schedule === "behind").length;
  const overBudget = open.filter((r) => r.money.overBudget).length;
  const headingOver = open.filter((r) => r.headingOver).length;
  const lateTotal = open.reduce((s, r) => s + r.late, 0);

  // Money can't be added across currencies, so totals are per currency.
  const totals = new Map<string, { budget: number; spent: number }>();
  for (const r of open) {
    const sum = totals.get(r.p.currency) ?? { budget: 0, spent: 0 };
    sum.budget += r.money.budget ?? 0;
    sum.spent += r.money.actual;
    totals.set(r.p.currency, sum);
  }

  const base = `/w/${workspace.slug}`;
  const kpis = [
    { label: t("Open projects"), value: open.length, icon: FolderKanban, tone: "default", hint: t("{count} in total", { count: rows.length }) },
    { label: t("Behind schedule"), value: behind, icon: TrendingDown, tone: behind ? "bad" : "default", hint: t("Done less than planned") },
    {
      label: t("Over budget"),
      value: overBudget,
      icon: AlertTriangle,
      tone: overBudget ? "bad" : "default",
      hint: headingOver
        ? t.plural(headingOver, "Spent more than budget · {count} more heading over", "Spent more than budget · {count} more heading over")
        : t("Spent more than budget"),
    },
    { label: t("Late tasks"), value: lateTotal, icon: CalendarClock, tone: lateTotal ? "bad" : "default", hint: t("Past their end date") },
  ] as const;

  return (
    <div className="grid w-full grid-cols-1 gap-6 px-4 py-6 sm:px-6 lg:py-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">{t("Dashboard")}</h1>
          <p className="text-sm text-muted-foreground">
            {t("All projects in {workspace} as of {date}.", { workspace: workspace.name, date: formatDate(today, t.intl) })}
          </p>
        </div>
        {portfolios.length > 0 && <PortfolioFilter portfolios={portfolios} value={portfolio} />}
      </div>

      <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {kpis.map((k) => (
          <div key={k.label} className="rounded-xl border bg-card p-4">
            <dt className="flex items-center gap-2 text-sm text-muted-foreground">
              <k.icon className={cn("size-4", k.tone === "bad" && "text-destructive")} aria-hidden />
              {k.label}
            </dt>
            <dd className={cn("mt-1 text-3xl font-semibold", k.tone === "bad" && "text-destructive")}>{k.value}</dd>
            <p className="mt-0.5 text-xs text-muted-foreground">{k.hint}</p>
          </div>
        ))}
      </dl>

      {totals.size > 0 && (
        <section aria-labelledby="totals-heading" className="rounded-xl border bg-card p-5">
          <h2 id="totals-heading" className="flex items-center gap-2 font-semibold">
            <Wallet className="size-4 text-muted-foreground" aria-hidden />
            {t("Money across open projects")}
          </h2>
          <ul className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
            {[...totals].map(([currency, sum]) => {
              const pct = sum.budget > 0 ? Math.round((sum.spent / sum.budget) * 1000) / 10 : null;
              const over = sum.budget > 0 && sum.spent > sum.budget;
              return (
                <li key={currency} className="rounded-lg border p-3">
                  <p className="text-xs text-muted-foreground">{currency}</p>
                  <p className="mt-0.5 text-sm">
                    <span className={cn("font-semibold", over && "text-destructive")}>{formatMoney(sum.spent, currency, t.intl)}</span>
                    <span className="text-muted-foreground"> {t("spent of {amount}", { amount: formatMoney(sum.budget, currency, t.intl) })}</span>
                  </p>
                  {pct !== null && (
                    <div
                      role="meter"
                      aria-label={t("{currency} budget used", { currency })}
                      aria-valuenow={pct}
                      aria-valuemin={0}
                      aria-valuemax={100}
                      className={cn("mt-2 h-1.5 overflow-hidden rounded-full", over ? "bg-destructive/15" : "bg-primary/15")}
                    >
                      <div className={cn("h-full rounded-full", over ? "bg-destructive" : "bg-primary")} style={{ width: `${Math.min(100, pct)}%` }} />
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      )}

      <section aria-labelledby="projects-heading" className="overflow-hidden rounded-xl border bg-card">
        <div className="flex items-center justify-between border-b px-4 py-3">
          <h2 id="projects-heading" className="font-semibold">
            {t("Projects")}
          </h2>
          <p className="text-xs text-muted-foreground">{t("Projects that need attention are listed first")}</p>
        </div>
        {rows.length === 0 ? (
          <p className="px-4 py-10 text-center text-sm text-muted-foreground">
            {t("No projects yet.")}{" "}
            <Link href={base} className="font-medium text-primary underline-offset-4 hover:underline">
              {t("Create one")}
            </Link>
            .
          </p>
        ) : (
          <ProjectHealthTable rows={rows} base={base} />
        )}
      </section>
    </div>
  );
}
