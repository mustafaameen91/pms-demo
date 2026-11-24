import { and, eq } from "drizzle-orm";
import { headers } from "next/headers";
import ExcelJS from "exceljs";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { member, organization } from "@/lib/db/schema";
import { getWorkspaceAccess } from "@/lib/billing";
import { listDepartments, listEmployees } from "@/lib/data/hr";
import { EMPLOYMENT_TYPES, PAY_BASES, employeeCode, grossPay, isActive, labelOf } from "@/lib/hr";
import { todayISO } from "@/lib/accomplishment";
import { getT } from "@/i18n/server";

const isoToDate = (iso: string | null) => {
  if (!iso) return null;
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
};

/** Everyone's HR file as one Excel sheet (owners / admins). */
export async function GET(_request: Request, ctx: RouteContext<"/w/[slug]/hr/export">) {
  const [{ slug }, t] = await Promise.all([ctx.params, getT()]);
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

  const [employees, departments] = await Promise.all([listEmployees(ws.id), listDepartments(ws.id)]);
  const dep = new Map(departments.map((d) => [d.id, d.name]));
  const byId = new Map(employees.map((e) => [e.id, e.name]));
  const today = todayISO();

  const wb = new ExcelJS.Workbook();
  wb.creator = "Tamm";
  wb.created = new Date();
  const sheet = wb.addWorksheet(t("People|HR"), { views: [{ state: "frozen", ySplit: 1, rightToLeft: t.locale === "ar" }] });
  sheet.columns = [
    { header: t("Number"), key: "code", width: 11 },
    { header: t("Full name"), key: "name", width: 26 },
    { header: t("Name in the other language"), key: "nameAlt", width: 24 },
    { header: t("Job title"), key: "jobTitle", width: 22 },
    { header: t("Department"), key: "department", width: 18 },
    { header: t("Reports to"), key: "manager", width: 22 },
    { header: t("Employment type"), key: "type", width: 18 },
    { header: t("Status"), key: "status", width: 12 },
    { header: t("Hire date"), key: "hireDate", width: 12, style: { numFmt: "yyyy-mm-dd" } },
    { header: t("Probation ends"), key: "probation", width: 13, style: { numFmt: "yyyy-mm-dd" } },
    { header: t("Contract ends"), key: "contract", width: 13, style: { numFmt: "yyyy-mm-dd" } },
    { header: t("Last day"), key: "endDate", width: 12, style: { numFmt: "yyyy-mm-dd" } },
    { header: t("Date of birth"), key: "birthDate", width: 12, style: { numFmt: "yyyy-mm-dd" } },
    { header: t("Nationality"), key: "nationality", width: 14 },
    { header: t("ID number"), key: "nationalId", width: 16 },
    { header: t("Phone"), key: "phone", width: 16 },
    { header: t("Email"), key: "email", width: 24 },
    { header: t("Pay period"), key: "basis", width: 10 },
    { header: t("Basic pay"), key: "basic", width: 13, style: { numFmt: "#,##0.00" } },
    { header: t("Total with allowances"), key: "gross", width: 15, style: { numFmt: "#,##0.00" } },
    { header: t("Currency"), key: "currency", width: 9 },
    { header: t("Bank"), key: "bank", width: 16 },
    { header: t("Account number / IBAN"), key: "account", width: 26 },
  ];
  const head = sheet.getRow(1);
  head.font = { bold: true };
  head.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFEEF0FB" } };
  for (const e of employees) {
    sheet.addRow({
      code: employeeCode(e.number),
      name: e.name,
      nameAlt: e.nameAlt ?? "",
      jobTitle: e.jobTitle ?? "",
      department: e.departmentId ? (dep.get(e.departmentId) ?? "") : "",
      manager: e.managerId ? (byId.get(e.managerId) ?? "") : "",
      type: t(labelOf(EMPLOYMENT_TYPES, e.employmentType)),
      status: isActive(e, today) ? t("Working") : t("Left"),
      hireDate: isoToDate(e.hireDate),
      probation: isoToDate(e.probationEndDate),
      contract: isoToDate(e.contractEndDate),
      endDate: isoToDate(e.endDate),
      birthDate: isoToDate(e.birthDate),
      nationality: e.nationality ?? "",
      nationalId: e.nationalId ?? "",
      phone: e.phone ?? "",
      email: e.email ?? "",
      basis: t(labelOf(PAY_BASES, e.payBasis)),
      basic: e.basicPay ? Number(e.basicPay) : null,
      gross: e.basicPay || e.allowances.length ? grossPay(e) : null,
      currency: e.currency,
      bank: e.bankName ?? "",
      account: e.bankAccount ?? "",
    });
  }
  const file = await wb.xlsx.writeBuffer();
  const filename = `people-${ws.slug}-${today}.xlsx`;
  return new Response(new Uint8Array(file as ArrayBuffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
