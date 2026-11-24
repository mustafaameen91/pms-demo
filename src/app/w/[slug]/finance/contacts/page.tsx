import { Users } from "lucide-react";
import { financePage } from "@/lib/finance/page";
import { listContacts } from "@/lib/finance/ledger";
import { billRows, invoiceRows } from "@/lib/data/finance";
import { getT } from "@/i18n/server";
import { PageHeader, PageShell } from "@/components/page/kit";
import { FinanceTabs } from "@/components/finance/finance-tabs";
import { ContactsView } from "@/components/finance/contacts";

export async function generateMetadata() {
  const t = await getT();
  return { title: t("Customers & suppliers") };
}

export default async function ContactsPage({ params }: PageProps<"/w/[slug]/finance/contacts">) {
  const { slug } = await params;
  const { workspace, settings, today } = await financePage(slug);
  const t = await getT();
  const [contacts, invs, bls] = await Promise.all([listContacts(workspace.id), invoiceRows(workspace.id, today), billRows(workspace.id, today)]);
  return (
    <PageShell>
      <PageHeader icon={Users} title={t("Customers & suppliers")} description={t("Who you bill and who you buy from, and where each of you stands.")}>
        <FinanceTabs slug={workspace.slug} />
      </PageHeader>
      <ContactsView
        slug={workspace.slug}
        baseCurrency={settings.baseCurrency}
        rows={contacts.map((c) => {
          const owes = new Map<string, number>();
          for (const i of invs) if (i.inv.contactId === c.id && i.inv.status === "issued") owes.set(i.inv.currency, (owes.get(i.inv.currency) ?? 0) + i.open + i.retentionOpen);
          for (const b of bls) if (b.bill.contactId === c.id && b.bill.status === "open") owes.set(b.bill.currency, (owes.get(b.bill.currency) ?? 0) + b.open);
          return {
            id: c.id,
            kind: c.kind as "customer" | "supplier" | "both",
            name: c.name,
            email: c.email,
            phone: c.phone,
            address: c.address,
            taxNumber: c.taxNumber,
            currency: c.currency,
            notes: c.notes,
            archived: Boolean(c.archivedAt),
            owes: [...owes].map(([currency, amount]) => ({ currency, amount })),
            overdue: invs.filter((i) => i.inv.contactId === c.id && i.state === "overdue").length + bls.filter((b) => b.bill.contactId === c.id && b.state === "overdue").length,
          };
        })}
      />
    </PageShell>
  );
}
