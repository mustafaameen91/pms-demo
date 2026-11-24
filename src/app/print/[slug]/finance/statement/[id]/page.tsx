import { notFound } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { requireWorkspace } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { contacts } from "@/lib/db/schema";
import { getCompanyProfile } from "@/lib/data/company";
import { isWorkspaceAdmin } from "@/lib/permissions";
import { contactStatement } from "@/lib/finance/statement";
import { todayISO } from "@/lib/accomplishment";
import { formatDate } from "@/lib/utils";
import { getT, tFor } from "@/i18n/server";
import { DocTitle, FactGrid, HrPrintShell, Sheet, docMoney } from "@/components/hr/hr-print";

export async function generateMetadata() {
  const t = await getT();
  return { title: t("Statement of account") };
}

export default async function PrintStatement({ params, searchParams }: PageProps<"/print/[slug]/finance/statement/[id]">) {
  const [{ slug, id }, q, t] = await Promise.all([params, searchParams, getT()]);
  const { workspace } = await requireWorkspace(slug);
  if (!isWorkspaceAdmin(workspace.role)) notFound();
  const [c] = await db.select().from(contacts).where(and(eq(contacts.id, id), eq(contacts.workspaceId, workspace.id)));
  if (!c) notFound();
  const today = todayISO();
  const s = await contactStatement(workspace.id, id, today);
  const profile = await getCompanyProfile(workspace.id);
  const lang = q.lang === "en" || q.lang === "ar" ? q.lang : profile.defaultLanguage === "en" ? "en" : "ar";
  const tr = tFor(lang);
  const m = docMoney(tr);
  const label = { invoice: tr("Invoice"), bill: tr("Bill"), payment_in: tr("Payment received"), payment_out: tr("Payment made") };
  return (
    <HrPrintShell back={`/w/${workspace.slug}/finance/contacts/${id}`} backLabel={t("← Back")} switchHref={`?lang=${lang === "ar" ? "en" : "ar"}`} switchLabel={lang === "ar" ? "English" : "العربية"}>
      <Sheet profile={profile} lang={lang}>
        <DocTitle title={tr("Statement of account")} subtitle={formatDate(today, tr.intl)} />
        <FactGrid items={[[tr("Name"), c.name], [tr("Tax number"), c.taxNumber], [tr("Phone"), c.phone ? <bdi key="p" dir="ltr">{c.phone}</bdi> : null], [tr("Address"), c.address]]} />
        <table className="mb-6 w-full border-collapse text-[10pt]">
          <thead>
            <tr style={{ backgroundColor: "color-mix(in srgb, var(--brand) 12%, white)" }}>
              <th className="border border-gray-300 px-2 py-1.5 text-start">{tr("Date")}</th>
              <th className="border border-gray-300 px-2 py-1.5 text-start">{tr("What")}</th>
              <th className="border border-gray-300 px-2 py-1.5 text-end">{tr("Amount")}</th>
              <th className="border border-gray-300 px-2 py-1.5 text-end">{tr("Balance|account")}</th>
            </tr>
          </thead>
          <tbody>
            {s.lines.map((l) => (
              <tr key={`${l.kind}-${l.id}`}>
                <td className="border border-gray-300 px-2 py-1">{formatDate(l.date, tr.intl)}</td>
                <td className="border border-gray-300 px-2 py-1">
                  {label[l.kind]} <bdi dir="ltr">{l.code}</bdi>
                </td>
                <td className="border border-gray-300 px-2 py-1 text-end tabular-nums">
                  <bdi dir="ltr">
                    {l.sign < 0 ? "−" : ""}
                    {m(l.amount / 100, l.currency)}
                  </bdi>
                </td>
                <td className="border border-gray-300 px-2 py-1 text-end tabular-nums">
                  <bdi dir="ltr">{m(l.balance / 100, l.currency)}</bdi>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {s.balances.map((b) => (
          <p key={b.currency} className="text-[11pt] font-bold">
            {b.balance >= 0 ? (c.kind === "supplier" ? tr("Balance we owe") : tr("Balance due")) : tr("Balance in your favour")}: <bdi dir="ltr">{m(Math.abs(b.balance) / 100, b.currency)}</bdi>
          </p>
        ))}
      </Sheet>
    </HrPrintShell>
  );
}
