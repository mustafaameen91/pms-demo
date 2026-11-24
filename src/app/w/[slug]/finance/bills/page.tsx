import { FileInput } from "lucide-react";
import { financePage } from "@/lib/finance/page";
import { billRows } from "@/lib/data/finance";
import { getT } from "@/i18n/server";
import { PageHeader, PageShell } from "@/components/page/kit";
import { FinanceTabs } from "@/components/finance/finance-tabs";
import { DocList } from "@/components/finance/invoices";

export async function generateMetadata() {
  const t = await getT();
  return { title: t("Bills") };
}

export default async function BillsPage({ params }: PageProps<"/w/[slug]/finance/bills">) {
  const { slug } = await params;
  const { workspace, today, base } = await financePage(slug);
  const t = await getT();
  const rows = await billRows(workspace.id, today);
  return (
    <PageShell>
      <PageHeader icon={FileInput} title={t("Bills")} description={t("What suppliers bill you: what you owe, to whom and by when.")}>
        <FinanceTabs slug={workspace.slug} />
      </PageHeader>
      <DocList
        rows={rows.map((r) => ({ id: r.bill.id, code: r.bill.reference ? `${r.code} · ${r.bill.reference}` : r.code, contact: r.contact, project: r.project, date: r.bill.date, dueDate: r.bill.dueDate, currency: r.bill.currency, total: r.totals.total, open: r.open, state: r.state }))}
        hrefBase={`${base}/bills`}
        newHref={`${base}/bills/new`}
        newLabel={t("New bill")}
        kind="bill"
      />
    </PageShell>
  );
}
