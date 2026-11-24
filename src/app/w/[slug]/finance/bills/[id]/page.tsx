import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowUpRight, CircleDollarSign, Clock, FileInput } from "lucide-react";
import { financePage } from "@/lib/finance/page";
import { billFormData, moneyAccounts } from "@/lib/finance/editor-data";
import { billRows, paymentRows } from "@/lib/data/finance";
import { listContacts } from "@/lib/finance/ledger";
import { formatDate, formatMoney } from "@/lib/utils";
import { getT } from "@/i18n/server";
import { BAND_PILL, PageHeader, PageShell, Panel, StatTile } from "@/components/page/kit";
import { FinanceTabs } from "@/components/finance/finance-tabs";
import { BillForm } from "@/components/finance/bill-form";
import { PaymentButton } from "@/components/finance/payment-dialog";
import { StateBadge } from "@/components/finance/ui";

export default async function BillPage({ params }: PageProps<"/w/[slug]/finance/bills/[id]">) {
  const { slug, id } = await params;
  const { workspace, settings, today, base } = await financePage(slug);
  const t = await getT();
  const all = await billRows(workspace.id, today);
  const row = all.find((r) => r.bill.id === id);
  if (!row) notFound();
  const b = row.bill;
  const [d, pays, accounts, contacts] = await Promise.all([billFormData(workspace.id), paymentRows(workspace.id, { contactId: b.contactId }), moneyAccounts(workspace.id, settings.baseCurrency), listContacts(workspace.id)]);
  const mine = pays.filter((p) => p.allocations.some((a) => a.billId === id));
  const m = (c: number) => formatMoney(c / 100, b.currency, t.intl);
  const locked = Boolean(settings.lockedUntil && b.date <= settings.lockedUntil);
  const openDocs = all.filter((r) => r.bill.status === "open" && r.open > 0).map((r) => ({ id: r.bill.id, code: r.code, contactId: r.bill.contactId, currency: r.bill.currency, open: r.open, dueDate: r.bill.dueDate }));
  return (
    <PageShell>
      <PageHeader
        icon={FileInput}
        back={{ href: `${base}/bills`, label: t("Bills") }}
        title={
          <>
            <span dir="ltr">{row.code}</span>
            <StateBadge state={row.state} className={BAND_PILL} />
          </>
        }
        description={
          <span dir="auto">
            <Link href={`${base}/contacts/${b.contactId}`} className="font-semibold text-white underline-offset-4 hover:underline">
              {row.contact}
            </Link>
            {" · "}
            {t("due {date}", { date: formatDate(b.dueDate, t.intl) })}
          </span>
        }
        actions={
          b.status === "open" &&
          row.open > 0 && (
            <PaymentButton slug={workspace.slug} direction="out" contacts={contacts.map((c) => ({ id: c.id, name: c.name }))} accounts={accounts} docs={openDocs} docId={b.id} contactId={b.contactId} label={t("Pay this bill")} />
          )
        }
      >
        <FinanceTabs slug={workspace.slug} />
      </PageHeader>
      <dl className="grid gap-4 sm:grid-cols-3">
        <StatTile icon={CircleDollarSign} label={t("Total")} value={m(row.totals.total)} />
        <StatTile icon={ArrowUpRight} tone="good" label={t("Paid so far")} value={m(row.paid)} share={row.totals.total ? row.paid / row.totals.total : 0} shareLabel={t("Share paid")} />
        <StatTile icon={Clock} tone={row.state === "overdue" ? "bad" : "default"} label={t("Still to pay")} value={m(row.open)} />
      </dl>
      {mine.length > 0 && (
        <Panel id="bill-payments" title={t("Payments")} icon={ArrowUpRight} count={mine.length}>
          <ul className="divide-y border-t">
            {mine.map((p) => (
              <li key={p.p.id} className="flex items-center justify-between gap-3 px-5 py-2.5 text-sm">
                <a href={`/print/${workspace.slug}/finance/payments/${p.p.id}`} target="_blank" rel="noopener" className="font-medium text-primary hover:underline" dir="ltr">
                  {p.code}
                </a>
                <span className="text-muted-foreground">
                  {formatDate(p.p.date, t.intl)} · {p.account}
                </span>
                <span className="font-semibold tabular-nums">{formatMoney(p.allocations.find((a) => a.billId === id)!.amount, b.currency, t.intl)}</span>
              </li>
            ))}
          </ul>
        </Panel>
      )}
      <BillForm
        slug={workspace.slug}
        billId={b.id}
        suppliers={d.suppliers}
        projects={d.projects}
        accounts={d.accounts}
        orders={[]}
        baseCurrency={settings.baseCurrency}
        taxName={settings.taxName}
        file={b.filePath ? { name: b.fileName ?? t("File"), href: `/api/files/hr/bill/${b.id}` } : null}
        editable={b.status === "open" && !locked}
        cancellable={b.status === "open" && row.paid === 0 && !locked}
        initial={{
          contactId: b.contactId,
          reference: b.reference ?? "",
          projectId: b.projectId ?? "",
          accountId: b.accountId,
          date: b.date,
          dueDate: b.dueDate,
          currency: b.currency,
          items: b.items,
          taxRate: b.taxRate,
          notes: b.notes ?? "",
          documentId: b.documentId ?? "",
        }}
      />
    </PageShell>
  );
}
