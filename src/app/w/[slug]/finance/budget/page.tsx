import { Fragment } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight, Target } from "lucide-react";
import { financePage } from "@/lib/finance/page";
import { listAccounts, postedLines } from "@/lib/finance/ledger";
import { listBudgets } from "@/lib/data/finance";
import { natural } from "@/lib/finance/reports";
import { cents } from "@/lib/finance/core";
import { monthDays, shiftMonth } from "@/lib/hr-rules";
import { cn, formatMoney } from "@/lib/utils";
import { getT } from "@/i18n/server";
import { Button } from "@/components/ui/button";
import { PageHeader, PageShell } from "@/components/page/kit";
import { FinanceTabs } from "@/components/finance/finance-tabs";
import { BudgetEditor } from "@/components/finance/budget";

export async function generateMetadata() {
  const t = await getT();
  return { title: t("Budget") };
}

export default async function BudgetPage({ params, searchParams }: PageProps<"/w/[slug]/finance/budget">) {
  const [{ slug }, q] = await Promise.all([params, searchParams]);
  const { workspace, settings, today, base } = await financePage(slug);
  const t = await getT();
  const fy = settings.fiscalYearStart;
  const currentYear = Number(today.slice(5, 7)) >= fy ? Number(today.slice(0, 4)) : Number(today.slice(0, 4)) - 1;
  const year = Number(q.year) >= 2000 && Number(q.year) <= 2100 ? Number(q.year) : currentYear;
  const months = Array.from({ length: 12 }, (_, i) => shiftMonth(`${year}-${String(fy).padStart(2, "0")}`, i));
  const [accounts, lines, budgets] = await Promise.all([listAccounts(workspace.id), postedLines(workspace.id), listBudgets(workspace.id, year)]);
  const pl = accounts.filter((a) => (a.type === "income" || a.type === "expense") && !a.archivedAt);
  const actual = (accountId: string, mo: string) => {
    const a = accounts.find((x) => x.id === accountId)!;
    const end = monthDays(mo).at(-1)!;
    return natural(a, lines.filter((l) => l.accountId === accountId && l.date >= `${mo}-01` && l.date <= end).reduce((s, l) => s + l.debit - l.credit, 0));
  };
  const upto = months.filter((mo) => `${mo}-01` <= today);
  const view = q.view === "edit" ? "edit" : "compare";
  const m = (c: number) => formatMoney(c / 100, settings.baseCurrency, t.intl);
  const labels = months.map((mo) => new Date(Number(mo.slice(0, 4)), Number(mo.slice(5)) - 1, 1).toLocaleDateString(t.intl, { month: "short" }));
  const rows = pl.map((a) => {
    const b = budgets.find((x) => x.accountId === a.id);
    const plan = b?.months ?? Array(12).fill("0");
    const planYtd = upto.reduce((s, _, i) => s + cents(plan[i]), 0);
    const actualYtd = upto.reduce((s, mo) => s + actual(a.id, mo), 0);
    return { a, plan, planYtd, actualYtd, planYear: plan.reduce((s, v) => s + cents(v), 0) };
  });
  const shown = rows.filter((r) => r.planYear || r.actualYtd);
  const nav = (y: number) => `${base}/budget?year=${y}${view === "edit" ? "&view=edit" : ""}`;
  return (
    <PageShell>
      <PageHeader icon={Target} title={t("Budget")} description={t("Plan income and spending for the year, month by month, and see how the actual numbers compare.")}>
        <FinanceTabs slug={workspace.slug} />
      </PageHeader>
      <div className="flex flex-wrap items-center gap-2">
        <div className="inline-flex items-center rounded-lg border bg-card">
          <Button variant="ghost" size="icon" asChild aria-label={t("Previous year")}>
            <Link href={nav(year - 1)}>
              <ChevronLeft className="size-4 rtl:rotate-180" />
            </Link>
          </Button>
          <span className="px-3 text-sm font-semibold tabular-nums">{fy === 1 ? year : `${year}–${year + 1}`}</span>
          <Button variant="ghost" size="icon" asChild aria-label={t("Next year")}>
            <Link href={nav(year + 1)}>
              <ChevronRight className="size-4 rtl:rotate-180" />
            </Link>
          </Button>
        </div>
        <nav className="inline-flex rounded-lg border bg-card p-0.5" aria-label={t("Budget")}>
          <Link href={`${base}/budget?year=${year}`} aria-current={view === "compare" ? "page" : undefined} className={cn("rounded-md px-3 py-1.5 text-sm text-muted-foreground", view === "compare" && "bg-primary/10 font-medium text-primary")}>
            {t("Budget vs actual")}
          </Link>
          <Link href={`${base}/budget?year=${year}&view=edit`} aria-current={view === "edit" ? "page" : undefined} className={cn("rounded-md px-3 py-1.5 text-sm text-muted-foreground", view === "edit" && "bg-primary/10 font-medium text-primary")}>
            {t("Plan the budget")}
          </Link>
        </nav>
      </div>
      {view === "edit" ? (
        <BudgetEditor slug={workspace.slug} year={year} monthLabels={labels} rows={rows.map((r) => ({ accountId: r.a.id, code: r.a.code, name: r.a.name, type: r.a.type, months: r.plan }))} />
      ) : shown.length === 0 ? (
        <p className="rounded-2xl border bg-card px-5 py-10 text-center text-sm text-muted-foreground">
          {t("No budget for this year yet.")}{" "}
          <Link href={`${base}/budget?year=${year}&view=edit`} className="text-primary hover:underline">
            {t("Plan the budget")}
          </Link>
        </p>
      ) : (
        <section className="overflow-hidden rounded-2xl border bg-card">
          <p className="border-b px-4 py-2.5 text-sm text-muted-foreground">{t.plural(upto.length, "Year so far: {count} month", "Year so far: {count} months")}</p>
          <div className="relative overflow-x-auto">
            <table className="w-full min-w-[40rem] text-sm">
              <thead className="text-xs text-muted-foreground">
                <tr className="border-b">
                  <th className="px-4 py-2 text-start font-medium">{t("Account")}</th>
                  <th className="px-3 py-2 text-end font-medium">{t("Planned so far")}</th>
                  <th className="px-3 py-2 text-end font-medium">{t("Actual so far")}</th>
                  <th className="px-3 py-2 text-end font-medium">{t("Difference")}</th>
                  <th className="w-40 px-4 py-2 font-medium">
                    <span className="sr-only">{t("Share used")}</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {(["income", "expense"] as const).map((type) => (
                  <Fragment key={type}>
                    <tr className="bg-muted/40">
                      <th colSpan={5} className="px-4 py-2 text-start text-xs font-semibold text-muted-foreground uppercase">
                        {type === "income" ? t("Income") : t("Expenses")}
                      </th>
                    </tr>
                    {shown
                      .filter((r) => r.a.type === type)
                      .map((r) => {
                        const diff = r.actualYtd - r.planYtd;
                        // Spending over plan, or income under plan, is the bad direction.
                        const bad = type === "expense" ? diff > 0 : diff < 0;
                        const share = r.planYtd ? r.actualYtd / r.planYtd : null;
                        return (
                          <tr key={r.a.id} className="border-b last:border-0">
                            <td className="px-4 py-2" dir="auto">
                              <Link href={`${base}/accounts/${r.a.id}`} className="hover:text-primary">
                                {t(r.a.name)}
                              </Link>
                            </td>
                            <td className="px-3 py-2 text-end tabular-nums">{m(r.planYtd)}</td>
                            <td className="px-3 py-2 text-end tabular-nums">{m(r.actualYtd)}</td>
                            <td className={cn("px-3 py-2 text-end font-medium tabular-nums", diff !== 0 && (bad ? "text-destructive" : "text-green-700 dark:text-green-400"))}>
                              {diff > 0 ? "+" : ""}
                              {m(diff)}
                            </td>
                            <td className="px-4 py-2">
                              {share !== null && (
                                <div className="flex items-center gap-2">
                                  <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted" aria-hidden>
                                    <div className={cn("h-full rounded-full", bad ? "bg-destructive" : "bg-primary")} style={{ width: `${Math.min(100, Math.max(2, share * 100))}%` }} />
                                  </div>
                                  <span className="w-10 text-end text-xs text-muted-foreground tabular-nums">{Math.round(share * 100)}%</span>
                                </div>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </PageShell>
  );
}
