import { notFound } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { FileOutput } from "lucide-react";
import { db } from "@/lib/db";
import { invoices } from "@/lib/db/schema";
import { financePage } from "@/lib/finance/page";
import { invoiceEditorData } from "@/lib/finance/editor-data";
import { invoiceCode } from "@/lib/finance/ledger";
import { getT } from "@/i18n/server";
import { PageHeader, PageShell } from "@/components/page/kit";
import { FinanceTabs } from "@/components/finance/finance-tabs";
import { InvoiceEditor } from "@/components/finance/invoices";

export default async function EditInvoicePage({ params }: PageProps<"/w/[slug]/finance/invoices/[id]/edit">) {
  const { slug, id } = await params;
  const { workspace, user, settings } = await financePage(slug);
  const t = await getT();
  const [inv] = await db.select().from(invoices).where(and(eq(invoices.id, id), eq(invoices.workspaceId, workspace.id)));
  if (!inv || inv.status === "cancelled") notFound();
  const d = await invoiceEditorData(workspace, user.id);
  return (
    <PageShell>
      <PageHeader icon={FileOutput} title={t("Edit {code}", { code: invoiceCode(inv.number) })} description={inv.status === "issued" ? t("It's already issued: the books update when you save.") : undefined}>
        <FinanceTabs slug={workspace.slug} />
      </PageHeader>
      <InvoiceEditor
        slug={workspace.slug}
        invoiceId={inv.id}
        contacts={d.contacts}
        projects={d.projects}
        baseCurrency={settings.baseCurrency}
        taxName={settings.taxName}
        paymentTermsDays={settings.paymentTermsDays}
        initial={{
          contactId: inv.contactId,
          projectId: inv.projectId,
          date: inv.date,
          dueDate: inv.dueDate,
          currency: inv.currency,
          items: inv.items,
          taxRate: inv.taxRate,
          retentionPercent: inv.retentionPercent,
          progressPercent: inv.progressPercent,
          subject: inv.subject,
          paymentDetails: inv.paymentDetails,
          notes: inv.notes,
          language: inv.language === "en" ? "en" : "ar",
          style: (["classic", "modern", "minimal"].includes(inv.style) ? inv.style : "classic") as "classic" | "modern" | "minimal",
        }}
      />
    </PageShell>
  );
}
