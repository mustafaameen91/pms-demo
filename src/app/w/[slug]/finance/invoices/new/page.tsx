import { FileOutput } from "lucide-react";
import { financePage } from "@/lib/finance/page";
import { invoiceEditorData } from "@/lib/finance/editor-data";
import { addDays } from "@/lib/hr-rules";
import { getT } from "@/i18n/server";
import { PageHeader, PageShell } from "@/components/page/kit";
import { FinanceTabs } from "@/components/finance/finance-tabs";
import { InvoiceEditor } from "@/components/finance/invoices";

export async function generateMetadata() {
  const t = await getT();
  return { title: t("New invoice") };
}

export default async function NewInvoicePage({ params, searchParams }: PageProps<"/w/[slug]/finance/invoices/new">) {
  const [{ slug }, q] = await Promise.all([params, searchParams]);
  const { workspace, user, settings, today } = await financePage(slug);
  const t = await getT();
  const d = await invoiceEditorData(workspace, user.id);
  const project = typeof q.project === "string" ? d.projects.find((p) => p.id === q.project || p.key === q.project) : undefined;
  const customer =
    (typeof q.contact === "string" ? d.contacts.find((c) => c.id === q.contact) : undefined) ??
    (project?.client ? d.contacts.find((c) => c.name.trim().toLowerCase() === project.client!.trim().toLowerCase()) : undefined);
  return (
    <PageShell>
      <PageHeader icon={FileOutput} title={t("New invoice")}>
        <FinanceTabs slug={workspace.slug} />
      </PageHeader>
      <InvoiceEditor
        slug={workspace.slug}
        invoiceId={null}
        contacts={d.contacts}
        projects={d.projects}
        baseCurrency={settings.baseCurrency}
        taxName={settings.taxName}
        paymentTermsDays={settings.paymentTermsDays}
        initial={{
          contactId: customer?.id ?? "",
          projectId: project?.id ?? null,
          date: today,
          dueDate: addDays(today, settings.paymentTermsDays),
          currency: project?.currency ?? customer?.currency ?? settings.baseCurrency,
          items: [{ description: "", unit: "", quantity: "1", unitPrice: "" }],
          taxRate: settings.taxRate,
          retentionPercent: "0",
          subject: project?.name ?? "",
          paymentDetails: d.paymentDetails,
          notes: "",
          language: d.language,
          style: d.style,
        }}
      />
    </PageShell>
  );
}
