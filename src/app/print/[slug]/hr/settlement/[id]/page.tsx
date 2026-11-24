import { notFound } from "next/navigation";
import { requireWorkspace } from "@/lib/auth/session";
import { getEmployee } from "@/lib/data/hr";
import { computeSettlement } from "@/lib/data/hr-ops";
import { getCompanyProfile } from "@/lib/data/company";
import { isWorkspaceAdmin } from "@/lib/permissions";
import { employeeCode, labelOf } from "@/lib/hr";
import { LEAVING_REASONS } from "@/lib/hr-rules";
import { formatDate } from "@/lib/utils";
import { getT, tFor } from "@/i18n/server";
import { DocTitle, FactGrid, HrPrintShell, MoneyTable, Sheet, Signatures, docMoney } from "@/components/hr/hr-print";

export async function generateMetadata() {
  const t = await getT();
  return { title: t("Final settlement") };
}

export default async function PrintSettlement({ params, searchParams }: PageProps<"/print/[slug]/hr/settlement/[id]">) {
  const [{ slug, id }, q, t] = await Promise.all([params, searchParams, getT()]);
  const { workspace } = await requireWorkspace(slug);
  if (!isWorkspaceAdmin(workspace.role)) notFound();
  const e = await getEmployee(workspace.id, id);
  if (!e) notFound();
  const pay = typeof q.pay === "string" ? q.pay.split(",").filter(Boolean) : undefined;
  const s = await computeSettlement(workspace.id, e, pay);
  const profile = await getCompanyProfile(workspace.id);
  const lang = q.lang === "en" || q.lang === "ar" ? q.lang : profile.defaultLanguage === "en" ? "en" : "ar";
  const tr = tFor(lang);
  const m = (v: string | number) => docMoney(tr)(v, s.currency);
  const rows: [string, string, "plus" | "minus" | null][] = [
    [tr("End-of-service pay ({days} days{share})", { days: s.eos.days, share: s.eos.percent < 100 ? ` × ${s.eos.percent}%` : "" }), m(s.eos.amount), null],
    ...s.leave.filter((l) => l.included).map((l) => [tr("Unused {type}: {days} days", { type: tr(l.name), days: l.days }), m(l.amount), null] as [string, string, null]),
    ...(s.loansOwed ? [[tr("Loans still owed"), m(s.loansOwed), "minus"] as [string, string, "minus"]] : []),
  ];
  const years = Math.floor(s.years);
  const months = Math.round((s.years - years) * 12);
  return (
    <HrPrintShell
      back={`/w/${workspace.slug}/hr/${e.id}/leaving`}
      backLabel={t("← Back")}
      switchHref={`?lang=${lang === "ar" ? "en" : "ar"}${pay ? `&pay=${pay.join(",")}` : ""}`}
      switchLabel={lang === "ar" ? "English" : "العربية"}
    >
      <Sheet profile={profile} lang={lang}>
        <DocTitle title={tr("Final settlement")} subtitle={formatDate(s.end, tr.intl)} />
        <FactGrid
          items={[
            [tr("Name"), e.name],
            [tr("Number"), <bdi key="c" dir="ltr">{employeeCode(e.number)}</bdi>],
            [tr("Job title"), e.jobTitle],
            [tr("Hire date"), formatDate(e.hireDate, tr.intl)],
            [tr("Last working day"), formatDate(s.end, tr.intl)],
            [tr("Service"), `${tr.plural(years, "{count} year", "{count} years")} ${months ? `${tr(" and ")}${tr.plural(months, "{count} month", "{count} months")}` : ""}`],
            [tr("Reason"), e.endReason ? tr(labelOf(LEAVING_REASONS, e.endReason)) : null],
            [tr("Monthly wage used"), m(s.monthlyWage)],
          ]}
        />
        <MoneyTable head={[tr("Item"), tr("Amount")]} rows={rows} total={[tr("Net owed to the employee"), m(s.net)]} />
        <p className="mb-2 text-[10pt] text-gray-700">{tr("Pay for the last month is paid through that month's payroll.")}</p>
        {s.assetsHeld.length > 0 && <p className="mb-2 text-[10pt] text-red-700">{tr("Assets not yet returned: {list}", { list: s.assetsHeld.map((a) => `${a.name} (${a.code})`).join(tr(", ")) })}</p>}
        <p className="mt-4 text-[10pt] leading-relaxed">{tr("I received the amount above in full and final settlement of all my dues from the company.")}</p>
        <Signatures names={[tr("Employee"), tr("HR"), tr("Manager")]} profile={profile} />
      </Sheet>
    </HrPrintShell>
  );
}
