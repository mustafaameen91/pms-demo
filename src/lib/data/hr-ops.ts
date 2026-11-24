import "server-only";
import { and, asc, desc, eq, gte, inArray, isNull, lte, or } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  assetAssignments,
  assets,
  attendance,
  employeeContracts,
  employees,
  holidays,
  hrSettings,
  leaveRequests,
  leaveTypes,
  loanRepayments,
  loans,
  payrollRuns,
  payslips,
  shifts,
  user,
} from "@/lib/db/schema";
import {
  DEFAULT_LEAVE_TYPES,
  DEFAULT_RULES,
  assetCode,
  endOfService,
  leaveBalance,
  serviceYears,
  monthDays,
  resolveDay,
  shiftHours,
  summarizeMonth,
  type DayRecord,
  type HrRules,
  type LeaveSpan,
  type ResolvedDay,
  type MonthSummary,
} from "@/lib/hr-rules";
import { loanBalance } from "@/lib/loans";
import type { Employee } from "@/lib/data/hr";
import { todayISO as todayISOServer } from "@/lib/accomplishment";

// --- Settings ---

export async function getHrRules(workspaceId: string): Promise<HrRules> {
  const [row] = await db.select().from(hrSettings).where(eq(hrSettings.workspaceId, workspaceId)).limit(1);
  if (!row) return DEFAULT_RULES;
  return {
    weekend: row.weekend,
    workStart: row.workStart,
    workEnd: row.workEnd,
    graceMinutes: row.graceMinutes,
    overtimeRate: Number(row.overtimeRate),
    dayBasis: row.dayBasis === "working" ? "working" : "30",
    ssEmployee: Number(row.ssEmployee),
    ssEmployer: Number(row.ssEmployer),
    ssBase: row.ssBase === "gross" ? "gross" : "basic",
    endOfService: { ...DEFAULT_RULES.endOfService, ...row.endOfService },
  };
}

export async function listShifts(workspaceId: string) {
  return db.select().from(shifts).where(eq(shifts.workspaceId, workspaceId)).orderBy(asc(shifts.name));
}

export async function listHolidays(workspaceId: string, from?: string, to?: string) {
  return db
    .select()
    .from(holidays)
    .where(and(eq(holidays.workspaceId, workspaceId), from ? gte(holidays.date, from) : undefined, to ? lte(holidays.date, to) : undefined))
    .orderBy(asc(holidays.date));
}

/** A person's hours and days off: their shift's, or the company's. */
export function scheduleFor(e: Pick<Employee, "shiftId">, rules: HrRules, shiftList: (typeof shifts.$inferSelect)[]) {
  const s = e.shiftId ? shiftList.find((x) => x.id === e.shiftId) : undefined;
  const start = s?.workStart ?? rules.workStart;
  const end = s?.workEnd ?? rules.workEnd;
  return { start, end, weekend: s?.weekend ?? rules.weekend, hours: shiftHours(start, end), shiftName: s?.name ?? null };
}

// --- Leave ---

/** The company's leave types; the defaults are created the first time they're needed. */
export async function listLeaveTypes(workspaceId: string, { includeArchived = false } = {}) {
  let rows = await db.select().from(leaveTypes).where(eq(leaveTypes.workspaceId, workspaceId)).orderBy(asc(leaveTypes.createdAt));
  if (rows.length === 0) {
    rows = await db
      .insert(leaveTypes)
      .values(DEFAULT_LEAVE_TYPES.map((t) => ({ ...t, workspaceId })))
      .returning();
  }
  return includeArchived ? rows : rows.filter((r) => !r.archivedAt);
}

export async function listLeaveRequests(workspaceId: string, opts: { employeeId?: string; from?: string; to?: string; statuses?: string[] } = {}) {
  return db
    .select({
      request: leaveRequests,
      employeeName: employees.name,
      employeeNumber: employees.number,
      employeePhoto: employees.photoPath,
      decidedBy: user.name,
    })
    .from(leaveRequests)
    .innerJoin(employees, eq(employees.id, leaveRequests.employeeId))
    .leftJoin(user, eq(user.id, leaveRequests.decidedById))
    .where(
      and(
        eq(leaveRequests.workspaceId, workspaceId),
        opts.employeeId ? eq(leaveRequests.employeeId, opts.employeeId) : undefined,
        opts.to ? lte(leaveRequests.startDate, opts.to) : undefined,
        opts.from ? gte(leaveRequests.endDate, opts.from) : undefined,
        opts.statuses ? inArray(leaveRequests.status, opts.statuses) : undefined,
      ),
    )
    .orderBy(desc(leaveRequests.startDate));
}

export async function pendingLeaveCount(workspaceId: string) {
  const rows = await db
    .select({ id: leaveRequests.id })
    .from(leaveRequests)
    .where(and(eq(leaveRequests.workspaceId, workspaceId), eq(leaveRequests.status, "pending")));
  return rows.length;
}

// --- Attendance & the month for everyone ---

export async function listAttendance(workspaceId: string, from: string, to: string, employeeId?: string) {
  return db
    .select()
    .from(attendance)
    .where(and(eq(attendance.workspaceId, workspaceId), gte(attendance.date, from), lte(attendance.date, to), employeeId ? eq(attendance.employeeId, employeeId) : undefined));
}

const toRecord = (a: typeof attendance.$inferSelect): DayRecord => ({
  status: a.status,
  lateMinutes: a.lateMinutes,
  overtimeHours: Number(a.overtimeHours),
  hours: a.hours === null ? null : Number(a.hours),
  checkIn: a.checkIn,
  checkOut: a.checkOut,
});

export type PersonMonth = { employee: Employee; days: ResolvedDay[]; summary: MonthSummary; schedule: ReturnType<typeof scheduleFor> };

/**
 * Every day of a month for each person (attendance + approved leave + holidays +
 * weekends), and the month added up. Used by the attendance grid and payroll.
 */
export async function buildMonth(workspaceId: string, month: string, people: Employee[]): Promise<PersonMonth[]> {
  const days = monthDays(month);
  const from = days[0];
  const to = days.at(-1)!;
  const [rules, shiftList, hols, records, leaves, types] = await Promise.all([
    getHrRules(workspaceId),
    listShifts(workspaceId),
    listHolidays(workspaceId, from, to),
    listAttendance(workspaceId, from, to),
    listLeaveRequests(workspaceId, { from, to, statuses: ["approved"] }),
    listLeaveTypes(workspaceId, { includeArchived: true }),
  ]);
  const holidayMap = new Map(hols.map((h) => [h.date, h.name]));
  const paid = new Map(types.map((t) => [t.id, t.paid]));
  return people.map((employee) => {
    const schedule = scheduleFor(employee, rules, shiftList);
    const mine = new Map(records.filter((r) => r.employeeId === employee.id).map((r) => [r.date, toRecord(r)]));
    const spans: LeaveSpan[] = leaves
      .filter((l) => l.request.employeeId === employee.id)
      .map((l) => ({ typeId: l.request.typeId, paid: paid.get(l.request.typeId) ?? true, startDate: l.request.startDate, endDate: l.request.endDate, days: Number(l.request.days) }));
    const resolved = days.map((d) =>
      resolveDay(d, { hireDate: employee.hireDate, endDate: employee.endDate, weekend: schedule.weekend, holidays: holidayMap, leaves: spans, record: mine.get(d) }),
    );
    return { employee, days: resolved, schedule, summary: summarizeMonth(resolved, { weekend: schedule.weekend, holidays: holidayMap, dayHours: schedule.hours, month }) };
  });
}

// --- Payroll ---

export async function listPayrollRuns(workspaceId: string) {
  const runs = await db.select().from(payrollRuns).where(eq(payrollRuns.workspaceId, workspaceId)).orderBy(desc(payrollRuns.month));
  const slips = runs.length
    ? await db
        .select({ runId: payslips.runId, currency: payslips.currency, gross: payslips.gross, net: payslips.net, ssEmployer: payslips.ssEmployer })
        .from(payslips)
        .where(inArray(payslips.runId, runs.map((r) => r.id)))
    : [];
  return runs.map((r) => {
    const mine = slips.filter((s) => s.runId === r.id);
    const totals = new Map<string, { gross: number; net: number; cost: number }>();
    for (const s of mine) {
      const t = totals.get(s.currency) ?? { gross: 0, net: 0, cost: 0 };
      t.gross += Number(s.gross);
      t.net += Number(s.net);
      t.cost += Number(s.gross) + Number(s.ssEmployer);
      totals.set(s.currency, t);
    }
    return { run: r, people: mine.length, totals: [...totals].map(([currency, v]) => ({ currency, ...v })) };
  });
}

export async function getPayrollRun(workspaceId: string, month: string) {
  const [run] = await db
    .select()
    .from(payrollRuns)
    .where(and(eq(payrollRuns.workspaceId, workspaceId), eq(payrollRuns.month, month)))
    .limit(1);
  if (!run) return null;
  const slips = await db.select().from(payslips).where(eq(payslips.runId, run.id)).orderBy(asc(payslips.code));
  return { run, slips };
}

export async function listEmployeePayslips(employeeId: string) {
  return db
    .select({ slip: payslips, month: payrollRuns.month, status: payrollRuns.status })
    .from(payslips)
    .innerJoin(payrollRuns, eq(payrollRuns.id, payslips.runId))
    .where(eq(payslips.employeeId, employeeId))
    .orderBy(desc(payrollRuns.month));
}

/** Open loans of a person (by their login or worker link), oldest first, with what's still owed. */
export async function openLoansFor(workspaceId: string, e: Pick<Employee, "userId" | "resourceId">) {
  if (!e.userId && !e.resourceId) return [];
  const rows = await db
    .select()
    .from(loans)
    .where(
      and(
        eq(loans.workspaceId, workspaceId),
        isNull(loans.paidOffAt),
        isNull(loans.projectId),
        or(e.userId ? eq(loans.borrowerUserId, e.userId) : undefined, e.resourceId ? eq(loans.borrowerResourceId, e.resourceId) : undefined),
      ),
    )
    .orderBy(asc(loans.issuedOn));
  if (rows.length === 0) return [];
  const reps = await db.select().from(loanRepayments).where(inArray(loanRepayments.loanId, rows.map((l) => l.id)));
  return rows
    .map((l) => ({ loan: l, balance: loanBalance(l.amount, reps.filter((r) => r.loanId === l.id)).balance }))
    .filter((l) => Number(l.balance) > 0);
}

// --- Assets ---

export async function listAssets(workspaceId: string) {
  const [rows, open] = await Promise.all([
    db.select().from(assets).where(eq(assets.workspaceId, workspaceId)).orderBy(asc(assets.number)),
    db
      .select({ a: assetAssignments, name: employees.name, photo: employees.photoPath })
      .from(assetAssignments)
      .innerJoin(employees, eq(employees.id, assetAssignments.employeeId))
      .where(and(eq(assetAssignments.workspaceId, workspaceId), isNull(assetAssignments.returnedOn))),
  ]);
  const holder = new Map(open.map((o) => [o.a.assetId, { assignmentId: o.a.id, employeeId: o.a.employeeId, name: o.name, hasPhoto: Boolean(o.photo), since: o.a.assignedOn }]));
  return rows.map((a) => ({ asset: a, holder: holder.get(a.id) ?? null }));
}

export async function assetHistory(workspaceId: string, assetId: string) {
  return db
    .select({ a: assetAssignments, name: employees.name })
    .from(assetAssignments)
    .innerJoin(employees, eq(employees.id, assetAssignments.employeeId))
    .where(and(eq(assetAssignments.workspaceId, workspaceId), eq(assetAssignments.assetId, assetId)))
    .orderBy(desc(assetAssignments.assignedOn), desc(assetAssignments.createdAt));
}

/** What one person holds now (and held before). */
export async function employeeAssets(employeeId: string) {
  return db
    .select({ a: assetAssignments, asset: assets })
    .from(assetAssignments)
    .innerJoin(assets, eq(assets.id, assetAssignments.assetId))
    .where(eq(assetAssignments.employeeId, employeeId))
    .orderBy(desc(assetAssignments.assignedOn));
}

export async function getAssignment(workspaceId: string, id: string) {
  const [row] = await db
    .select({ a: assetAssignments, asset: assets, employee: employees })
    .from(assetAssignments)
    .innerJoin(assets, eq(assets.id, assetAssignments.assetId))
    .innerJoin(employees, eq(employees.id, assetAssignments.employeeId))
    .where(and(eq(assetAssignments.workspaceId, workspaceId), eq(assetAssignments.id, id)))
    .limit(1);
  return row ?? null;
}

// --- Contracts ---

export async function listContracts(employeeId: string) {
  return db.select().from(employeeContracts).where(eq(employeeContracts.employeeId, employeeId)).orderBy(desc(employeeContracts.startDate));
}

// --- Final settlement ---

/**
 * What someone leaving is owed: end-of-service pay, unused leave paid out (the
 * chosen paid leave types), less loans still owed. Their last month's pay is
 * the payroll for that month. `payTypes` = leave types to pay out (default: the first paid type with a balance).
 */
export async function computeSettlement(workspaceId: string, e: Employee, payTypes?: string[]) {
  const today = todayISOServer();
  const end = e.endDate ?? today;
  const [rules, types, requests, loansOpen, held, shiftList] = await Promise.all([
    getHrRules(workspaceId),
    listLeaveTypes(workspaceId, { includeArchived: true }),
    listLeaveRequests(workspaceId, { employeeId: e.id }),
    openLoansFor(workspaceId, e),
    employeeAssets(e.id),
    listShifts(workspaceId),
  ]);
  const sched = scheduleFor(e, rules, shiftList);
  const basic = Number(e.basicPay || 0);
  const allow = e.allowances.reduce((s, a) => s + Number(a.amount || 0), 0);
  const per = e.payBasis === "daily" ? 30 : e.payBasis === "hourly" ? 30 * sched.hours : 1;
  const monthly = (rules.endOfService.basis === "gross" ? basic + allow : basic) * per;
  const years = e.hireDate ? serviceYears(e.hireDate, end) : 0;
  const eos = endOfService(years, monthly.toFixed(2), rules.endOfService, e.endReason === "resigned");
  const balanceTypes = types.filter((x) => x.paid && x.daysPerYear !== null);
  const chosen = new Set(payTypes ?? balanceTypes.slice(0, 1).map((x) => x.id));
  const dayWage = (basic * per) / 30;
  const leave = balanceTypes.map((ty) => {
    const b = leaveBalance(
      { daysPerYear: Number(ty.daysPerYear), carryOver: Number(ty.carryOver) },
      e.hireDate,
      end,
      requests.filter((r) => r.request.typeId === ty.id).map((r) => ({ startDate: r.request.startDate, days: Number(r.request.days), status: r.request.status })),
    );
    const days = Math.max(0, b?.available ?? 0);
    return { typeId: ty.id, name: ty.name, days, amount: chosen.has(ty.id) ? Math.round(days * dayWage * 100) / 100 : 0, included: chosen.has(ty.id) };
  });
  const loansOwed = loansOpen.reduce((s, l) => s + Number(l.balance), 0);
  const leaveTotal = leave.reduce((s, l) => s + l.amount, 0);
  const assetsHeld = held.filter((h) => !h.a.returnedOn).map((h) => ({ id: h.a.id, name: h.asset.name, code: assetCode(h.asset.number), value: h.asset.value, currency: h.asset.currency, since: h.a.assignedOn }));
  return {
    end,
    currency: e.currency,
    years,
    monthlyWage: monthly,
    dayWage,
    eos,
    leave,
    loansOwed,
    loans: loansOpen.map((l) => ({ id: l.loan.id, issuedOn: l.loan.issuedOn, amount: l.loan.amount, currency: l.loan.currency, balance: l.balance })),
    assetsHeld,
    net: Math.round((Number(eos.amount) + leaveTotal - loansOwed) * 100) / 100,
  };
}
export type Settlement = Awaited<ReturnType<typeof computeSettlement>>;
