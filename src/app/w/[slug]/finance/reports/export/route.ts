import { and, eq } from "drizzle-orm";
import { headers } from "next/headers";
import ExcelJS from "exceljs";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { member, organization } from "@/lib/db/schema";
import { getWorkspaceAccess } from "@/lib/billing";
import { ensureLedger, getFinanceSettings } from "@/lib/finance/ledger";
import { PERIODS, REPORTS, periodRange, reportData, type Period, type ReportKey } from "@/lib/finance/report-data";
import { AGE_BUCKETS, CASH_GROUPS } from "@/lib/finance/reports";
import { todayISO } from "@/lib/accomplishment";
import { getT } from "@/i18n/server";

const isDay = (v: string | null): v is string => Boolean(v && /^\d{4}-\d{2}-\d{2}$/.test(v));

/** The current report as an Excel sheet (amounts as numbers, main currency). */
export async function GET(request: Request, ctx: RouteContext<"/w/[slug]/finance/reports/export">) {
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
  const s = await getFinanceSettings(ws.id);
  if (!s) return new Response(t("Not found"), { status: 404 });
  await ensureLedger(ws.id);
  const url = new URL(request.url);
  const today = todayISO();
  const key = (REPORTS.find((r) => r.key === url.searchParams.get("r"))?.key ?? "pl") as ReportKey;
  const period = (PERIODS.find((p) => p === url.searchParams.get("p")) ?? "this_year") as Period;
  const f = url.searchParams.get("from");
  const to = url.searchParams.get("to");
  const range = periodRange(period, today, s.fiscalYearStart, isDay(f) ? f : undefined, isDay(to) ? to : undefined);
  const data = await reportData(ws.id, s, key, range.from, range.to, today);

  const wb = new ExcelJS.Workbook();
  wb.creator = "Tamm";
  const title = t(REPORTS.find((r) => r.key === key)!.label);
  const sheet = wb.addWorksheet(title.slice(0, 31), { views: [{ rightToLeft: t.locale === "ar" }] });
  const money = `"${s.baseCurrency} "#,##0.00;[Red]-"${s.baseCurrency} "#,##0.00`;
  sheet.addRow([title]).font = { bold: true, size: 14 };
  sheet.addRow([`${range.from} → ${range.to}`]);
  sheet.addRow([]);
  const add = (cells: (string | number)[], bold = false) => {
    const r = sheet.addRow(cells.map((c) => (typeof c === "number" ? c / 100 : c)));
    r.eachCell((cell, i) => {
      if (typeof cells[i - 1] === "number") cell.numFmt = money;
    });
    if (bold) r.font = { bold: true };
  };
  switch (data.key) {
    case "pl":
      add([t("Income")], true);
      data.pl.income.forEach((r) => add([`${r.account.code} ${t(r.account.name)}`, r.amount]));
      add([t("Total income"), data.pl.totalIncome], true);
      add([t("Expenses")], true);
      data.pl.expenses.forEach((r) => add([`${r.account.code} ${t(r.account.name)}`, r.amount]));
      add([t("Total expenses"), data.pl.totalExpenses], true);
      add([t("Profit"), data.pl.profit], true);
      break;
    case "bs":
      for (const [label, list, total] of [
        [t("What we have (assets)"), data.bs.assets, data.bs.totalAssets],
        [t("What we owe (liabilities)"), data.bs.liabilities, data.bs.totalLiabilities],
        [t("Owners' equity"), data.bs.equity, data.bs.totalEquity],
      ] as const) {
        add([label], true);
        list.forEach((r) => add([`${r.account.code} ${t(r.account.name)}`, r.amount]));
        if (label === t("Owners' equity")) add([t("Profit kept in the business"), data.bs.profit]);
        add([t("Total"), total], true);
      }
      break;
    case "cf":
      add([t("Cash at the start"), data.cf.start], true);
      data.cf.rows.forEach((r) => add([t(CASH_GROUPS[r.key]), r.amount]));
      add([t("Cash at the end"), data.cf.end], true);
      break;
    case "tb":
      add([t("Account"), t("Debit"), t("Credit")], true);
      data.tb.rows.forEach((r) => add([`${r.account.code} ${t(r.account.name)}`, r.debit, r.credit]));
      add([t("Total"), data.tb.debit, data.tb.credit], true);
      break;
    case "projects":
      add([t("Project"), t("Income"), t("Costs"), t("Profit")], true);
      data.projects.forEach((p) => add([`${p.name} (${p.code})`, p.income, p.costs, p.profit]));
      break;
    case "ar":
    case "ap":
      add([data.key === "ar" ? t("Customer") : t("Supplier"), ...AGE_BUCKETS.map((b) => t(b.label)), t("Total")], true);
      data.aging.forEach((r) => add([r.name, ...AGE_BUCKETS.map((b) => r[b.key]), r.total]));
      break;
    case "tax":
      add([t("{name} collected on sales", { name: data.tax.name }), data.tax.collected]);
      add([t("{name} paid on purchases", { name: data.tax.name }), data.tax.paid]);
      add([t("To pay the tax office"), data.tax.net], true);
      break;
  }
  sheet.getColumn(1).width = 44;
  for (let i = 2; i <= 8; i++) sheet.getColumn(i).width = 18;
  const file = await wb.xlsx.writeBuffer();
  return new Response(new Uint8Array(file as ArrayBuffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${key}-${ws.slug}-${range.to}.xlsx"`,
      "Cache-Control": "private, no-store",
    },
  });
}
