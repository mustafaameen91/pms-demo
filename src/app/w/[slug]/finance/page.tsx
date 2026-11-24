import Link from "next/link";
import { notFound } from "next/navigation";
import { and, count, eq } from "drizzle-orm";
import { AlertTriangle, ArrowDownLeft, ArrowUpRight, Banknote, CalendarClock, Landmark, PiggyBank, TrendingUp, Wallet } from "lucide-react";
import { requireWorkspace } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { documents, projects, resources } from "@/lib/db/schema";
import { isWorkspaceAdmin } from "@/lib/permissions";
import { ensureLedger, getFinanceSettings } from "@/lib/finance/ledger";
import { financeOverview } from "@/lib/finance/overview";
import { listIssues } from "@/lib/data/finance";
import { todayISO } from "@/lib/accomplishment";
import { cn, formatDate, formatMoney } from "@/lib/utils";
import { getT } from "@/i18n/server";
import { PageHeader, PageShell, Panel, StatTile } from "@/components/page/kit";
import { FinanceTabs } from "@/components/finance/finance-tabs";
import { FinanceSetup } from "@/components/finance/setup";
import { CashForecastChart, IncomeCostChart } from "@/components/finance/charts";

export async function generateMetadata() {
  const t = await getT();
  return { title: t("Finance") };
}

export default async function FinancePage({ params }: PageProps<"/w/[slug]/finance">) {
  const { slug } = await params;
  const { workspace } = await requireWorkspace(slug);
  if (!isWorkspaceAdmin(workspace.role)) notFound();
  const t = await getT();
  const today = todayISO();
  const settings = await getFinanceSettings(workspace.id);

  if (!settings) {
    const [[docs], [sup], [proj]] = await Promise.all([
      db.select({ n: count() }).from(documents).where(and(eq(documents.workspaceId, workspace.id), eq(documents.type, "invoice"))),
      db.select({ n: count() }).from(resources).where(and(eq(resources.workspaceId, workspace.id), eq(resources.type, "supplier"))),
      db.select({ currency: projects.currency }).from(projects).where(eq(projects.workspaceId, workspace.id)).limit(1),
    ]);
    return (
      <PageShell>
        <FinanceSetup slug={workspace.slug} today={today} currency={proj?.currency ?? "USD"} invoiceDocs={docs.n} suppliers={sup.n} />
      </PageShell>
    );
  }

  await ensureLedger(workspace.id);
  const [o, issues] = await Promise.all([financeOverview(workspace.id, settings, today), listIssues(workspace.id)]);
  const cur = settings.baseCurrency;
  const m = (c: number) => formatMoney(c / 100, cur, t.intl);
  const base = `/w/${workspace.slug}/finance`;
  const rateIssues = [...new Set(issues.filter((i) => i.kind === "rate").map((i) => String(i.detail.currency)))];
  const lockedIssues = issues.filter((i) => i.kind === "locked").length;

  return (
    <PageShell>
      <PageHeader icon={Landmark} title={t("Finance")} description={t("Money in, money out and what's left, from everything recorded in Tamm. Amounts in {currency}.", { currency: cur })}>
        <FinanceTabs slug={workspace.slug} overdue={o.overdueInvoices.length} />
      </PageHeader>

      {(rateIssues.length > 0 || o.missingRates.length > 0 || lockedIssues > 0) && (
        <div role="alert" className="flex flex-wrap items-center gap-3 rounded-2xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-950 dark:text-amber-100">
          <AlertTriangle className="size-4 shrink-0" aria-hidden />
          <span className="flex-1">
            {rateIssues.length + o.missingRates.length > 0 &&
              t("Some records are in {list} and need an exchange rate before they can go into the books.", { list: [...new Set([...rateIssues, ...o.missingRates])].join(", ") })}{" "}
            {lockedIssues > 0 && t.plural(lockedIssues, "{count} record changed in a closed period and wasn't updated in the books.", "{count} records changed in a closed period and weren't updated in the books.")}
          </span>
          <Link href={`${base}/settings#rates`} className="font-medium underline underline-offset-4">
            {t("Fix in settings")}
          </Link>
        </div>
      )}

      <dl className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile icon={Wallet} label={t("Cash now")} value={m(o.cash)} tone={o.cash < 0 ? "bad" : "default"} hint={t.plural(o.money.length, "In {count} cash or bank account", "In {count} cash and bank accounts")} />
        <StatTile icon={ArrowDownLeft} label={t("Customers owe us")} value={m(o.owedToUs)} hint={o.retention ? t("+ {amount} retention held", { amount: m(o.retention) }) : t.plural(o.overdueInvoices.length, "{count} invoice overdue", "{count} invoices overdue")} tone={o.overdueInvoices.length ? "bad" : "default"} />
        <StatTile icon={ArrowUpRight} label={t("We owe suppliers")} value={m(o.weOwe)} hint={t.plural(o.billsDueSoon.length, "{count} bill due in 14 days", "{count} bills due in 14 days")} />
        <StatTile icon={TrendingUp} label={t("Profit this year")} value={m(o.year.profit)} tone={o.year.profit < 0 ? "bad" : "good"} hint={t("This month: {amount}", { amount: m(o.thisMonth.profit) })} />
      </dl>

      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_24rem]">
        <div className="grid grid-cols-1 gap-6">
          <Panel id="fin-forecast" title={t("Cash forecast, next 12 weeks")} icon={CalendarClock}>
            <div className="grid gap-3 px-5 pb-5">
              <p className={cn("text-sm", o.forecast.firstShort ? "font-medium text-destructive" : "text-muted-foreground")}>
                {o.forecast.firstShort ? (
                  <>
                    <AlertTriangle className="me-1 inline size-4" aria-hidden />
                    {t("Cash runs short in the week of {date} unless more comes in.", { date: formatDate(o.forecast.firstShort.start, t.intl) })}
                  </>
                ) : (
                  t("Lowest point: {amount}. From invoices due in, bills due out and salaries (about {payroll} a month).", { amount: m(o.forecast.low), payroll: m(o.payrollEstimate) })
                )}
              </p>
              <CashForecastChart rows={o.forecast.rows} currency={cur} />
            </div>
          </Panel>
          <Panel id="fin-months" title={t("Income and costs, last 6 months")} icon={PiggyBank}>
            <div className="px-5 pb-5">
              <IncomeCostChart months={o.months} currency={cur} />
            </div>
          </Panel>
        </div>
        <div className="grid gap-6">
          <Panel id="fin-money" title={t("Cash and bank")} icon={Banknote} action={<Link href={`${base}/accounts`} className="text-sm text-primary hover:underline">{t("Open")}</Link>}>
            <ul className="divide-y border-t">
              {o.money.map((a) => (
                <li key={a.account.id} className="flex items-center justify-between gap-3 px-5 py-2.5 text-sm">
                  <Link href={`${base}/accounts/${a.account.id}`} className="min-w-0 truncate hover:text-primary" dir="auto">
                    {a.account.name}
                  </Link>
                  <span className={cn("font-semibold tabular-nums", a.own < 0 && "text-destructive")}>{formatMoney(a.own / 100, a.currency, t.intl)}</span>
                </li>
              ))}
            </ul>
          </Panel>
          <Panel id="fin-overdue" title={t("Overdue invoices")} icon={AlertTriangle} count={o.overdueInvoices.length} tone={o.overdueInvoices.length ? "danger" : undefined}>
            {o.overdueInvoices.length === 0 ? (
              <p className="px-5 pb-5 text-sm text-muted-foreground">{t("Nothing overdue.")}</p>
            ) : (
              <ul className="divide-y border-t">
                {o.overdueInvoices.slice(0, 8).map((i) => (
                  <li key={i.inv.id}>
                    <Link href={`${base}/invoices/${i.inv.id}`} className="flex items-center justify-between gap-3 px-5 py-2.5 text-sm hover:bg-muted/50">
                      <span className="min-w-0">
                        <span className="block truncate font-medium" dir="auto">
                          {i.contact}
                        </span>
                        <span className="block text-xs text-destructive">
                          {i.code} · {t("due {date}", { date: formatDate(i.inv.dueDate, t.intl) })}
                        </span>
                      </span>
                      <span className="font-semibold tabular-nums">{formatMoney(i.open / 100, i.inv.currency, t.intl)}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
          <Panel id="fin-bills" title={t("Bills due in 14 days")} icon={CalendarClock} count={o.billsDueSoon.length}>
            {o.billsDueSoon.length === 0 ? (
              <p className="px-5 pb-5 text-sm text-muted-foreground">{t("Nothing due soon.")}</p>
            ) : (
              <ul className="divide-y border-t">
                {o.billsDueSoon.slice(0, 8).map((b) => (
                  <li key={b.bill.id}>
                    <Link href={`${base}/bills?open=${b.bill.id}`} className="flex items-center justify-between gap-3 px-5 py-2.5 text-sm hover:bg-muted/50">
                      <span className="min-w-0">
                        <span className="block truncate font-medium" dir="auto">
                          {b.contact}
                        </span>
                        <span className={cn("block text-xs", b.state === "overdue" ? "text-destructive" : "text-muted-foreground")}>
                          {b.code} · {t("due {date}", { date: formatDate(b.bill.dueDate, t.intl) })}
                        </span>
                      </span>
                      <span className="font-semibold tabular-nums">{formatMoney(b.open / 100, b.bill.currency, t.intl)}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>
      </div>
    </PageShell>
  );
}
