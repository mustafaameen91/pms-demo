import "server-only";
import { RISK_CATEGORIES, RISK_STATUSES, riskLevel, riskScore } from "@/lib/risks";
import ExcelJS from "exceljs";
import type { ProjectReport } from "@/lib/data/report";
import { EXPENSE_CATEGORIES, PROJECT_STATUSES, resourceTypeInfo } from "@/lib/constants";
import { formatFieldValue } from "@/lib/custom-fields";
import { createT, type T } from "@/i18n/translate";

const isoToDate = (iso: string | null) => {
  if (!iso) return null;
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
};
const num = (v: string | number | null) => (v === null || v === "" ? null : Number(v));

/**
 * Builds the project report workbook (Summary, Tasks, Resources, Expenses).
 * Sheet names, headers and labels in `t`'s language (English by default);
 * numbers, money and dates stay real cells.
 */
export async function buildProjectWorkbook(report: ProjectReport, t: T = createT("en", {})) {
  const { project, accomplishment: a, budget } = report;
  // Currency code as a literal prefix keeps the format valid for any currency.
  const money = `"${project.currency} "#,##0.00;[Red]-"${project.currency} "#,##0.00`;
  const pct = '0.0"%"';

  const wb = new ExcelJS.Workbook();
  wb.creator = "PMS";
  wb.created = new Date();

  const header = (ws: ExcelJS.Worksheet) => {
    const row = ws.getRow(1);
    row.font = { bold: true };
    row.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE6F4F1" } };
    ws.views = [{ state: "frozen", ySplit: 1 }];
  };

  // Summary
  const summary = wb.addWorksheet(t("Summary"));
  summary.columns = [
    { header: t("Item"), key: "item", width: 32 },
    { header: t("Value"), key: "value", width: 28 },
  ];
  header(summary);
  const add = (item: string, value: unknown, fmt?: string) => {
    const row = summary.addRow({ item, value });
    if (fmt) row.getCell("value").numFmt = fmt;
  };
  const status = PROJECT_STATUSES.find((s) => s.value === project.status)?.label;
  add(t("Project"), `${project.name} (${project.key})`);
  add(t("Client"), project.client ?? "");
  add(t("Status"), status ? t(status) : project.status);
  add(t("Project manager"), project.leadName ?? "");
  add(t("Start date"), isoToDate(project.startDate), "yyyy-mm-dd");
  add(t("End date"), isoToDate(project.endDate), "yyyy-mm-dd");
  add(t("Report date"), isoToDate(report.today), "yyyy-mm-dd");
  add(t("Accomplishment"), a.actual, pct);
  add(t("Planned by report date"), a.planned, pct);
  add(
    t("Schedule"),
    a.schedule === "ahead"
      ? t("Ahead of plan")
      : a.schedule === "behind"
        ? t("Behind plan")
        : a.schedule === "on_track"
          ? t("On track")
          : t("No schedule"),
  );
  add(t("Total task weight"), a.mode === "weighted" ? a.totalWeight : null, pct);
  add(t("Budget"), budget.budget, money);
  add(t("Spent (total)"), budget.actual, money);
  add(`  ${t("of which resources")}`, budget.resourceCost, money);
  add(`  ${t("of which other expenses")}`, budget.otherExpenses, money);
  add(t("Remaining"), budget.remaining, money);
  add(t("Still owed to resources"), budget.owedToResources, money);
  const f = report.forecast;
  add(t("Expected final cost"), f.ready ? f.final : t("Not enough data yet"), f.ready ? money : undefined);
  add(t("Expected over (+) / under (−) budget"), f.ready ? f.overBy : null, money);
  add(t("Cost efficiency (CPI)"), f.ready ? f.costIndex : null, "0.00");
  add(t("Schedule efficiency (SPI)"), f.ready ? f.scheduleIndex : null, "0.00");
  add(t("Late tasks"), report.late.length);

  // Tasks
  const tasks = wb.addWorksheet(t("Tasks"));
  tasks.columns = [
    { header: t("ID"), key: "id", width: 10 },
    { header: t("Task"), key: "title", width: 40 },
    { header: t("Status"), key: "status", width: 14 },
    { header: t("Weight %"), key: "weight", width: 10, style: { numFmt: pct } },
    { header: t("Progress %"), key: "progress", width: 11, style: { numFmt: pct } },
    { header: t("Start"), key: "start", width: 12, style: { numFmt: "yyyy-mm-dd" } },
    { header: t("End"), key: "end", width: 12, style: { numFmt: "yyyy-mm-dd" } },
    { header: t("Budget"), key: "budget", width: 16, style: { numFmt: money } },
    { header: t("Spent"), key: "spent", width: 16, style: { numFmt: money } },
    { header: t("Assignee"), key: "assignee", width: 20 },
    ...report.fields.map((f) => ({
      header: f.name,
      key: `cf_${f.id}`,
      width: 18,
      ...(f.type === "date" && { style: { numFmt: "yyyy-mm-dd" } }),
    })),
  ];
  header(tasks);
  for (const task of report.tasks) {
    tasks.addRow({
      id: `${project.key}-${task.number}`,
      title: task.title,
      status: task.statusName,
      weight: num(task.weight),
      progress: task.progress,
      start: isoToDate(task.startDate),
      end: isoToDate(task.dueDate),
      budget: num(task.budget),
      spent: task.spent,
      assignee: task.assigneeName ?? "",
      ...Object.fromEntries(
        report.fields.map((f) => {
          const v = task.customFields?.[f.id];
          // Numbers and dates stay real cells; everything else as text.
          return [`cf_${f.id}`, f.type === "number" && typeof v === "number" ? v : f.type === "date" && typeof v === "string" ? isoToDate(v) : formatFieldValue(f, v, t)];
        }),
      ),
    });
  }

  // Resources
  const resources = wb.addWorksheet(t("Resources"));
  resources.columns = [
    { header: t("Resource"), key: "name", width: 30 },
    { header: t("Type"), key: "type", width: 12 },
    { header: t("Role / contact"), key: "role", width: 18 },
    { header: t("Task"), key: "task", width: 28 },
    { header: t("Unit"), key: "unit", width: 10 },
    { header: t("Planned qty"), key: "planned", width: 12, style: { numFmt: "#,##0.##" } },
    { header: t("Used qty"), key: "used", width: 12, style: { numFmt: "#,##0.##" } },
    { header: t("Price"), key: "price", width: 16, style: { numFmt: money } },
    { header: t("Planned cost"), key: "plannedCost", width: 16, style: { numFmt: money } },
    { header: t("Used cost"), key: "usedCost", width: 16, style: { numFmt: money } },
    { header: t("Paid"), key: "paid", width: 16, style: { numFmt: money } },
    { header: t("Owed"), key: "owed", width: 16, style: { numFmt: money } },
  ];
  header(resources);
  const payments = new Map(budget.resources.map((r) => [r.usageId, r]));
  for (const u of report.usages) {
    const p = payments.get(u.id);
    resources.addRow({
      name: u.name,
      type: t(resourceTypeInfo(u.type).label),
      role: u.role ?? "",
      task: u.taskNumber ? `${project.key}-${u.taskNumber} ${u.taskTitle}` : t("Whole project"),
      unit: t(u.unit),
      planned: Number(u.plannedQty),
      used: Number(u.usedQty),
      price: Number(u.unitCost),
      plannedCost: Number(u.plannedQty) * Number(u.unitCost),
      usedCost: p?.usedCost ?? 0,
      paid: p?.paid ?? 0,
      owed: p?.owed ?? 0,
    });
  }

  // Expenses
  const expenses = wb.addWorksheet(t("Expenses"));
  expenses.columns = [
    { header: t("Date"), key: "date", width: 12, style: { numFmt: "yyyy-mm-dd" } },
    { header: t("Description"), key: "description", width: 36 },
    { header: t("Category"), key: "category", width: 16 },
    { header: t("Task"), key: "task", width: 28 },
    { header: t("Paid to"), key: "payee", width: 22 },
    { header: t("Payment for resource"), key: "resource", width: 24 },
    { header: t("Amount"), key: "amount", width: 16, style: { numFmt: money } },
    { header: t("Approval"), key: "approval", width: 12 },
    { header: t("Counted in spent"), key: "counted", width: 22 },
  ];
  header(expenses);
  for (const e of report.expenses) {
    const category = EXPENSE_CATEGORIES.find((c) => c.value === e.category)?.label;
    expenses.addRow({
      date: isoToDate(e.date),
      description: e.description,
      category: category ? t(category) : e.category,
      task: e.taskNumber && !e.taskDeleted ? `${project.key}-${e.taskNumber} ${e.taskTitle}` : "",
      payee: e.payee ?? "",
      resource: e.projectResourceId ? (e.resourceName ?? t("removed resource")) : "",
      amount: Number(e.amount),
      approval: e.approvalStatus === "approved" ? t("Approved") : e.approvalStatus === "pending" ? t("Pending") : t("Rejected"),
      // Resource payments are already counted through the resource's used cost.
      counted:
        e.approvalStatus !== "approved" ? t("No (not approved)") : e.projectResourceId ? t("No (resource payment)") : t("Yes"),
    });
  }

  // Risks
  const risks = wb.addWorksheet(t("Risks"));
  risks.columns = [
    { header: t("ID"), key: "id", width: 8 },
    { header: t("Risk"), key: "title", width: 36 },
    { header: t("Category"), key: "category", width: 18 },
    { header: t("Likelihood"), key: "likelihood", width: 11 },
    { header: t("Impact"), key: "impact", width: 10 },
    { header: t("Score"), key: "score", width: 8 },
    { header: t("Level"), key: "level", width: 10 },
    { header: t("Status"), key: "status", width: 11 },
    { header: t("Owner|risk"), key: "owner", width: 20 },
    { header: t("Plan to reduce it"), key: "mitigation", width: 40 },
    { header: t("Task"), key: "task", width: 24 },
  ];
  header(risks);
  for (const r of report.risks) {
    const score = riskScore(r.likelihood, r.impact);
    risks.addRow({
      id: `R-${r.number}`,
      title: r.title,
      category: t(RISK_CATEGORIES.find((c) => c.value === r.category)?.label ?? r.category),
      likelihood: r.likelihood,
      impact: r.impact,
      score,
      level: t({ high: "High", medium: "Medium", low: "Low" }[riskLevel(score)]),
      status: t(RISK_STATUSES.find((s) => s.value === r.status)?.label ?? r.status),
      owner: r.ownerName ?? "",
      mitigation: r.mitigation ?? "",
      task: r.taskNumber ? `${project.key}-${r.taskNumber} ${r.taskTitle}` : "",
    });
  }

  return Buffer.from(await wb.xlsx.writeBuffer());
}
