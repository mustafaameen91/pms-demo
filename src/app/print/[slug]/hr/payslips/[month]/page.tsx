import { notFound } from "next/navigation";
import { requireWorkspace } from "@/lib/auth/session";
import { getPayrollRun } from "@/lib/data/hr-ops";
import { getCompanyProfile } from "@/lib/data/company";
import { isWorkspaceAdmin } from "@/lib/permissions";
import { PAY_BASES, labelOf } from "@/lib/hr";
import { getT, tFor } from "@/i18n/server";
import { DocTitle, FactGrid, HrPrintShell, MoneyTable, Sheet, Signatures, docMoney } from "@/components/hr/hr-print";

export async function generateMetadata({ params }: PageProps<"/print/[slug]/hr/payslips/[month]">) {
  const { month } = await params;
  const t = await getT();
  return { title: `${t("Payslips")} ${month}` };
}

/** Payslips for a month on the letterhead: everyone (one per page) or one person (?employee=). */
export default async function PrintPayslips({ params, searchParams }: PageProps<"/print/[slug]/hr/payslips/[month]">) {
  const [{ slug, month }, q, t] = await Promise.all([params, searchParams, getT()]);
  const { workspace } = await requireWorkspace(slug);
  if (!isWorkspaceAdmin(workspace.role)) notFound();
  const data = await getPayrollRun(workspace.id, month);
  if (!data) notFound();
  const profile = await getCompanyProfile(workspace.id);
  const lang = q.lang === "en" || q.lang === "ar" ? q.lang : profile.defaultLanguage === "en" ? "en" : "ar";
  const tr = tFor(lang);
  const m = docMoney(tr);
  const slips = typeof q.employee === "string" ? data.slips.filter((s) => s.employeeId === q.employee) : data.slips;
  if (slips.length === 0) notFound();
  const title = new Date(Number(month.slice(0, 4)), Number(month.slice(5)) - 1, 1).toLocaleDateString(tr.intl, { month: "long", year: "numeric" });
  const qs = (l: string) => `?lang=${l}${typeof q.employee === "string" ? `&employee=${q.employee}` : ""}`;

  return (
    <HrPrintShell
      back={`/w/${workspace.slug}/hr/payroll/${month}`}
      backLabel={t("← Back to payroll")}
      switchHref={qs(lang === "ar" ? "en" : "ar")}
      switchLabel={lang === "ar" ? "English" : "العربية"}
    >
      {slips.map((s) => {
        const rows: [string, string, "plus" | "minus" | null][] = [
          [tr("Basic pay"), m(s.basicEarned, s.currency), null],
          ...s.allowances.map((a) => [a.name, m(a.amount, s.currency), null] as [string, string, null]),
          ...(Number(s.overtimePay) ? [[tr("Overtime ({hours} h)", { hours: Number(s.overtimeHours) }), m(s.overtimePay, s.currency), null] as [string, string, null]] : []),
          ...s.additions.map((a) => [a.name, m(a.amount, s.currency), null] as [string, string, null]),
          [tr("Gross pay"), m(s.gross, s.currency), null],
          ...(Number(s.ssEmployee) ? [[tr("Social security"), m(s.ssEmployee, s.currency), "minus"] as [string, string, "minus"]] : []),
          ...(Number(s.loanDeduction) ? [[tr("Loan instalment"), m(s.loanDeduction, s.currency), "minus"] as [string, string, "minus"]] : []),
          ...s.deductions.map((a) => [a.name, m(a.amount, s.currency), "minus"] as [string, string, "minus"]),
        ];
        return (
          <Sheet key={s.id} profile={profile} lang={lang}>
            <DocTitle title={tr("Payslip")} subtitle={title} />
            <FactGrid
              items={[
                [tr("Name"), s.name],
                [tr("Number"), <bdi key="c" dir="ltr">{s.code}</bdi>],
                [tr("Job title"), s.jobTitle],
                [tr("Department"), s.department],
                [tr("Pay period"), tr(labelOf(PAY_BASES, s.payBasis))],
                [tr("Working days"), String(Number(s.workingDays))],
                [tr("Paid days"), String(Number(s.paidDays))],
                [tr("Absent"), String(Number(s.absentDays))],
                [tr("Unpaid leave"), String(Number(s.unpaidLeaveDays))],
                [tr("Overtime hours"), String(Number(s.overtimeHours))],
                [tr("Bank"), s.bankName],
                [tr("Account number / IBAN"), s.bankAccount ? <bdi key="b" dir="ltr">{s.bankAccount}</bdi> : null],
              ]}
            />
            <MoneyTable head={[tr("Item"), tr("Amount")]} rows={rows} total={[tr("Net pay"), m(s.net, s.currency)]} />
            <Signatures names={[tr("Employee"), tr("Accountant"), tr("Manager")]} profile={profile} />
          </Sheet>
        );
      })}
    </HrPrintShell>
  );
}
