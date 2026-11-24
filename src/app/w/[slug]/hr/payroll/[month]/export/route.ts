import { and, eq } from "drizzle-orm";
import { headers } from "next/headers";
import ExcelJS from "exceljs";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { member, organization } from "@/lib/db/schema";
import { getWorkspaceAccess } from "@/lib/billing";
import { getPayrollRun } from "@/lib/data/hr-ops";
import { PAY_BASES, labelOf } from "@/lib/hr";
import { getT } from "@/i18n/server";

/** The month's payroll and a bank-transfer sheet (one row per person with an account). */
export async function GET(_request: Request, ctx: RouteContext<"/w/[slug]/hr/payroll/[month]/export">) {
  const [{ slug, month }, t] = await Promise.all([ctx.params, getT()]);
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return new Response(t("Unauthorized"), { status: 401 });
  const [ws] = await db
    .select({ id: organization.id, role: member.role, slug: organization.slug })
    .from(organization)
    .innerJoin(member, and(eq(member.organizationId, organization.id), eq(member.userId, session.user.id)))
    .where(eq(organization.slug, slug))
    .limit(1);
  if (!ws || (ws.role !== "owner" && ws.role !== "admin")) return new Response(t("Not found"), { status: 404 });
  if (!(await getWorkspaceAccess(ws.id)).allowed) return new Response(t("This workspace's subscription isn't active."), { status: 402 });
  const data = await getPayrollRun(ws.id, month);
  if (!data) return new Response(t("Not found"), { status: 404 });

  const wb = new ExcelJS.Workbook();
  wb.creator = "Tamm";
  const rtl = t.locale === "ar";
  const sum = (l: { amount: string }[]) => l.reduce((a, x) => a + Number(x.amount), 0);
  const head = (s: ExcelJS.Worksheet) => {
    s.getRow(1).font = { bold: true };
    s.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFEEF0FB" } };
  };
  const money = "#,##0.00";

  const sheet = wb.addWorksheet(t("Payroll"), { views: [{ state: "frozen", ySplit: 1, rightToLeft: rtl }] });
  sheet.columns = [
    { header: t("Number"), key: "code", width: 11 },
    { header: t("Full name"), key: "name", width: 26 },
    { header: t("Department"), key: "dept", width: 16 },
    { header: t("Pay period"), key: "basis", width: 10 },
    { header: t("Currency"), key: "currency", width: 9 },
    { header: t("Working days"), key: "working", width: 10 },
    { header: t("Paid days"), key: "paid", width: 10 },
    { header: t("Absent"), key: "absent", width: 9 },
    { header: t("Unpaid leave"), key: "unpaid", width: 10 },
    { header: t("Overtime hours"), key: "otHours", width: 10 },
    { header: t("Basic"), key: "basic", width: 13, style: { numFmt: money } },
    { header: t("Allowances"), key: "allow", width: 13, style: { numFmt: money } },
    { header: t("Overtime"), key: "ot", width: 12, style: { numFmt: money } },
    { header: t("Additions"), key: "add", width: 12, style: { numFmt: money } },
    { header: t("Gross pay"), key: "gross", width: 14, style: { numFmt: money } },
    { header: t("Social security (employee)"), key: "ss", width: 14, style: { numFmt: money } },
    { header: t("Loan instalment"), key: "loan", width: 13, style: { numFmt: money } },
    { header: t("Other deductions"), key: "ded", width: 13, style: { numFmt: money } },
    { header: t("Net"), key: "net", width: 14, style: { numFmt: money } },
    { header: t("Social security (company)"), key: "ssCo", width: 14, style: { numFmt: money } },
  ];
  head(sheet);
  for (const s of data.slips)
    sheet.addRow({
      code: s.code,
      name: s.name,
      dept: s.department ?? "",
      basis: t(labelOf(PAY_BASES, s.payBasis)),
      currency: s.currency,
      working: Number(s.workingDays),
      paid: Number(s.paidDays),
      absent: Number(s.absentDays),
      unpaid: Number(s.unpaidLeaveDays),
      otHours: Number(s.overtimeHours),
      basic: Number(s.basicEarned),
      allow: sum(s.allowances),
      ot: Number(s.overtimePay),
      add: sum(s.additions),
      gross: Number(s.gross),
      ss: Number(s.ssEmployee),
      loan: Number(s.loanDeduction),
      ded: sum(s.deductions),
      net: Number(s.net),
      ssCo: Number(s.ssEmployer),
    });

  const bank = wb.addWorksheet(t("Bank transfer"), { views: [{ state: "frozen", ySplit: 1, rightToLeft: rtl }] });
  bank.columns = [
    { header: t("Full name"), key: "name", width: 28 },
    { header: t("Bank"), key: "bank", width: 22 },
    { header: t("Account number / IBAN"), key: "account", width: 30 },
    { header: t("Amount"), key: "amount", width: 15, style: { numFmt: money } },
    { header: t("Currency"), key: "currency", width: 9 },
    { header: t("Reference"), key: "ref", width: 18 },
  ];
  head(bank);
  for (const s of data.slips)
    if (Number(s.net) > 0)
      bank.addRow({ name: s.name, bank: s.bankName ?? "", account: s.bankAccount ?? t("No account: pay in cash"), amount: Number(s.net), currency: s.currency, ref: `${t("Salary")} ${month}` });

  const file = await wb.xlsx.writeBuffer();
  return new Response(new Uint8Array(file as ArrayBuffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="payroll-${ws.slug}-${month}.xlsx"`,
      "Cache-Control": "private, no-store",
    },
  });
}
