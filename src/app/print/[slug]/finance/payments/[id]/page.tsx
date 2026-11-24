import { notFound } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { requireWorkspace } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { contacts, finPayments, ledgerAccounts } from "@/lib/db/schema";
import { getCompanyProfile } from "@/lib/data/company";
import { paymentRows } from "@/lib/data/finance";
import { isWorkspaceAdmin } from "@/lib/permissions";
import { paymentCode } from "@/lib/finance/ledger";
import { amountInWords } from "@/lib/documents/words";
import { formatDate } from "@/lib/utils";
import { getT, tFor } from "@/i18n/server";
import { DocTitle, FactGrid, HrPrintShell, MoneyTable, Sheet, Signatures, docMoney } from "@/components/hr/hr-print";

export async function generateMetadata({ params }: PageProps<"/print/[slug]/finance/payments/[id]">) {
  const { slug, id } = await params;
  const { workspace } = await requireWorkspace(slug);
  const [p] = await db.select().from(finPayments).where(and(eq(finPayments.id, id), eq(finPayments.workspaceId, workspace.id)));
  return { title: p ? paymentCode(p.direction, p.number) : "" };
}

/** Receipt (money in) or payment voucher (money out) on the letterhead. */
export default async function PrintPayment({ params, searchParams }: PageProps<"/print/[slug]/finance/payments/[id]">) {
  const [{ slug, id }, q, t] = await Promise.all([params, searchParams, getT()]);
  const { workspace } = await requireWorkspace(slug);
  if (!isWorkspaceAdmin(workspace.role)) notFound();
  const [row] = await db
    .select({ p: finPayments, contact: contacts.name, account: ledgerAccounts.name })
    .from(finPayments)
    .innerJoin(contacts, eq(contacts.id, finPayments.contactId))
    .innerJoin(ledgerAccounts, eq(ledgerAccounts.id, finPayments.moneyAccountId))
    .where(and(eq(finPayments.id, id), eq(finPayments.workspaceId, workspace.id)));
  if (!row) notFound();
  const profile = await getCompanyProfile(workspace.id);
  const lang = q.lang === "en" || q.lang === "ar" ? q.lang : profile.defaultLanguage === "en" ? "en" : "ar";
  const tr = tFor(lang);
  const m = (v: string | number) => docMoney(tr)(v, row.p.currency);
  const allocs = (await paymentRows(workspace.id, { contactId: row.p.contactId })).find((x) => x.p.id === id)?.allocations ?? [];
  const inN = row.p.direction === "in";
  const rest = Number(row.p.amount) - allocs.reduce((s, a) => s + Number(a.amount), 0);
  return (
    <HrPrintShell back={`/w/${workspace.slug}/finance/payments`} backLabel={t("← Back")} switchHref={`?lang=${lang === "ar" ? "en" : "ar"}`} switchLabel={lang === "ar" ? "English" : "العربية"}>
      <Sheet profile={profile} lang={lang}>
        <DocTitle title={inN ? tr("Receipt|voucher") : tr("Payment voucher")} subtitle={paymentCode(row.p.direction, row.p.number)} />
        <FactGrid
          items={[
            [inN ? tr("Received from") : tr("Paid to"), row.contact],
            [tr("Date"), formatDate(row.p.date, tr.intl)],
            [tr("Amount"), <bdi key="a" dir="ltr">{m(row.p.amount)}</bdi>],
            [inN ? tr("Into") : tr("Paid from"), row.account],
            [tr("Reference"), row.p.reference],
            [tr("Method"), row.p.method],
          ]}
        />
        <p className="mb-4 text-[10pt]">
          <span className="text-gray-600">{tr("Amount in words")}: </span>
          {amountInWords(Number(row.p.amount), row.p.currency, lang)}
        </p>
        {(allocs.length > 0 || rest > 0) && (
          <MoneyTable
            head={[tr("For"), tr("Amount")]}
            rows={[...allocs.map((a) => [a.code, m(a.amount), null] as [string, string, null]), ...(rest > 0.004 ? [[tr("Advance on account"), m(rest), null] as [string, string, null]] : [])]}
            total={[tr("Total"), m(row.p.amount)]}
          />
        )}
        {row.p.note && <p className="mb-4 text-[10pt] whitespace-pre-wrap">{row.p.note}</p>}
        <Signatures names={inN ? [tr("Paid by"), tr("Received by")] : [tr("Received by"), tr("Accountant")]} profile={profile} />
      </Sheet>
    </HrPrintShell>
  );
}
