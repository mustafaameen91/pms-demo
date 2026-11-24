import { FileOutput } from "lucide-react";
import { financePage } from "@/lib/finance/page";
import { invoiceRows } from "@/lib/data/finance";
import { getT } from "@/i18n/server";
import { PageHeader, PageShell } from "@/components/page/kit";
import { FinanceTabs } from "@/components/finance/finance-tabs";
import { DocList } from "@/components/finance/invoices";

export async function generateMetadata() {
  const t = await getT();
  return { title: t("Invoices") };
}

export default async function InvoicesPage({ params }: PageProps<"/w/[slug]/finance/invoices">) {
  const { slug } = await params;
  const { workspace, today, base } = await financePage(slug);
  const t = await getT();
  const rows = await invoiceRows(workspace.id, today);
  return (
    <PageShell>
      <PageHeader icon={FileOutput} title={t("Invoices")} description={t("What you bill customers, what they've paid and what's still owed.")}>
        <FinanceTabs slug={workspace.slug} overdue={rows.filter((r) => r.state === "overdue").length} />
      </PageHeader>
      <DocList
        rows={rows.map((r) => ({ id: r.inv.id, code: r.code, contact: r.contact, project: r.project, date: r.inv.date, dueDate: r.inv.dueDate, currency: r.inv.currency, total: r.totals.total, open: r.open, state: r.state }))}
        hrefBase={`${base}/invoices`}
        newHref={`${base}/invoices/new`}
        newLabel={t("New invoice")}
        kind="invoice"
      />
    </PageShell>
  );
}

