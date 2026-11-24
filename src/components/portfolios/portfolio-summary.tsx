import Link from "next/link";
import { AlertTriangle, FolderKanban, Gauge, ShieldAlert, TrendingDown, TrendingUp, Wallet } from "lucide-react";
import type { PortfolioSummary } from "@/lib/portfolio";
import { riskLevel, riskScore } from "@/lib/risks";
import { cn, formatMoney } from "@/lib/utils";
import { getT } from "@/i18n/server";
import { AccomplishmentMeter, fmtPct } from "@/components/projects/accomplishment";
import { LEVEL_STYLE, RiskLevelBadge } from "@/components/risks/risk-level";
import { Panel, StatTile } from "@/components/page/kit";

type Risk = { id: string; number: number; title: string; likelihood: number; impact: number; projectKey: string; projectName: string };

/** The numbers of a group of projects, added up. */
export async function PortfolioSummaryView({ summary: s, risks, base }: { summary: PortfolioSummary; risks: Risk[]; base: string }) {
  const t = await getT();
  const levels = { high: 0, medium: 0, low: 0 };
  for (const r of risks) levels[riskLevel(riskScore(r.likelihood, r.impact))] += 1;
  const tiles = [
    { icon: FolderKanban, label: t("Projects"), value: s.projects, hint: t("{open} open · {finished} finished", { open: s.open, finished: s.finished }), tone: "default" as const },
    { icon: TrendingDown, label: t("Behind schedule"), value: s.behind, hint: t("Done less than planned"), tone: s.behind > 0 ? ("bad" as const) : ("good" as const), share: s.open ? s.behind / s.open : 0 },
    { icon: AlertTriangle, label: t("Over budget"), value: s.overBudget, hint: s.headingOver ? t.plural(s.headingOver, "Spent more than budget · {count} more heading over", "Spent more than budget · {count} more heading over") : t("Spent more than budget"), tone: s.overBudget > 0 ? ("bad" as const) : ("good" as const), share: s.open ? s.overBudget / s.open : 0 },
    { icon: ShieldAlert, label: t("High risks"), value: levels.high, hint: t("{medium} medium · {low} low", { medium: levels.medium, low: levels.low }), tone: levels.high > 0 ? ("bad" as const) : ("good" as const) },
  ];

  return (
    <div className="grid grid-cols-1 gap-6">
      <dl className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {tiles.map((k) => (
          <StatTile key={k.label} icon={k.icon} label={k.label} value={k.value} hint={k.hint} tone={k.tone} share={"share" in k ? k.share : undefined} shareLabel={k.label} />
        ))}
      </dl>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <Panel id="pf-progress" title={t("Average accomplishment")} icon={Gauge}>
          <div className="px-5 pb-5">
            <p className="text-xs text-muted-foreground">{t("Each project counts equally.")}</p>
            <p className="mt-3 text-5xl font-bold tracking-tight tabular-nums">{fmtPct(s.avgActual)}</p>
            {s.avgActual !== null && <AccomplishmentMeter actual={s.avgActual} planned={s.avgPlanned} label={t("Average accomplishment")} className="mt-4" />}
            <p className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground">
              {s.avgPlanned !== null && <span aria-hidden className="h-3 w-0.5 rounded-full bg-foreground/60" />}
              {s.avgPlanned === null ? t("No schedule") : t("Planned by today: {pct}", { pct: fmtPct(s.avgPlanned) })}
            </p>
          </div>
        </Panel>

        <Panel
          id="pf-risks"
          title={t("Top risks")}
          icon={ShieldAlert}
          action={
            <div className="flex gap-1.5 text-xs">
              {(["high", "medium", "low"] as const).map((l) => {
                const st = LEVEL_STYLE[l];
                return (
                  <span key={l} className={cn("inline-flex items-center gap-1 rounded border px-1.5 py-0.5", st.badge)}>
                    <st.icon className="size-3" aria-hidden />
                    {t(st.label)} <span className="tabular-nums">{levels[l]}</span>
                  </span>
                );
              })}
            </div>
          }
        >
          {risks.length === 0 ? (
            <p className="px-5 pb-5 text-sm text-muted-foreground">{t("No active risks in these projects.")}</p>
          ) : (
            <ol className="divide-y border-t">
              {risks.slice(0, 5).map((r) => (
                <li key={r.id}>
                  <Link href={`${base}/p/${r.projectKey}/risks?risk=${r.id}`} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-5 py-3 text-sm transition-colors hover:bg-accent">
                    <RiskLevelBadge likelihood={r.likelihood} impact={r.impact} t={t} />
                    <span className="min-w-0 flex-1 truncate font-medium">{r.title}</span>
                    <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">{r.projectName}</span>
                  </Link>
                </li>
              ))}
            </ol>
          )}
        </Panel>
      </div>

      {s.money.length > 0 && (
        <Panel id="pf-money" title={t("Money")} icon={Wallet}>
          <p className="-mt-1 px-5 text-xs text-muted-foreground">
            {t("Per currency. Expected final cost uses each project's forecast; a project without one yet counts at its budget.")}
          </p>
          <ul className="grid gap-3 p-5 lg:grid-cols-2 2xl:grid-cols-3">
            {s.money.map((m) => {
              const money = (v: number) => formatMoney(v, m.currency, t.intl);
              const over = m.overBy !== null && m.overBy > 0;
              return (
                <li key={m.currency} className="rounded-xl border bg-muted/30 p-4">
                  <p className="text-xs text-muted-foreground">
                    {m.currency} · {t.plural(m.projects, "{count} project", "{count} projects")}
                  </p>
                  <dl className="mt-2 grid grid-cols-3 gap-3 text-sm">
                    <div>
                      <dt className="text-xs text-muted-foreground">{t("Budget")}</dt>
                      <dd className="font-semibold tabular-nums">{money(m.budget)}</dd>
                    </div>
                    <div>
                      <dt className="text-xs text-muted-foreground">{t("Spent")}</dt>
                      <dd className={cn("font-semibold tabular-nums", m.budget > 0 && m.spent > m.budget && "text-destructive")}>{money(m.spent)}</dd>
                    </div>
                    <div>
                      <dt className="text-xs text-muted-foreground">{t("Expected final cost")}</dt>
                      <dd className={cn("font-semibold tabular-nums", over && "text-destructive")}>{money(m.expected)}</dd>
                    </div>
                  </dl>
                  {m.overBy !== null ? (
                    <p className={cn("mt-2 flex items-center gap-1.5 text-xs font-medium", over ? "text-destructive" : "text-green-700 dark:text-green-400")}>
                      {over ? <TrendingUp className="size-3.5" aria-hidden /> : <TrendingDown className="size-3.5" aria-hidden />}
                      {over ? t("Heading {amount} over budget", { amount: money(m.overBy) }) : m.overBy < 0 ? t("Heading {amount} under budget", { amount: money(-m.overBy) }) : t("Heading for the budget")}
                    </p>
                  ) : (
                    <p className="mt-2 text-xs text-muted-foreground">
                      {t.plural(m.withoutBudget, "{count} project has no budget, so there's no over / under total.", "{count} projects have no budget, so there's no over / under total.")}
                    </p>
                  )}
                </li>
              );
            })}
          </ul>
        </Panel>
      )}
    </div>
  );
}
