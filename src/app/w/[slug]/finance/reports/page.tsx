import Link from "next/link";
import { ArrowDownLeft, ArrowUpRight, ChartPie, Download, Printer, Scale, TrendingUp, Wallet, type LucideIcon } from "lucide-react";
import { financePage } from "@/lib/finance/page";
import { PERIODS, REPORTS, periodRange, reportData, type Period, type ReportKey } from "@/lib/finance/report-data";
import { cn, formatDate, formatMoney } from "@/lib/utils";
import { getT } from "@/i18n/server";
import { Button } from "@/components/ui/button";
import { PageHeader, PageShell, StatTile } from "@/components/page/kit";
import { FinanceTabs } from "@/components/finance/finance-tabs";
import { ReportBody } from "@/components/finance/report-body";
import { PeriodForm } from "@/components/finance/period-form";

export async function generateMetadata() {
  const t = await getT();
  return { title: t("Reports") };
}

const PERIOD_LABEL: Record<Period, string> = { this_month: "This month", last_month: "Last month", this_quarter: "This quarter", this_year: "This financial year", last_year: "Last financial year", custom: "Custom" };
const isDay = (v: unknown): v is string => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v);

export default async function ReportsPage({ params, searchParams }: PageProps<"/w/[slug]/finance/reports">) {
  const [{ slug }, q] = await Promise.all([params, searchParams]);
  const { workspace, settings, today, base } = await financePage(slug);
  const t = await getT();
  const key = (REPORTS.find((r) => r.key === q.r)?.key ?? "pl") as ReportKey;
  const period = (PERIODS.find((p) => p === q.p) ?? "this_year") as Period;
  const range = periodRange(period, today, settings.fiscalYearStart, isDay(q.from) ? q.from : undefined, isDay(q.to) ? q.to : undefined);
  const data = await reportData(workspace.id, settings, key, range.from, range.to, today);
  const asOfOnly = key === "bs" || key === "tb" || key === "ar" || key === "ap";
  const m = (c: number) => formatMoney(c / 100, settings.baseCurrency, t.intl);
  // Headline numbers above the statement (the table has the detail).
  const tiles: { label: string; value: number; icon: LucideIcon; tone?: "good" | "bad" | "default"; hint?: string }[] =
    data.key === "pl"
      ? [
          { label: t("Income"), value: data.pl.totalIncome, icon: ArrowDownLeft },
          { label: t("Expenses"), value: data.pl.totalExpenses, icon: ArrowUpRight },
          {
            label: data.pl.profit >= 0 ? t("Profit") : t("Loss"),
            value: Math.abs(data.pl.profit),
            icon: TrendingUp,
            tone: data.pl.profit >= 0 ? "good" : "bad",
            hint: data.pl.totalIncome ? t("{percent}% of income", { percent: Math.round((data.pl.profit / data.pl.totalIncome) * 100) }) : undefined,
          },
        ]
      : data.key === "bs"
        ? [
            { label: t("Total assets"), value: data.bs.totalAssets, icon: Wallet },
            { label: t("Total liabilities"), value: data.bs.totalLiabilities, icon: Scale },
            { label: t("Total equity"), value: data.bs.totalEquity, icon: TrendingUp, tone: data.bs.totalEquity < 0 ? "bad" : "default" },
          ]
        : data.key === "cf"
          ? [
              { label: t("Cash at the start"), value: data.cf.start, icon: Wallet },
              { label: t("Change in the period"), value: data.cf.change, icon: data.cf.change < 0 ? ArrowUpRight : ArrowDownLeft, tone: data.cf.change < 0 ? "bad" : "good" },
              { label: t("Cash at the end"), value: data.cf.end, icon: Wallet },
            ]
          : data.key === "tax"
            ? [
                { label: t("{name} collected on sales", { name: data.tax.name }), value: data.tax.collected, icon: ArrowDownLeft },
                { label: t("{name} paid on purchases", { name: data.tax.name }), value: data.tax.paid, icon: ArrowUpRight },
                { label: data.tax.net >= 0 ? t("To pay the tax office") : t("To claim back"), value: Math.abs(data.tax.net), icon: Scale, tone: data.tax.net >= 0 ? "bad" : "good" },
              ]
            : [];
  const qs = (patch: Record<string, string>) => {
    const p = new URLSearchParams({ r: key, p: period, ...(period === "custom" ? range : {}), ...patch });
    return `?${p}`;
  };
  return (
    <PageShell>
      <PageHeader
        icon={ChartPie}
        title={t("Reports")}
        description={t("Amounts in {currency}. Click an account to see its entries.", { currency: settings.baseCurrency })}
        actions={
          <>
            <Button variant="outline" asChild>
              <a href={`${base}/reports/export${qs({})}`}>
                <Download className="size-4" />
                Excel
              </a>
            </Button>
            <Button variant="outline" asChild>
              <a href={`/print/${workspace.slug}/finance/report${qs({})}`} target="_blank" rel="noopener">
                <Printer className="size-4" />
                {t("Print / PDF")}
              </a>
            </Button>
          </>
        }
      >
        <FinanceTabs slug={workspace.slug} />
      </PageHeader>
      <nav aria-label={t("Reports")} className="flex flex-wrap gap-1">
        {REPORTS.map((r) => (
          <Link key={r.key} href={qs({ r: r.key })} aria-current={key === r.key ? "page" : undefined} className={cn("rounded-full border bg-card px-3.5 py-1.5 text-sm text-muted-foreground transition-colors hover:border-primary/30 hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring", key === r.key && "border-primary bg-primary font-medium text-primary-foreground hover:text-primary-foreground")}>
            {t(r.label)}
          </Link>
        ))}
      </nav>
      <PeriodForm
        report={key}
        period={period}
        periods={PERIODS.map((p) => ({ value: p, label: t(PERIOD_LABEL[p]) }))}
        from={range.from}
        to={range.to}
        summary={asOfOnly ? t("As of {date}", { date: formatDate(range.to, t.intl) }) : t("{from} to {to}", { from: formatDate(range.from, t.intl), to: formatDate(range.to, t.intl) })}
      />
      {tiles.length > 0 && (
        <dl className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          {tiles.map((x) => (
            <StatTile key={x.label} icon={x.icon} label={x.label} value={m(x.value)} tone={x.tone} hint={x.hint} />
          ))}
        </dl>
      )}
      <section aria-label={t(REPORTS.find((r) => r.key === key)!.label)} className="overflow-hidden rounded-2xl border bg-card">
        <h2 className="border-b px-4 py-3 font-semibold">{t(REPORTS.find((r) => r.key === key)!.label)}</h2>
        <ReportBody data={data} t={t} currency={settings.baseCurrency} accountHref={(id) => `${base}/accounts/${id}`} />
      </section>
    </PageShell>
  );
}
