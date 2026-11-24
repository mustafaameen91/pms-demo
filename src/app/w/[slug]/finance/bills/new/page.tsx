import { FileInput } from "lucide-react";
import { financePage } from "@/lib/finance/page";
import { billFormData } from "@/lib/finance/editor-data";
import { addDays } from "@/lib/hr-rules";
import { getT } from "@/i18n/server";
import { PageHeader, PageShell } from "@/components/page/kit";
import { FinanceTabs } from "@/components/finance/finance-tabs";
import { BillForm } from "@/components/finance/bill-form";

export async function generateMetadata() {
  const t = await getT();
  return { title: t("New bill") };
}

export default async function NewBillPage({ params, searchParams }: PageProps<"/w/[slug]/finance/bills/new">) {
  const [{ slug }, q] = await Promise.all([params, searchParams]);
  const { workspace, settings, today } = await financePage(slug);
  const t = await getT();
  const d = await billFormData(workspace.id);
  return (
    <PageShell>
      <PageHeader icon={FileInput} title={t("New bill")}>
        <FinanceTabs slug={workspace.slug} />
      </PageHeader>
      <BillForm
        slug={workspace.slug}
        billId={null}
        suppliers={d.suppliers}
        projects={d.projects}
        accounts={d.accounts}
        orders={d.orders}
        baseCurrency={settings.baseCurrency}
        taxName={settings.taxName}
        file={null}
        editable
        cancellable={false}
        initial={{
          contactId: typeof q.contact === "string" && d.suppliers.some((x) => x.id === q.contact) ? q.contact : "",
          reference: "",
          projectId: "",
          accountId: d.accounts.find((a) => a.systemKey === "exp_materials")?.id ?? d.accounts[0]?.id ?? "",
          date: today,
          dueDate: addDays(today, 30),
          currency: settings.baseCurrency,
          items: [{ description: "", unit: "", quantity: "1", unitPrice: "" }],
          taxRate: "0",
          notes: "",
          documentId: "",
        }}
      />
    </PageShell>
  );
}
