import "server-only";
import ExcelJS from "exceljs";
import type { ProjectReport } from "@/lib/data/report";
import { EXPENSE_CATEGORIES, PROJECT_STATUSES, resourceTypeInfo } from "@/lib/constants";
import { formatFieldValue } from "@/lib/custom-fields";

const isoToDate = (iso: string | null) => {
  if (!iso) return null;
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
};
const num = (v: string | number | null) => (v === null || v === "" ? null : Number(v));

/** Builds the project report workbook (Summary, Tasks, Resources, Expenses). */
export async function buildProjectWorkbook(report: ProjectReport) {
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
  const summary = wb.addWorksheet("Summary");
  summary.columns = [
    { header: "Item", key: "item", width: 32 },
    { header: "Value", key: "value", width: 28 },
  ];
  header(summary);
  const add = (item: string, value: unknown, fmt?: string) => {
    const row = summary.addRow({ item, value });
    if (fmt) row.getCell("value").numFmt = fmt;
  };
  add("Project", `${project.name} (${project.key})`);
  add("Client", project.client ?? "");
  add("Status", PROJECT_STATUSES.find((s) => s.value === project.status)?.label ?? project.status);
  add("Project manager", project.leadName ?? "");
  add("Start date", isoToDate(project.startDate), "yyyy-mm-dd");
  add("End date", isoToDate(project.endDate), "yyyy-mm-dd");
  add("Report date", isoToDate(report.today), "yyyy-mm-dd");
  add("Accomplishment", a.actual, pct);
  add("Planned by report date", a.planned, pct);
  add(
    "Schedule",
    a.schedule === "ahead" ? "Ahead of plan" : a.schedule === "behind" ? "Behind plan" : a.schedule === "on_track" ? "On track" : "No schedule",
  );
  add("Total task weight", a.mode === "weighted" ? a.totalWeight : null, pct);
  add("Budget", budget.budget, money);
  add("Spent (total)", budget.actual, money);
  add("  of which resources", budget.resourceCost, money);
  add("  of which other expenses", budget.otherExpenses, money);
  add("Remaining", budget.remaining, money);
  add("Still owed to resources", budget.owedToResources, money);
  add("Late tasks", report.late.length);

  // Tasks
  const tasks = wb.addWorksheet("Tasks");
  tasks.columns = [
    { header: "ID", key: "id", width: 10 },
    { header: "Task", key: "title", width: 40 },
    { header: "Status", key: "status", width: 14 },
    { header: "Weight %", key: "weight", width: 10, style: { numFmt: pct } },
    { header: "Progress %", key: "progress", width: 11, style: { numFmt: pct } },
    { header: "Start", key: "start", width: 12, style: { numFmt: "yyyy-mm-dd" } },
    { header: "End", key: "end", width: 12, style: { numFmt: "yyyy-mm-dd" } },
    { header: "Budget", key: "budget", width: 16, style: { numFmt: money } },
    { header: "Spent", key: "spent", width: 16, style: { numFmt: money } },
    { header: "Assignee", key: "assignee", width: 20 },
    ...report.fields.map((f) => ({
      header: f.name,
      key: `cf_${f.id}`,
      width: 18,
      ...(f.type === "date" && { style: { numFmt: "yyyy-mm-dd" } }),
    })),
  ];
  header(tasks);
  for (const t of report.tasks) {
    tasks.addRow({
      id: `${project.key}-${t.number}`,
      title: t.title,
      status: t.statusName,
      weight: num(t.weight),
      progress: t.progress,
      start: isoToDate(t.startDate),
      end: isoToDate(t.dueDate),
      budget: num(t.budget),
      spent: t.spent,
      assignee: t.assigneeName ?? "",
      ...Object.fromEntries(
        report.fields.map((f) => {
          const v = t.customFields?.[f.id];
          // Numbers and dates stay real cells; everything else as text.
          return [`cf_${f.id}`, f.type === "number" && typeof v === "number" ? v : f.type === "date" && typeof v === "string" ? isoToDate(v) : formatFieldValue(f, v)];
        }),
      ),
    });
  }

  // Resources
  const resources = wb.addWorksheet("Resources");
  resources.columns = [
    { header: "Resource", key: "name", width: 30 },
    { header: "Type", key: "type", width: 12 },
    { header: "Role / contact", key: "role", width: 18 },
    { header: "Task", key: "task", width: 28 },
    { header: "Unit", key: "unit", width: 10 },
    { header: "Planned qty", key: "planned", width: 12, style: { numFmt: "#,##0.##" } },
    { header: "Used qty", key: "used", width: 12, style: { numFmt: "#,##0.##" } },
    { header: "Price", key: "price", width: 16, style: { numFmt: money } },
    { header: "Planned cost", key: "plannedCost", width: 16, style: { numFmt: money } },
    { header: "Used cost", key: "usedCost", width: 16, style: { numFmt: money } },
    { header: "Paid", key: "paid", width: 16, style: { numFmt: money } },
    { header: "Owed", key: "owed", width: 16, style: { numFmt: money } },
  ];
  header(resources);
  const payments = new Map(budget.resources.map((r) => [r.usageId, r]));
  for (const u of report.usages) {
    const p = payments.get(u.id);
    resources.addRow({
      name: u.name,
      type: resourceTypeInfo(u.type).label,
      role: u.role ?? "",
      task: u.taskNumber ? `${project.key}-${u.taskNumber} ${u.taskTitle}` : "Whole project",
      unit: u.unit,
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
  const expenses = wb.addWorksheet("Expenses");
  expenses.columns = [
    { header: "Date", key: "date", width: 12, style: { numFmt: "yyyy-mm-dd" } },
    { header: "Description", key: "description", width: 36 },
    { header: "Category", key: "category", width: 16 },
    { header: "Task", key: "task", width: 28 },
    { header: "Paid to", key: "payee", width: 22 },
    { header: "Payment for resource", key: "resource", width: 24 },
    { header: "Amount", key: "amount", width: 16, style: { numFmt: money } },
    { header: "Approval", key: "approval", width: 12 },
    { header: "Counted in spent", key: "counted", width: 22 },
  ];
  header(expenses);
  for (const e of report.expenses) {
    expenses.addRow({
      date: isoToDate(e.date),
      description: e.description,
      category: EXPENSE_CATEGORIES.find((c) => c.value === e.category)?.label ?? e.category,
      task: e.taskNumber && !e.taskDeleted ? `${project.key}-${e.taskNumber} ${e.taskTitle}` : "",
      payee: e.payee ?? "",
      resource: e.projectResourceId ? (e.resourceName ?? "removed resource") : "",
      amount: Number(e.amount),
      approval: e.approvalStatus === "approved" ? "Approved" : e.approvalStatus === "pending" ? "Pending" : "Rejected",
      // Resource payments are already counted through the resource's used cost.
      counted:
        e.approvalStatus !== "approved" ? "No (not approved)" : e.projectResourceId ? "No (resource payment)" : "Yes",
    });
  }

  return Buffer.from(await wb.xlsx.writeBuffer());
}
