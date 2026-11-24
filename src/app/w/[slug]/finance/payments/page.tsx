import { ArrowLeftRight } from "lucide-react";
import { financePage } from "@/lib/finance/page";
import { billRows, invoiceRows, paymentRows } from "@/lib/data/finance";
import { moneyAccounts } from "@/lib/finance/editor-data";
import { listContacts } from "@/lib/finance/ledger";
import { getT } from "@/i18n/server";
import { PageHeader, PageShell } from "@/components/page/kit";
import { FinanceTabs } from "@/components/finance/finance-tabs";
import { PaymentButton } from "@/components/finance/payment-dialog";
import { PaymentsList } from "@/components/finance/payments-list";

export async function generateMetadata() {
  const t = await getT();
  return { title: t("Payments") };
}

export default async function PaymentsPage({ params }: PageProps<"/w/[slug]/finance/payments">) {
  const { slug } = await params;
  const { workspace, settings, today } = await financePage(slug);
  const t = await getT();
  const [pays, invs, bls, accounts, contacts] = await Promise.all([paymentRows(workspace.id), invoiceRows(workspace.id, today), billRows(workspace.id, today), moneyAccounts(workspace.id, settings.baseCurrency), listContacts(workspace.id)]);
  const active = contacts.filter((c) => !c.archivedAt);
  return (
    <PageShell>
      <PageHeader
        icon={ArrowLeftRight}
        title={t("Payments")}
        description={t("Money received from customers and paid to suppliers. Each one prints as a receipt or payment voucher.")}
        actions={
          <>
            <PaymentButton
              slug={workspace.slug}
              direction="out"
              variant="outline"
              contacts={active.filter((c) => c.kind !== "customer").map((c) => ({ id: c.id, name: c.name }))}
              accounts={accounts}
              docs={bls.filter((b) => b.bill.status === "open" && b.open > 0).map((b) => ({ id: b.bill.id, code: b.code, contactId: b.bill.contactId, currency: b.bill.currency, open: b.open, dueDate: b.bill.dueDate }))}
            />
            <PaymentButton
              slug={workspace.slug}
              direction="in"
              contacts={active.filter((c) => c.kind !== "supplier").map((c) => ({ id: c.id, name: c.name }))}
              accounts={accounts}
              docs={invs.filter((i) => i.inv.status === "issued" && i.open + i.retentionOpen > 0).map((i) => ({ id: i.inv.id, code: i.code, contactId: i.inv.contactId, currency: i.inv.currency, open: i.open + i.retentionOpen, dueDate: i.inv.dueDate }))}
            />
          </>
        }
      >
        <FinanceTabs slug={workspace.slug} />
      </PageHeader>
      <PaymentsList
        slug={workspace.slug}
        rows={pays.map((p) => ({
          id: p.p.id,
          code: p.code,
          direction: p.p.direction,
          contactId: p.p.contactId,
          contact: p.contact,
          account: p.account,
          date: p.p.date,
          amount: p.p.amount,
          currency: p.p.currency,
          reference: p.p.reference,
          allocations: p.allocations,
          locked: Boolean(settings.lockedUntil && p.p.date <= settings.lockedUntil),
        }))}
      />
    </PageShell>
  );
}
