import Link from "next/link";
import { notFound } from "next/navigation";
import { FileOutput, Printer } from "lucide-react";
import { financePage } from "@/lib/finance/page";
import { invoiceRows, paymentRows } from "@/lib/data/finance";
import { moneyAccounts } from "@/lib/finance/editor-data";
import { listContacts } from "@/lib/finance/ledger";
import { cn, formatDate, formatMoney } from "@/lib/utils";
import { getT } from "@/i18n/server";
import { BAND_PILL, PageHeader, PageShell, Panel, StatTile } from "@/components/page/kit";
import { FinanceTabs } from "@/components/finance/finance-tabs";
import { InvoiceActions } from "@/components/finance/invoice-actions";
import { PaymentButton } from "@/components/finance/payment-dialog";
import { StateBadge } from "@/components/finance/ui";
import { ArrowDownLeft, CircleDollarSign, Clock, Landmark } from "lucide-react";

export default async function InvoicePage({ params }: PageProps<"/w/[slug]/finance/invoices/[id]">) {
  const { slug, id } = await params;
  const { workspace, settings, today, base } = await financePage(slug);
  const t = await getT();
  const all = await invoiceRows(workspace.id, today);
  const row = all.find((r) => r.inv.id === id);
  if (!row) notFound();
  const inv = row.inv;
  const [pays, accounts, contacts] = await Promise.all([paymentRows(workspace.id, { contactId: inv.contactId }), moneyAccounts(workspace.id, settings.baseCurrency), listContacts(workspace.id)]);
  const mine = pays.filter((p) => p.allocations.some((a) => a.invoiceId === id));
  const m = (c: number) => formatMoney(c / 100, inv.currency, t.intl);
  const locked = Boolean(settings.lockedUntil && inv.date <= settings.lockedUntil);
  const openDocs = all.filter((r) => r.inv.status === "issued" && r.open + r.retentionOpen > 0).map((r) => ({ id: r.inv.id, code: r.code, contactId: r.inv.contactId, currency: r.inv.currency, open: r.open + r.retentionOpen, dueDate: r.inv.dueDate }));
  return (
    <PageShell>
      <PageHeader
        icon={FileOutput}
        back={{ href: `${base}/invoices`, label: t("Invoices") }}
        title={
          <>
            <span dir="ltr">{row.code}</span>
            <StateBadge state={row.state} className={BAND_PILL} />
          </>
        }
        description={
          <span dir="auto">
            <Link href={`${base}/contacts/${inv.contactId}`} className="font-semibold text-white underline-offset-4 hover:underline">
              {row.contact}
            </Link>
            {row.project && (
              <>
                {" · "}
                <Link href={`/w/${workspace.slug}/p/${row.projectKey}`} className="underline-offset-4 hover:underline">
                  {row.project}
                </Link>
              </>
            )}
            {" · "}
            {formatDate(inv.date, t.intl)} → {t("due {date}", { date: formatDate(inv.dueDate, t.intl) })}
          </span>
        }
        actions={
          <>
            {inv.status === "issued" && row.open + row.retentionOpen > 0 && (
              <PaymentButton slug={workspace.slug} direction="in" contacts={contacts.map((c) => ({ id: c.id, name: c.name }))} accounts={accounts} docs={openDocs} docId={inv.id} contactId={inv.contactId} />
            )}
            <InvoiceActions slug={workspace.slug} id={inv.id} status={inv.status} paid={row.paid} locked={locked} />
          </>
        }
      >
        <FinanceTabs slug={workspace.slug} />
      </PageHeader>

      <dl className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile icon={CircleDollarSign} label={t("Total")} value={m(row.totals.total)} hint={row.totals.tax ? t("incl. {tax} {name}", { tax: m(row.totals.tax), name: settings.taxName }) : undefined} />
        <StatTile icon={ArrowDownLeft} tone="good" label={t("Paid so far")} value={m(row.paid)} share={row.totals.total ? row.paid / row.totals.total : 0} shareLabel={t("Share paid")} />
        <StatTile icon={Clock} tone={row.state === "overdue" ? "bad" : "default"} label={t("Still to pay now")} value={m(row.open)} hint={row.state === "overdue" ? t("Overdue since {date}", { date: formatDate(inv.dueDate, t.intl) }) : undefined} />
        <StatTile icon={Landmark} label={t("Retention held")} value={m(row.retentionOpen)} hint={Number(inv.retentionPercent) ? t("{percent}% until handover", { percent: Number(inv.retentionPercent) }) : t("None")} />
      </dl>

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <Panel id="inv-lines" title={inv.subject || t("Lines")} icon={FileOutput} action={<a href={`/print/${workspace.slug}/finance/invoices/${inv.id}`} target="_blank" rel="noopener" className="inline-flex items-center gap-1 text-sm text-primary hover:underline"><Printer className="size-4" />{t("Print / PDF")}</a>}>
          <div className="relative overflow-x-auto border-t">
            <table className="w-full min-w-[32rem] text-sm">
              <thead className="text-xs text-muted-foreground">
                <tr className="border-b">
                  <th className="px-5 py-2 text-start font-medium">{t("Description")}</th>
                  <th className="px-3 py-2 text-end font-medium">{t("Qty")}</th>
                  <th className="px-3 py-2 text-end font-medium">{t("Unit price")}</th>
                  <th className="px-5 py-2 text-end font-medium">{t("Amount")}</th>
                </tr>
              </thead>
              <tbody>
                {inv.items.map((l, i) => (
                  <tr key={i} className="border-b last:border-0">
                    <td className="px-5 py-2.5" dir="auto">
                      {l.description}
                    </td>
                    <td className="px-3 py-2.5 text-end tabular-nums">
                      {Number(l.quantity)} {l.unit}
                    </td>
                    <td className="px-3 py-2.5 text-end tabular-nums">{formatMoney(l.unitPrice, inv.currency, t.intl)}</td>
                    <td className="px-5 py-2.5 text-end tabular-nums">{formatMoney(Number(l.quantity) * Number(l.unitPrice), inv.currency, t.intl)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="text-sm">
                <tr className="border-t">
                  <td colSpan={3} className="px-5 py-1.5 text-end text-muted-foreground">
                    {t("Subtotal")}
                  </td>
                  <td className="px-5 py-1.5 text-end tabular-nums">{m(row.totals.subtotal)}</td>
                </tr>
                {row.totals.tax > 0 && (
                  <tr>
                    <td colSpan={3} className="px-5 py-1.5 text-end text-muted-foreground">
                      {settings.taxName} {Number(inv.taxRate)}%
                    </td>
                    <td className="px-5 py-1.5 text-end tabular-nums">{m(row.totals.tax)}</td>
                  </tr>
                )}
                <tr className="font-semibold">
                  <td colSpan={3} className="px-5 py-1.5 text-end">
                    {t("Total")}
                  </td>
                  <td className="px-5 py-1.5 text-end tabular-nums">{m(row.totals.total)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
          {inv.notes && (
            <p className="border-t px-5 py-3 text-sm whitespace-pre-wrap text-muted-foreground" dir="auto">
              {inv.notes}
            </p>
          )}
        </Panel>
        <Panel id="inv-payments" title={t("Payments")} icon={ArrowDownLeft} count={mine.length}>
          {mine.length === 0 ? (
            <p className="px-5 pb-5 text-sm text-muted-foreground">{inv.status === "issued" ? t("Nothing received yet.") : inv.status === "draft" ? t("Issue the invoice to receive payments on it.") : t("Cancelled.")}</p>
          ) : (
            <ul className="divide-y border-t">
              {mine.map((p) => {
                const a = p.allocations.find((x) => x.invoiceId === id)!;
                return (
                  <li key={p.p.id} className="flex items-center justify-between gap-3 px-5 py-2.5 text-sm">
                    <span className="min-w-0">
                      <a href={`/print/${workspace.slug}/finance/payments/${p.p.id}`} target="_blank" rel="noopener" className="font-medium text-primary hover:underline" dir="ltr">
                        {p.code}
                      </a>
                      <span className="block text-xs text-muted-foreground">
                        {formatDate(p.p.date, t.intl)} · {p.account}
                      </span>
                    </span>
                    <span className={cn("font-semibold tabular-nums")}>{formatMoney(a.amount, inv.currency, t.intl)}</span>
                  </li>
                );
              })}
            </ul>
          )}
        </Panel>
      </div>
    </PageShell>
  );
}
