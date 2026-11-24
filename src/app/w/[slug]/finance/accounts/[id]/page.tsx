import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowDownLeft, ArrowUpRight, BookOpen, Landmark, Scale } from "lucide-react";
import { financePage } from "@/lib/finance/page";
import { listAccounts } from "@/lib/finance/ledger";
import { journal } from "@/lib/data/finance";
import { cents, debitNormal } from "@/lib/finance/core";
import { cn, formatDate, formatMoney } from "@/lib/utils";
import { getT } from "@/i18n/server";
import { PageHeader, PageShell, Panel, StatTile } from "@/components/page/kit";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FinanceTabs } from "@/components/finance/finance-tabs";
import { sourceHref } from "@/lib/finance/links";
import { withRunningBalance } from "@/lib/finance/reports";

/** An account's statement: every entry that touched it, with a running balance. */
export default async function AccountPage({ params, searchParams }: PageProps<"/w/[slug]/finance/accounts/[id]">) {
  const [{ slug, id }, q] = await Promise.all([params, searchParams]);
  const { workspace, settings, base } = await financePage(slug);
  const t = await getT();
  const accounts = await listAccounts(workspace.id);
  const acc = accounts.find((a) => a.id === id);
  if (!acc) notFound();
  const from = typeof q.from === "string" && /^\d{4}-\d{2}-\d{2}$/.test(q.from) ? q.from : null;
  const to = typeof q.to === "string" && /^\d{4}-\d{2}-\d{2}$/.test(q.to) ? q.to : null;
  const rows = (await journal(workspace.id, { accountId: id, limit: 100000 })).sort((a, b) => a.entry.date.localeCompare(b.entry.date) || a.entry.number - b.entry.number);
  // Money accounts show their own currency; other accounts the main currency.
  const own = acc.moneyKind ? (acc.currency ?? settings.baseCurrency) : settings.baseCurrency;
  const sign = debitNormal(acc.type) ? 1 : -1;
  const moves = rows.flatMap((r) =>
    r.lines
      .filter((l) => l.l.accountId === id)
      .map((l) => ({ entry: r.entry, line: l, amount: sign * (acc.moneyKind && l.l.currency === own ? cents(l.l.amountFx) : cents(l.l.debit) - cents(l.l.credit)) })),
  );
  // Running balance after each line.
  const lines = withRunningBalance(moves);
  const running = lines.at(-1)?.balance ?? 0;
  const opening = from ? (lines.filter((l) => l.entry.date < from).at(-1)?.balance ?? 0) : 0;
  const shown = lines.filter((l) => (!from || l.entry.date >= from) && (!to || l.entry.date <= to)).reverse();
  const m = (c: number) => formatMoney(c / 100, own, t.intl);
  const moneyIn = shown.reduce((s, l) => s + Math.max(0, l.amount), 0);
  const moneyOut = shown.reduce((s, l) => s + Math.max(0, -l.amount), 0);
  const period =
    from && to
      ? t("{from} to {to}", { from: formatDate(from, t.intl), to: formatDate(to, t.intl) })
      : from
        ? t("Since {date}", { date: formatDate(from, t.intl) })
        : to
          ? t("Up to {date}", { date: formatDate(to, t.intl) })
          : t("All dates");
  return (
    <PageShell>
      <PageHeader
        icon={acc.moneyKind ? Landmark : BookOpen}
        back={acc.moneyKind ? { href: `${base}/accounts`, label: t("Cash & bank") } : { href: `${base}/books`, label: t("Books") }}
        title={<span dir="auto">{t(acc.name)}</span>}
        description={
          <>
            <span dir="ltr">{acc.code}</span>
            {acc.bankName && <> · {[acc.bankName, acc.accountNumber].filter(Boolean).join(" · ")}</>}
          </>
        }
        actions={
          <div className="grid gap-0.5 rounded-2xl bg-white/10 px-4 py-3 text-end ring-1 ring-white/15 backdrop-blur-sm">
            <span className="text-xs text-white/75">{t("Balance|account")}</span>
            <span className={cn("text-2xl font-bold tabular-nums", running < 0 && acc.moneyKind && "rounded-md bg-white px-1.5 text-destructive")}>{m(running)}</span>
          </div>
        }
      >
        <FinanceTabs slug={workspace.slug} />
      </PageHeader>
      <dl className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatTile icon={ArrowDownLeft} tone="good" label={acc.moneyKind ? t("Money in") : t("Increase")} value={m(moneyIn)} hint={period} />
        <StatTile icon={ArrowUpRight} label={acc.moneyKind ? t("Money out") : t("Decrease")} value={m(moneyOut)} hint={period} />
        <StatTile icon={Scale} tone={moneyIn - moneyOut < 0 ? "bad" : "default"} label={t("Change in the period")} value={m(moneyIn - moneyOut)} hint={t.plural(shown.length, "{count} entry", "{count} entries")} />
      </dl>
      <form className="flex flex-wrap items-end gap-3 rounded-2xl border bg-card p-4">
        <div className="grid gap-1.5">
          <Label htmlFor="st-from">{t("From")}</Label>
          <Input id="st-from" type="date" name="from" defaultValue={from ?? ""} className="w-40" />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="st-to">{t("To")}</Label>
          <Input id="st-to" type="date" name="to" defaultValue={to ?? ""} className="w-40" />
        </div>
        <Button type="submit">{t("Show")}</Button>
        {(from || to) && (
          <Button variant="ghost" asChild>
            <Link href="?">{t("All dates")}</Link>
          </Button>
        )}
      </form>
      <Panel id="acc-statement" title={t("Statement")} icon={BookOpen} count={shown.length}>
        {shown.length === 0 ? (
          <p className="px-5 pb-5 text-sm text-muted-foreground">{t("Nothing in this period.")}</p>
        ) : (
          <div className="relative overflow-x-auto border-t">
            <table className="w-full min-w-[40rem] text-sm">
              <thead className="text-xs text-muted-foreground">
                <tr className="border-b">
                  <th className="px-5 py-2 text-start font-medium">{t("Date")}</th>
                  <th className="px-3 py-2 text-start font-medium">{t("What")}</th>
                  <th className="px-3 py-2 text-end font-medium">{acc.moneyKind ? t("In") : t("Increase")}</th>
                  <th className="px-3 py-2 text-end font-medium">{acc.moneyKind ? t("Out") : t("Decrease")}</th>
                  <th className="px-5 py-2 text-end font-medium">{t("Balance|account")}</th>
                </tr>
              </thead>
              <tbody>
                {shown.map((l) => {
                  const href = sourceHref(base, l.entry.source, l.entry.sourceId, workspace.slug);
                  return (
                    <tr key={l.line.l.id} className="border-b last:border-0">
                      <td className="px-5 py-2 whitespace-nowrap text-muted-foreground">{formatDate(l.entry.date, t.intl)}</td>
                      <td className="px-3 py-2">
                        {href ? (
                          <Link href={href} className="hover:text-primary" dir="auto">
                            {l.entry.memo}
                          </Link>
                        ) : (
                          <span dir="auto">{l.entry.memo}</span>
                        )}
                        {l.line.contact && <span className="block text-xs text-muted-foreground" dir="auto">{l.line.contact}</span>}
                      </td>
                      <td className="px-3 py-2 text-end tabular-nums text-green-700 dark:text-green-400">{l.amount > 0 ? m(l.amount) : ""}</td>
                      <td className="px-3 py-2 text-end tabular-nums">{l.amount < 0 ? m(-l.amount) : ""}</td>
                      <td className="px-5 py-2 text-end font-medium tabular-nums">{m(l.balance)}</td>
                    </tr>
                  );
                })}
              </tbody>
              {from && (
                <tfoot>
                  <tr className="border-t text-muted-foreground">
                    <td colSpan={4} className="px-5 py-2 text-end">
                      {t("Balance before {date}", { date: formatDate(from, t.intl) })}
                    </td>
                    <td className="px-5 py-2 text-end tabular-nums">{m(opening)}</td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        )}
      </Panel>
    </PageShell>
  );
}
