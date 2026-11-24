import { notFound } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { requireWorkspace } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { contacts, invoices, paymentAllocations, projects } from "@/lib/db/schema";
import { getCompanyProfile } from "@/lib/data/company";
import { getCompanyType } from "@/lib/data/document-settings";
import { isWorkspaceAdmin } from "@/lib/permissions";
import { isPaperStyle } from "@/lib/branding";
import { getFinanceSettings, invoiceCode } from "@/lib/finance/ledger";
import { cents, invoiceTotals } from "@/lib/finance/core";
import { getT, tFor } from "@/i18n/server";
import { LightTheme } from "@/components/light-theme";
import { Paper } from "@/components/documents/paper";
import { DocumentBody } from "@/components/documents/document-body";
import { docMoney } from "@/components/hr/hr-print";
import { PrintButton } from "../../../[key]/print-button";
import Link from "next/link";

export async function generateMetadata({ params }: PageProps<"/print/[slug]/finance/invoices/[id]">) {
  const { slug, id } = await params;
  const { workspace } = await requireWorkspace(slug);
  const [inv] = await db.select({ number: invoices.number }).from(invoices).where(and(eq(invoices.id, id), eq(invoices.workspaceId, workspace.id)));
  return { title: inv ? invoiceCode(inv.number) : "" };
}

/** An invoice on the letterhead, using the company's own Invoice form (labels, extra fields, terms). */
export default async function PrintInvoice({ params }: PageProps<"/print/[slug]/finance/invoices/[id]">) {
  const { slug, id } = await params;
  const t = await getT();
  const { workspace } = await requireWorkspace(slug);
  if (!isWorkspaceAdmin(workspace.role)) notFound();
  const [row] = await db
    .select({ inv: invoices, contact: contacts, project: projects.name })
    .from(invoices)
    .innerJoin(contacts, eq(contacts.id, invoices.contactId))
    .leftJoin(projects, eq(projects.id, invoices.projectId))
    .where(and(eq(invoices.id, id), eq(invoices.workspaceId, workspace.id)));
  if (!row) notFound();
  const [profile, def, settings, allocs] = await Promise.all([
    getCompanyProfile(workspace.id),
    getCompanyType(workspace.id, "invoice"),
    getFinanceSettings(workspace.id),
    db.select({ amount: paymentAllocations.amount }).from(paymentAllocations).where(eq(paymentAllocations.invoiceId, id)),
  ]);
  if (!def) notFound();
  const { inv, contact } = row;
  const lang = inv.language === "en" ? "en" : "ar";
  const tr = tFor(lang);
  const m = (c: number) => docMoney(tr)(c / 100, inv.currency);
  const totals = invoiceTotals(inv.items, inv.taxRate, inv.retentionPercent);
  const paid = allocs.reduce((s, a) => s + cents(a.amount), 0);
  const client = [contact.name, contact.address, contact.taxNumber ? `${tr("Tax number")}: ${contact.taxNumber}` : null].filter(Boolean).join("\n");
  return (
    <LightTheme>
      <style>{`@page { size: A4; margin: 0; } @media print { body { background: white; } }`}</style>
      <div className="min-h-dvh bg-neutral-200 py-6 print:bg-white print:py-0">
        <div className="mx-auto mb-4 flex w-[210mm] max-w-full items-center justify-between gap-4 px-2 print:hidden">
          <Link href={`/w/${workspace.slug}/finance/invoices/${inv.id}`} className="text-sm text-primary underline-offset-4 hover:underline">
            {t("← Back to the invoice")}
          </Link>
          <PrintButton />
        </div>
        <div className="mx-auto w-fit overflow-x-auto shadow-lg print:shadow-none">
          <Paper profile={profile} style={isPaperStyle(inv.style) ? inv.style : "classic"} lang={lang}>
            <DocumentBody
              def={def}
              doc={{
                number: inv.number,
                status: inv.status === "issued" ? "issued" : inv.status,
                date: inv.date,
                currency: inv.currency,
                data: { client, subject: inv.subject ?? "", dueDate: inv.dueDate, paymentDetails: inv.paymentDetails ?? "" },
                items: inv.items,
                taxRate: inv.taxRate,
              }}
              lang={lang}
              profile={profile}
              projectName={row.project ?? ""}
              afterTotals={
                (totals.retention > 0 || paid > 0 || (settings?.taxNumber && Number(inv.taxRate) > 0) || inv.notes) && (
                  <div className="mb-4 grid gap-1 text-[10pt]">
                    {settings?.taxNumber && Number(inv.taxRate) > 0 && <p className="text-gray-600">{tr("Our tax number: {number}", { number: settings.taxNumber })}</p>}
                    {totals.retention > 0 && (
                      <p>
                        {tr("Retention held ({percent}%)", { percent: Number(inv.retentionPercent) })}: <bdi dir="ltr">{m(totals.retention)}</bdi> · {tr("Due now")}: <bdi dir="ltr">{m(totals.due)}</bdi>
                      </p>
                    )}
                    {paid > 0 && (
                      <p>
                        {tr("Paid so far")}: <bdi dir="ltr">{m(paid)}</bdi> · {tr("Balance")}: <bdi dir="ltr">{m(Math.max(0, totals.total - paid))}</bdi>
                      </p>
                    )}
                    {inv.notes && <p className="whitespace-pre-wrap text-gray-700">{inv.notes}</p>}
                  </div>
                )
              }
            />
          </Paper>
        </div>
      </div>
    </LightTheme>
  );
}
