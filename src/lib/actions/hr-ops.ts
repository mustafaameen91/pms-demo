"use server";

import { refresh } from "next/cache";
import { and, eq, gte, inArray, isNotNull, lte, max, notInArray } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import {
  activities,
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
  payrollRuns,
  payslipLoanRepayments,
  payslips,
  departments,
  ledgerAccounts,
  shifts,
  timeEntries,
  type PayLine,
} from "@/lib/db/schema";
import { ADMINS_ONLY, hrAdmin, hrAdminById, hrEmployee, invalid, type Result } from "@/lib/hr-auth";
import { buildMonth, getHrRules, listHolidays, listLeaveRequests, listLeaveTypes, listShifts, openLoansFor, scheduleFor, type PersonMonth } from "@/lib/data/hr-ops";
import {
  ASSET_CATEGORIES,
  ASSET_CONDITIONS,
  ATTENDANCE_STATUSES,
  OFFBOARDING_ITEMS,
  assetCode,
  computePay,
  hoursBetween,
  lateMinutes,
  leaveBalance,
  leaveDays,
  minutesOf,
  monthDays,
  type HrRules,
} from "@/lib/hr-rules";
import { EMPLOYMENT_TYPES, employeeCode, isActive } from "@/lib/hr";
import { isHexColor } from "@/lib/branding";
import { syncPaidOff } from "@/lib/loan-settlement";
import { deleteStoredFile, saveReceipt } from "@/lib/uploads";
import { notify } from "@/lib/notifications";
import { todayISO } from "@/lib/accomplishment";
import { formatDate } from "@/lib/utils";
import { getT } from "@/i18n/server";

const text = (max: number) => z.string().trim().max(max).optional().nullable().transform((v) => v || null);
const isoDay = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Enter a valid date");
const time = z.string().refine((v) => minutesOf(v) !== null, "Enter a time like 08:00");
const weekendDays = z.array(z.number().int().min(0).max(6)).max(6);
const lines = z
  .array(z.object({ name: z.string().trim().max(80), amount: z.string().trim() }))
  .max(20)
  .transform((l) => l.filter((x) => x.name && x.amount))
  .refine((l) => l.every((x) => /^\d{1,12}(\.\d{1,2})?$/.test(x.amount.replace(/,/g, ""))), "Enter amounts like 150 or 150.50")
  .transform((l) => l.map((x) => ({ name: x.name, amount: Number(x.amount.replace(/,/g, "")).toFixed(2) })));
const log = (workspaceId: string, actorId: string, type: string, data: Record<string, unknown>) => db.insert(activities).values({ workspaceId, actorId, type, data });

// =============================== Settings ===============================

const eosSchema = z.object({
  firstYears: z.coerce.number().min(0).max(50),
  daysFirst: z.coerce.number().min(0).max(366),
  daysAfter: z.coerce.number().min(0).max(366),
  minYears: z.coerce.number().min(0).max(50),
  basis: z.enum(["basic", "gross"]),
  resignation: z.array(z.object({ years: z.coerce.number().min(0).max(50), percent: z.coerce.number().min(0).max(100) })).max(6),
});
const settingsSchema = z
  .object({
    weekend: weekendDays,
    workStart: time,
    workEnd: time,
    graceMinutes: z.coerce.number().int().min(0).max(240),
    overtimeRate: z.coerce.number().min(0).max(10),
    dayBasis: z.enum(["30", "working"]),
    ssEmployee: z.coerce.number().min(0).max(100),
    ssEmployer: z.coerce.number().min(0).max(100),
    ssBase: z.enum(["basic", "gross"]),
    endOfService: eosSchema,
  })
  .refine((v) => v.workStart !== v.workEnd, { path: ["workEnd"], message: "The day must end at a different time than it starts" });
export type HrSettingsInput = z.input<typeof settingsSchema>;

export async function saveHrSettings(slug: string, input: HrSettingsInput): Promise<Result> {
  const t = await getT();
  const auth = await hrAdmin(slug);
  if (!auth) return { ok: false, error: t(ADMINS_ONLY) };
  const parsed = settingsSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error, t);
  const d = parsed.data;
  const values = {
    ...d,
    weekend: [...new Set(d.weekend)].sort(),
    overtimeRate: d.overtimeRate.toFixed(2),
    ssEmployee: d.ssEmployee.toFixed(2),
    ssEmployer: d.ssEmployer.toFixed(2),
    endOfService: { ...d.endOfService, resignation: [...d.endOfService.resignation].sort((a, b) => a.years - b.years) },
    updatedById: auth.user.id,
    updatedAt: new Date(),
  };
  await db.insert(hrSettings).values({ ...values, workspaceId: auth.workspace.id }).onConflictDoUpdate({ target: hrSettings.workspaceId, set: values });
  await log(auth.workspace.id, auth.user.id, "hr.settings_updated", {});
  refresh();
  return { ok: true };
}

const shiftSchema = z.object({ name: z.string().trim().min(2, "Give the shift a name").max(60), workStart: time, workEnd: time, weekend: weekendDays });

export async function saveShift(slug: string, id: string | null, input: z.input<typeof shiftSchema>): Promise<Result> {
  const t = await getT();
  const auth = await hrAdmin(slug);
  if (!auth) return { ok: false, error: t(ADMINS_ONLY) };
  const parsed = shiftSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error, t);
  if (id) await db.update(shifts).set(parsed.data).where(and(eq(shifts.id, id), eq(shifts.workspaceId, auth.workspace.id)));
  else await db.insert(shifts).values({ ...parsed.data, workspaceId: auth.workspace.id });
  refresh();
  return { ok: true };
}

/** Its people go back to the company's hours. */
export async function deleteShift(slug: string, id: string): Promise<Result> {
  const t = await getT();
  const auth = await hrAdmin(slug);
  if (!auth) return { ok: false, error: t(ADMINS_ONLY) };
  await db.delete(shifts).where(and(eq(shifts.id, id), eq(shifts.workspaceId, auth.workspace.id)));
  refresh();
  return { ok: true };
}

export async function saveHoliday(slug: string, input: { date: string; name: string }): Promise<Result> {
  const t = await getT();
  const auth = await hrAdmin(slug);
  if (!auth) return { ok: false, error: t(ADMINS_ONLY) };
  const parsed = z.object({ date: isoDay, name: z.string().trim().min(2, "Give the holiday a name").max(80) }).safeParse(input);
  if (!parsed.success) return invalid(parsed.error, t);
  await db
    .insert(holidays)
    .values({ ...parsed.data, workspaceId: auth.workspace.id })
    .onConflictDoUpdate({ target: [holidays.workspaceId, holidays.date], set: { name: parsed.data.name } });
  refresh();
  return { ok: true };
}

export async function deleteHoliday(slug: string, id: string): Promise<Result> {
  const t = await getT();
  const auth = await hrAdmin(slug);
  if (!auth) return { ok: false, error: t(ADMINS_ONLY) };
  await db.delete(holidays).where(and(eq(holidays.id, id), eq(holidays.workspaceId, auth.workspace.id)));
  refresh();
  return { ok: true };
}

const leaveTypeSchema = z.object({
  name: z.string().trim().min(2, "Give the leave type a name").max(60),
  paid: z.boolean(),
  daysPerYear: z
    .string()
    .trim()
    .optional()
    .nullable()
    .transform((v) => v || null)
    .refine((v) => v === null || (/^\d{1,3}(\.\d)?$/.test(v) && Number(v) <= 366), "Enter days like 21 or 10.5"),
  carryOver: z
    .string()
    .trim()
    .optional()
    .transform((v) => v || "0")
    .refine((v) => /^\d{1,3}(\.\d)?$/.test(v), "Enter days like 5"),
  color: z.string().refine(isHexColor, "Choose a colour"),
});

export async function saveLeaveType(slug: string, id: string | null, input: z.input<typeof leaveTypeSchema>): Promise<Result> {
  const t = await getT();
  const auth = await hrAdmin(slug);
  if (!auth) return { ok: false, error: t(ADMINS_ONLY) };
  const parsed = leaveTypeSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error, t);
  if (id) await db.update(leaveTypes).set(parsed.data).where(and(eq(leaveTypes.id, id), eq(leaveTypes.workspaceId, auth.workspace.id)));
  else await db.insert(leaveTypes).values({ ...parsed.data, workspaceId: auth.workspace.id });
  refresh();
  return { ok: true };
}

/** Hidden from new requests; past requests keep it. */
export async function archiveLeaveType(slug: string, id: string, archived: boolean): Promise<Result> {
  const t = await getT();
  const auth = await hrAdmin(slug);
  if (!auth) return { ok: false, error: t(ADMINS_ONLY) };
  await db
    .update(leaveTypes)
    .set({ archivedAt: archived ? new Date() : null })
    .where(and(eq(leaveTypes.id, id), eq(leaveTypes.workspaceId, auth.workspace.id)));
  refresh();
  return { ok: true };
}

// =============================== Attendance ===============================

const attendanceRow = z.object({
  employeeId: z.string().min(1),
  // "" clears the day.
  status: z.union([z.literal(""), z.enum(ATTENDANCE_STATUSES.map((s) => s.value) as [string, ...string[]])]),
  checkIn: z.string().optional().nullable().transform((v) => (v && minutesOf(v) !== null ? v : null)),
  checkOut: z.string().optional().nullable().transform((v) => (v && minutesOf(v) !== null ? v : null)),
  overtimeHours: z.coerce.number().min(0).max(24).default(0),
  note: text(300),
});
export type AttendanceRowInput = z.input<typeof attendanceRow>;

/** Saves a day for many people at once. Lateness and hours are worked out from the times. */
export async function saveAttendance(slug: string, date: string, rows: AttendanceRowInput[]): Promise<Result<{ saved: number }>> {
  const t = await getT();
  const auth = await hrAdmin(slug);
  if (!auth) return { ok: false, error: t(ADMINS_ONLY) };
  if (!isoDay.safeParse(date).success) return { ok: false, error: t("Enter a valid date") };
  if (date > todayISO()) return { ok: false, error: t("Attendance can't be recorded for a future day.") };
  const parsed = z.array(attendanceRow).max(2000).safeParse(rows);
  if (!parsed.success) return invalid(parsed.error, t);
  const ws = auth.workspace.id;
  const ids = [...new Set(parsed.data.map((r) => r.employeeId))];
  if (ids.length === 0) return { ok: true, data: { saved: 0 } };
  const [people, rules, shiftList] = await Promise.all([
    db.select().from(employees).where(and(eq(employees.workspaceId, ws), inArray(employees.id, ids))),
    getHrRules(ws),
    listShifts(ws),
  ]);
  const byId = new Map(people.map((p) => [p.id, p]));
  let saved = 0;
  await db.transaction(async (tx) => {
    for (const r of parsed.data) {
      const e = byId.get(r.employeeId);
      if (!e) continue;
      if (!r.status) {
        await tx.delete(attendance).where(and(eq(attendance.employeeId, e.id), eq(attendance.date, date)));
        continue;
      }
      const sched = scheduleFor(e, rules, shiftList);
      const late = r.status === "absent" ? 0 : lateMinutes(r.checkIn, sched.start, rules.graceMinutes);
      const status = r.status === "present" && late > 0 ? "late" : r.status;
      const hours = r.status === "absent" ? null : hoursBetween(r.checkIn, r.checkOut);
      const values = {
        status,
        checkIn: r.status === "absent" ? null : r.checkIn,
        checkOut: r.status === "absent" ? null : r.checkOut,
        lateMinutes: late,
        overtimeHours: (r.status === "absent" ? 0 : r.overtimeHours).toFixed(2),
        hours: hours === null ? null : hours.toFixed(2),
        note: r.note,
        source: "manual",
        recordedById: auth.user.id,
        updatedAt: new Date(),
      };
      await tx
        .insert(attendance)
        .values({ ...values, workspaceId: ws, employeeId: e.id, date })
        .onConflictDoUpdate({ target: [attendance.employeeId, attendance.date], set: values });
      saved++;
    }
  });
  await log(ws, auth.user.id, "attendance.saved", { date, count: saved });
  refresh();
  return { ok: true, data: { saved } };
}

/**
 * People linked to a member or worker who logged approved project time that day
 * are marked present (with their hours). Days already recorded by hand are left alone.
 */
export async function fillAttendanceFromTimesheets(slug: string, date: string): Promise<Result<{ filled: number }>> {
  const t = await getT();
  const auth = await hrAdmin(slug);
  if (!auth) return { ok: false, error: t(ADMINS_ONLY) };
  if (!isoDay.safeParse(date).success) return { ok: false, error: t("Enter a valid date") };
  const ws = auth.workspace.id;
  const [people, entries, existing, rules, shiftList] = await Promise.all([
    db.select().from(employees).where(eq(employees.workspaceId, ws)),
    db
      .select({ userId: timeEntries.userId, resourceId: timeEntries.resourceId, quantity: timeEntries.quantity, unit: timeEntries.unit })
      .from(timeEntries)
      .where(and(eq(timeEntries.workspaceId, ws), eq(timeEntries.date, date), eq(timeEntries.status, "approved"))),
    db.select({ employeeId: attendance.employeeId, source: attendance.source }).from(attendance).where(and(eq(attendance.workspaceId, ws), eq(attendance.date, date))),
    getHrRules(ws),
    listShifts(ws),
  ]);
  const manual = new Set(existing.filter((e) => e.source === "manual").map((e) => e.employeeId));
  let filled = 0;
  for (const e of people) {
    if (!isActive(e, date) || manual.has(e.id) || (e.hireDate && e.hireDate > date)) continue;
    const mine = entries.filter((x) => (e.userId && x.userId === e.userId) || (e.resourceId && x.resourceId === e.resourceId));
    if (mine.length === 0) continue;
    const dayHours = scheduleFor(e, rules, shiftList).hours;
    const hours = mine.reduce((s, x) => s + Number(x.quantity) * (/day|يوم/i.test(x.unit) ? dayHours : 1), 0);
    const values = {
      status: "present",
      hours: hours.toFixed(2),
      overtimeHours: Math.max(0, hours - dayHours).toFixed(2),
      lateMinutes: 0,
      checkIn: null,
      checkOut: null,
      source: "timesheet",
      recordedById: auth.user.id,
      updatedAt: new Date(),
    };
    await db
      .insert(attendance)
      .values({ ...values, workspaceId: ws, employeeId: e.id, date })
      .onConflictDoUpdate({ target: [attendance.employeeId, attendance.date], set: values });
    filled++;
  }
  if (filled) await log(ws, auth.user.id, "attendance.from_timesheets", { date, count: filled });
  refresh();
  return { ok: true, data: { filled } };
}

// =============================== Leave ===============================

const leaveSchema = z
  .object({
    employeeId: z.string().min(1, "Choose a person"),
    typeId: z.string().min(1, "Choose a leave type"),
    startDate: isoDay,
    endDate: isoDay,
    halfDay: z.boolean().default(false),
    reason: text(500),
    approve: z.boolean().default(false),
    /** Go ahead even if it's more than the balance. */
    force: z.boolean().default(false),
  })
  .refine((v) => v.endDate >= v.startDate, { path: ["endDate"], message: "The leave can't end before it starts" });
export type LeaveInput = z.input<typeof leaveSchema>;

/** Records a leave request (approved at once when `approve`). Overlaps are refused; going over the balance asks first. */
export async function saveLeaveRequest(slug: string, input: LeaveInput): Promise<Result<{ overBalance?: { available: number; days: number } }>> {
  const t = await getT();
  const auth = await hrAdmin(slug);
  if (!auth) return { ok: false, error: t(ADMINS_ONLY) };
  const parsed = leaveSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error, t);
  const d = parsed.data;
  const ws = auth.workspace.id;
  const [[e], types, rules, shiftList, hols] = await Promise.all([
    db.select().from(employees).where(and(eq(employees.id, d.employeeId), eq(employees.workspaceId, ws))),
    listLeaveTypes(ws),
    getHrRules(ws),
    listShifts(ws),
    listHolidays(ws, d.startDate, d.endDate),
  ]);
  const type = types.find((x) => x.id === d.typeId);
  if (!e) return { ok: false, error: t("Choose a person"), fieldErrors: { employeeId: t("Choose a person") } };
  if (!type) return { ok: false, error: t("Choose a leave type"), fieldErrors: { typeId: t("Choose a leave type") } };
  const sched = scheduleFor(e, rules, shiftList);
  const days = leaveDays(d.startDate, d.endDate, sched.weekend, new Set(hols.map((h) => h.date)), d.halfDay);
  if (days === 0) {
    const msg = t("Those dates are all days off or holidays.");
    return { ok: false, error: msg, fieldErrors: { endDate: msg } };
  }
  const [clash] = await db
    .select({ id: leaveRequests.id, startDate: leaveRequests.startDate, endDate: leaveRequests.endDate })
    .from(leaveRequests)
    .where(
      and(
        eq(leaveRequests.employeeId, e.id),
        inArray(leaveRequests.status, ["pending", "approved"]),
        lte(leaveRequests.startDate, d.endDate),
        gte(leaveRequests.endDate, d.startDate),
      ),
    )
    .limit(1);
  if (clash) {
    const msg = t("{name} already has leave from {from} to {to}.", { name: e.name, from: formatDate(clash.startDate, t.intl), to: formatDate(clash.endDate, t.intl) });
    return { ok: false, error: msg, fieldErrors: { startDate: msg } };
  }
  if (!d.force && type.daysPerYear !== null) {
    const history = await listLeaveRequests(ws, { employeeId: e.id });
    const bal = leaveBalance(
      { daysPerYear: Number(type.daysPerYear), carryOver: Number(type.carryOver) },
      e.hireDate,
      d.startDate,
      history.filter((h) => h.request.typeId === type.id).map((h) => ({ startDate: h.request.startDate, days: Number(h.request.days), status: h.request.status })),
    );
    if (bal && days > bal.available) return { ok: true, data: { overBalance: { available: bal.available, days } } };
  }
  const now = new Date();
  await db.insert(leaveRequests).values({
    workspaceId: ws,
    employeeId: e.id,
    typeId: type.id,
    startDate: d.startDate,
    endDate: d.endDate,
    days: days.toFixed(1),
    reason: d.reason,
    status: d.approve ? "approved" : "pending",
    decidedById: d.approve ? auth.user.id : null,
    decidedAt: d.approve ? now : null,
    createdById: auth.user.id,
  });
  await log(ws, auth.user.id, d.approve ? "leave.approved" : "leave.requested", { name: e.name, code: employeeCode(e.number), leaveType: type.name, from: d.startDate, to: d.endDate, days });
  if (d.approve) await notifyLeave(ws, auth.workspace.slug, e, type.name, d.startDate, d.endDate, "approved", auth.user.id);
  refresh();
  return { ok: true };
}

async function notifyLeave(workspaceId: string, slug: string, e: { userId: string | null }, typeName: string, from: string, to: string, status: "approved" | "rejected", actorId: string) {
  if (!e.userId) return;
  await notify({
    workspaceId,
    userIds: [e.userId],
    actorId,
    type: "leave",
    title: (t) => (status === "approved" ? t("Your {type} was approved", { type: typeName }) : t("Your {type} was not approved", { type: typeName })),
    body: (t) => t("{from} to {to}", { from: formatDate(from, t.intl), to: formatDate(to, t.intl) }),
    link: `/w/${slug}/my-tasks`,
    email: true,
  });
}

export async function decideLeave(id: string, status: "approved" | "rejected", note?: string): Promise<Result> {
  const t = await getT();
  const [req] = await db.select().from(leaveRequests).where(eq(leaveRequests.id, id)).limit(1);
  if (!req) return { ok: false, error: t("Not found") };
  const auth = await hrEmployee(req.employeeId);
  if (!auth) return { ok: false, error: t(ADMINS_ONLY) };
  if (req.status !== "pending") return { ok: false, error: t("This request was already decided.") };
  await db
    .update(leaveRequests)
    .set({ status, decidedById: auth.user.id, decidedAt: new Date(), decisionNote: note?.trim().slice(0, 500) || null })
    .where(eq(leaveRequests.id, id));
  const [type] = await db.select({ name: leaveTypes.name }).from(leaveTypes).where(eq(leaveTypes.id, req.typeId));
  await log(req.workspaceId, auth.user.id, `leave.${status}`, { name: auth.employee.name, code: employeeCode(auth.employee.number), leaveType: type?.name ?? "", from: req.startDate, to: req.endDate, days: Number(req.days) });
  await notifyLeave(req.workspaceId, auth.slug, auth.employee, type?.name ?? "", req.startDate, req.endDate, status, auth.user.id);
  refresh();
  return { ok: true };
}

/** Cancels a pending or approved request (e.g. plans changed). */
export async function cancelLeave(id: string): Promise<Result> {
  const t = await getT();
  const [req] = await db.select().from(leaveRequests).where(eq(leaveRequests.id, id)).limit(1);
  if (!req) return { ok: false, error: t("Not found") };
  const auth = await hrEmployee(req.employeeId);
  if (!auth) return { ok: false, error: t(ADMINS_ONLY) };
  await db.update(leaveRequests).set({ status: "cancelled" }).where(eq(leaveRequests.id, id));
  await log(req.workspaceId, auth.user.id, "leave.cancelled", { name: auth.employee.name, code: employeeCode(auth.employee.number), from: req.startDate, to: req.endDate });
  refresh();
  return { ok: true };
}

// =============================== Payroll ===============================

const monthRe = /^\d{4}-(0[1-9]|1[0-2])$/;
const num = (v: string | number | null | undefined) => Number(v || 0);

/** The payslip for one person's month (adjustments kept from the draft). */
function slipValues(pm: PersonMonth, rules: HrRules, deptName: string | null, adj: { additions: PayLine[]; deductions: PayLine[]; loanDeduction: string }) {
  const e = pm.employee;
  const basis = e.payBasis === "daily" || e.payBasis === "hourly" ? e.payBasis : "monthly";
  const pay = computePay({
    payBasis: basis,
    basicPay: e.basicPay,
    allowances: e.allowances,
    summary: pm.summary,
    rules,
    dayHours: pm.schedule.hours,
    additions: adj.additions,
    deductions: adj.deductions,
    loanDeduction: adj.loanDeduction,
  });
  return {
    name: e.name,
    code: employeeCode(e.number),
    jobTitle: e.jobTitle,
    department: deptName,
    bankName: e.bankName,
    bankAccount: e.bankAccount,
    currency: e.currency,
    payBasis: basis,
    basicPay: num(e.basicPay).toFixed(2),
    allowances: pay.allowances,
    workingDays: pm.summary.workingDays.toFixed(1),
    paidDays: pay.paidDays.toFixed(1),
    absentDays: pm.summary.absentDays.toFixed(1),
    unpaidLeaveDays: pm.summary.unpaidLeaveDays.toFixed(1),
    hoursWorked: pm.summary.hoursWorked.toFixed(2),
    overtimeHours: pm.summary.overtimeHours.toFixed(2),
    lateMinutes: pm.summary.lateMinutes,
    basicEarned: pay.basicEarned,
    overtimePay: pay.overtimePay,
    additions: adj.additions,
    deductions: adj.deductions,
    ssEmployee: pay.ssEmployee,
    ssEmployer: pay.ssEmployer,
    loanDeduction: pay.loanDeduction,
    gross: pay.gross,
    net: pay.net,
    updatedAt: new Date(),
  };
}

/** People who get paid in a month: employed for part of it, with pay set. */
async function payrollPeople(workspaceId: string, month: string) {
  const days = monthDays(month);
  const rows = await db.select().from(employees).where(eq(employees.workspaceId, workspaceId));
  return rows.filter((e) => e.basicPay && Number(e.basicPay) > 0 && (!e.hireDate || e.hireDate <= days.at(-1)!) && (!e.endDate || e.endDate >= days[0]));
}

async function writeSlips(workspaceId: string, runId: string, month: string, keep: Map<string, { additions: PayLine[]; deductions: PayLine[]; loanDeduction: string }>) {
  const [people, rules, deps] = await Promise.all([payrollPeople(workspaceId, month), getHrRules(workspaceId), db.select().from(departments).where(eq(departments.workspaceId, workspaceId))]);
  const months = await buildMonth(workspaceId, month, people);
  const depName = new Map(deps.map((d) => [d.id, d.name]));
  const ids: string[] = [];
  for (const pm of months) {
    const adj = keep.get(pm.employee.id) ?? { additions: [], deductions: [], loanDeduction: "0" };
    const values = slipValues(pm, rules, pm.employee.departmentId ? (depName.get(pm.employee.departmentId) ?? null) : null, adj);
    await db
      .insert(payslips)
      .values({ ...values, workspaceId, runId, employeeId: pm.employee.id })
      .onConflictDoUpdate({ target: [payslips.runId, payslips.employeeId], set: values });
    ids.push(pm.employee.id);
  }
  // People no longer in this month (left before it, pay removed…) drop out of a draft.
  await db.delete(payslips).where(and(eq(payslips.runId, runId), ids.length ? notInArray(payslips.employeeId, ids) : undefined));
  return ids.length;
}

export async function createPayrollRun(slug: string, month: string): Promise<Result<{ month: string }>> {
  const t = await getT();
  const auth = await hrAdmin(slug);
  if (!auth) return { ok: false, error: t(ADMINS_ONLY) };
  if (!monthRe.test(month)) return { ok: false, error: t("Choose a month") };
  const ws = auth.workspace.id;
  const [existing] = await db.select({ id: payrollRuns.id }).from(payrollRuns).where(and(eq(payrollRuns.workspaceId, ws), eq(payrollRuns.month, month)));
  if (existing) return { ok: true, data: { month } };
  const [run] = await db.insert(payrollRuns).values({ workspaceId: ws, month, createdById: auth.user.id }).returning();
  const count = await writeSlips(ws, run.id, month, new Map());
  await log(ws, auth.user.id, "payroll.created", { month, count });
  refresh();
  return { ok: true, data: { month } };
}

async function draftRun(runId: string) {
  const [run] = await db.select().from(payrollRuns).where(eq(payrollRuns.id, runId)).limit(1);
  if (!run) return null;
  const auth = await hrAdminById(run.workspaceId);
  return auth ? { run, ...auth } : null;
}

/** Re-reads attendance, leave and pay for everyone; adjustments typed on the draft are kept. */
export async function recalculatePayroll(runId: string): Promise<Result<{ count: number }>> {
  const t = await getT();
  const auth = await draftRun(runId);
  if (!auth) return { ok: false, error: t(ADMINS_ONLY) };
  if (auth.run.status !== "draft") return { ok: false, error: t("Reopen the payroll to change it.") };
  const old = await db.select().from(payslips).where(eq(payslips.runId, runId));
  const keep = new Map(old.map((s) => [s.employeeId, { additions: s.additions, deductions: s.deductions, loanDeduction: s.loanDeduction }]));
  const count = await writeSlips(auth.run.workspaceId, runId, auth.run.month, keep);
  refresh();
  return { ok: true, data: { count } };
}

const adjustSchema = z.object({
  additions: lines,
  deductions: lines,
  loanDeduction: z
    .string()
    .trim()
    .optional()
    .transform((v) => (v ? v.replace(/,/g, "") : "0"))
    .refine((v) => /^\d{1,12}(\.\d{1,2})?$/.test(v), "Enter an amount like 150 or 150.50"),
});

/** Bonuses, extra deductions and the loan instalment for one payslip. */
export async function adjustPayslip(slipId: string, input: z.input<typeof adjustSchema>): Promise<Result> {
  const t = await getT();
  const [slip] = await db.select().from(payslips).where(eq(payslips.id, slipId)).limit(1);
  if (!slip) return { ok: false, error: t("Not found") };
  const auth = await draftRun(slip.runId);
  if (!auth) return { ok: false, error: t(ADMINS_ONLY) };
  if (auth.run.status !== "draft") return { ok: false, error: t("Reopen the payroll to change it.") };
  const parsed = adjustSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error, t);
  const [e] = await db.select().from(employees).where(eq(employees.id, slip.employeeId));
  if (!e) return { ok: false, error: t("Not found") };
  const owed = (await openLoansFor(auth.run.workspaceId, e)).reduce((s, l) => s + Number(l.balance), 0);
  if (Number(parsed.data.loanDeduction) > owed + 0.001) {
    const msg = t("That's more than the {amount} they still owe.", { amount: owed.toFixed(2) });
    return { ok: false, error: msg, fieldErrors: { loanDeduction: msg } };
  }
  const [pm] = await buildMonth(auth.run.workspaceId, auth.run.month, [e]);
  const rules = await getHrRules(auth.run.workspaceId);
  const values = slipValues(pm, rules, slip.department, parsed.data);
  if (Number(values.net) < 0) {
    const msg = t("Deductions can't be more than the pay.");
    return { ok: false, error: msg, fieldErrors: { deductions: msg } };
  }
  await db.update(payslips).set(values).where(eq(payslips.id, slipId));
  refresh();
  return { ok: true };
}

/** Locks the month and records loan instalments as repayments (oldest loan first). */
export async function approvePayroll(runId: string): Promise<Result> {
  const t = await getT();
  const auth = await draftRun(runId);
  if (!auth) return { ok: false, error: t(ADMINS_ONLY) };
  if (auth.run.status !== "draft") return { ok: true };
  const slips = await db.select().from(payslips).where(eq(payslips.runId, runId));
  if (slips.length === 0) return { ok: false, error: t("There's no one to pay in this month.") };
  const touched = new Set<string>();
  await db.transaction(async (tx) => {
    for (const s of slips) {
      let left = Math.round(Number(s.loanDeduction) * 100);
      if (left <= 0) continue;
      const [e] = await tx.select().from(employees).where(eq(employees.id, s.employeeId));
      for (const l of await openLoansFor(auth.run.workspaceId, e)) {
        if (left <= 0) break;
        const take = Math.min(left, Math.round(Number(l.balance) * 100));
        const [rep] = await tx
          .insert(loanRepayments)
          .values({ workspaceId: auth.run.workspaceId, loanId: l.loan.id, amount: (take / 100).toFixed(2), paidOn: todayISO(), method: "salary_deduction", note: t("Payroll {month}", { month: auth.run.month }), recordedById: auth.user.id })
          .returning({ id: loanRepayments.id });
        await tx.insert(payslipLoanRepayments).values({ payslipId: s.id, repaymentId: rep.id });
        touched.add(l.loan.id);
        left -= take;
      }
    }
    await tx.update(payrollRuns).set({ status: "approved", approvedById: auth.user.id, approvedAt: new Date() }).where(eq(payrollRuns.id, runId));
  });
  for (const id of touched) await syncPaidOff(id);
  await log(auth.run.workspaceId, auth.user.id, "payroll.approved", { month: auth.run.month, count: slips.length });
  refresh();
  return { ok: true };
}

/** Back to draft: the loan instalments it recorded are removed again. Not after it's paid. */
export async function reopenPayroll(runId: string): Promise<Result> {
  const t = await getT();
  const auth = await draftRun(runId);
  if (!auth) return { ok: false, error: t(ADMINS_ONLY) };
  if (auth.run.status === "paid") return { ok: false, error: t("A paid payroll can't be reopened. Mark it unpaid first.") };
  const slipIds = (await db.select({ id: payslips.id }).from(payslips).where(eq(payslips.runId, runId))).map((s) => s.id);
  const links = slipIds.length ? await db.select().from(payslipLoanRepayments).where(inArray(payslipLoanRepayments.payslipId, slipIds)) : [];
  const reps = links.length ? await db.select({ id: loanRepayments.id, loanId: loanRepayments.loanId }).from(loanRepayments).where(inArray(loanRepayments.id, links.map((l) => l.repaymentId))) : [];
  await db.transaction(async (tx) => {
    if (reps.length) await tx.delete(loanRepayments).where(inArray(loanRepayments.id, reps.map((r) => r.id)));
    await tx.update(payrollRuns).set({ status: "draft", approvedAt: null, approvedById: null }).where(eq(payrollRuns.id, runId));
  });
  for (const loanId of new Set(reps.map((r) => r.loanId))) await syncPaidOff(loanId);
  await log(auth.run.workspaceId, auth.user.id, "payroll.reopened", { month: auth.run.month });
  refresh();
  return { ok: true };
}

export async function setPayrollPaid(runId: string, paid: boolean, accountId?: string | null): Promise<Result> {
  const t = await getT();
  const auth = await draftRun(runId);
  if (!auth) return { ok: false, error: t(ADMINS_ONLY) };
  if (auth.run.status === "draft") return { ok: false, error: t("Approve the payroll first.") };
  let paidFromAccountId: string | null = null;
  if (paid && accountId) {
    const [acc] = await db
      .select({ id: ledgerAccounts.id })
      .from(ledgerAccounts)
      .where(and(eq(ledgerAccounts.id, accountId), eq(ledgerAccounts.workspaceId, auth.run.workspaceId), isNotNull(ledgerAccounts.moneyKind)));
    if (!acc) return { ok: false, error: t("Choose one of the options") };
    paidFromAccountId = acc.id;
  }
  await db.update(payrollRuns).set({ status: paid ? "paid" : "approved", paidAt: paid ? new Date() : null, paidFromAccountId }).where(eq(payrollRuns.id, runId));
  await log(auth.run.workspaceId, auth.user.id, paid ? "payroll.paid" : "payroll.unpaid", { month: auth.run.month });
  refresh();
  return { ok: true };
}

export async function deletePayroll(runId: string): Promise<Result> {
  const t = await getT();
  const auth = await draftRun(runId);
  if (!auth) return { ok: false, error: t(ADMINS_ONLY) };
  if (auth.run.status !== "draft") return { ok: false, error: t("Reopen the payroll to change it.") };
  await db.delete(payrollRuns).where(eq(payrollRuns.id, runId));
  await log(auth.run.workspaceId, auth.user.id, "payroll.deleted", { month: auth.run.month });
  refresh();
  return { ok: true };
}

// =============================== Assets ===============================

const enumOf = <L extends readonly { value: string }[]>(list: L) => z.enum(list.map((o) => o.value) as [string, ...string[]]);
const assetSchema = z.object({
  name: z.string().trim().min(2, "Give the asset a name").max(120),
  category: enumOf(ASSET_CATEGORIES),
  serial: text(120),
  value: z
    .string()
    .trim()
    .optional()
    .nullable()
    .transform((v) => (v ? v.replace(/,/g, "") : null))
    .refine((v) => v === null || /^\d{1,12}(\.\d{1,2})?$/.test(v), "Enter an amount like 1500 or 1500.50"),
  currency: z.string().trim().toUpperCase().regex(/^[A-Z]{3}$/, "Use a 3-letter currency code, e.g. USD"),
  purchaseDate: z.string().optional().nullable().transform((v) => v || null),
  condition: enumOf(ASSET_CONDITIONS),
  notes: text(1000),
});
export type AssetInput = z.input<typeof assetSchema>;

export async function saveAsset(slug: string, id: string | null, input: AssetInput): Promise<Result<{ id: string }>> {
  const t = await getT();
  const auth = await hrAdmin(slug);
  if (!auth) return { ok: false, error: t(ADMINS_ONLY) };
  const parsed = assetSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error, t);
  const ws = auth.workspace.id;
  if (id) {
    const [row] = await db
      .update(assets)
      .set({ ...parsed.data, updatedAt: new Date() })
      .where(and(eq(assets.id, id), eq(assets.workspaceId, ws)))
      .returning({ id: assets.id, number: assets.number });
    if (!row) return { ok: false, error: t("Not found") };
    refresh();
    return { ok: true, data: { id: row.id } };
  }
  const row = await db.transaction(async (tx) => {
    const [m] = await tx.select({ n: max(assets.number) }).from(assets).where(eq(assets.workspaceId, ws));
    const number = (m?.n ?? 0) + 1;
    const [r] = await tx.insert(assets).values({ ...parsed.data, number, workspaceId: ws, createdById: auth.user.id }).returning({ id: assets.id });
    await tx.insert(activities).values({ workspaceId: ws, actorId: auth.user.id, type: "asset.created", data: { name: parsed.data.name, code: assetCode(number) } });
    return r;
  });
  refresh();
  return { ok: true, data: { id: row.id } };
}

/** For an asset that isn't with anyone: available, under repair, retired or lost. */
export async function setAssetStatus(id: string, status: "available" | "repair" | "retired" | "lost"): Promise<Result> {
  const t = await getT();
  const [a] = await db.select().from(assets).where(eq(assets.id, id)).limit(1);
  if (!a) return { ok: false, error: t("Not found") };
  const auth = await hrAdminById(a.workspaceId);
  if (!auth) return { ok: false, error: t(ADMINS_ONLY) };
  if (a.status === "assigned") return { ok: false, error: t("Take it back from the person first.") };
  await db.update(assets).set({ status, updatedAt: new Date() }).where(eq(assets.id, id));
  await log(a.workspaceId, auth.user.id, "asset.status", { name: a.name, code: assetCode(a.number), status });
  refresh();
  return { ok: true };
}

export async function deleteAsset(id: string): Promise<Result> {
  const t = await getT();
  const [a] = await db.select().from(assets).where(eq(assets.id, id)).limit(1);
  if (!a) return { ok: false, error: t("Not found") };
  const auth = await hrAdminById(a.workspaceId);
  if (!auth) return { ok: false, error: t(ADMINS_ONLY) };
  if (a.status === "assigned") return { ok: false, error: t("Take it back from the person first.") };
  await db.delete(assets).where(eq(assets.id, id));
  await log(a.workspaceId, auth.user.id, "asset.deleted", { name: a.name, code: assetCode(a.number) });
  refresh();
  return { ok: true };
}

const handSchema = z.object({ employeeId: z.string().min(1, "Choose a person"), date: isoDay, condition: enumOf(ASSET_CONDITIONS), note: text(500) });

/** Hands an available asset to someone. */
export async function assignAsset(assetId: string, input: z.input<typeof handSchema>): Promise<Result<{ assignmentId: string }>> {
  const t = await getT();
  const [a] = await db.select().from(assets).where(eq(assets.id, assetId)).limit(1);
  if (!a) return { ok: false, error: t("Not found") };
  const auth = await hrAdminById(a.workspaceId);
  if (!auth) return { ok: false, error: t(ADMINS_ONLY) };
  const parsed = handSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error, t);
  if (a.status !== "available") return { ok: false, error: t("Only an available asset can be handed over.") };
  const [e] = await db.select().from(employees).where(and(eq(employees.id, parsed.data.employeeId), eq(employees.workspaceId, a.workspaceId)));
  if (!e || !isActive(e, parsed.data.date)) return { ok: false, error: t("Choose a person"), fieldErrors: { employeeId: t("Choose a person") } };
  const row = await db.transaction(async (tx) => {
    const [r] = await tx
      .insert(assetAssignments)
      .values({ workspaceId: a.workspaceId, assetId, employeeId: e.id, assignedOn: parsed.data.date, conditionOut: parsed.data.condition, noteOut: parsed.data.note, assignedById: auth.user.id })
      .returning({ id: assetAssignments.id });
    await tx.update(assets).set({ status: "assigned", condition: parsed.data.condition, updatedAt: new Date() }).where(eq(assets.id, assetId));
    await tx.insert(activities).values({ workspaceId: a.workspaceId, actorId: auth.user.id, type: "asset.assigned", data: { name: a.name, code: assetCode(a.number), person: e.name } });
    return r;
  });
  refresh();
  return { ok: true, data: { assignmentId: row.id } };
}

const returnSchema = z.object({ date: isoDay, condition: enumOf(ASSET_CONDITIONS), note: text(500), then: z.enum(["available", "repair", "lost", "retired"]) });

export async function returnAsset(assignmentId: string, input: z.input<typeof returnSchema>): Promise<Result> {
  const t = await getT();
  const [as] = await db.select().from(assetAssignments).where(eq(assetAssignments.id, assignmentId)).limit(1);
  if (!as || as.returnedOn) return { ok: false, error: t("Not found") };
  const auth = await hrAdminById(as.workspaceId);
  if (!auth) return { ok: false, error: t(ADMINS_ONLY) };
  const parsed = returnSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error, t);
  if (parsed.data.date < as.assignedOn) {
    const msg = t("It can't come back before it was handed over.");
    return { ok: false, error: msg, fieldErrors: { date: msg } };
  }
  const [[a], [e]] = await Promise.all([db.select().from(assets).where(eq(assets.id, as.assetId)), db.select().from(employees).where(eq(employees.id, as.employeeId))]);
  await db.transaction(async (tx) => {
    await tx
      .update(assetAssignments)
      .set({ returnedOn: parsed.data.date, conditionIn: parsed.data.condition, noteIn: parsed.data.note, returnedById: auth.user.id })
      .where(eq(assetAssignments.id, assignmentId));
    await tx.update(assets).set({ status: parsed.data.then, condition: parsed.data.condition, updatedAt: new Date() }).where(eq(assets.id, as.assetId));
    await tx.insert(activities).values({ workspaceId: as.workspaceId, actorId: auth.user.id, type: "asset.returned", data: { name: a?.name ?? "", code: a ? assetCode(a.number) : "", person: e?.name ?? "" } });
  });
  refresh();
  return { ok: true };
}

// =============================== Contracts, leaving ===============================

const contractSchema = z
  .object({
    startDate: isoDay,
    endDate: z.string().optional().nullable().transform((v) => v || null),
    employmentType: enumOf(EMPLOYMENT_TYPES),
    jobTitle: text(120),
    basicPay: z
      .string()
      .trim()
      .optional()
      .nullable()
      .transform((v) => (v ? v.replace(/,/g, "") : null))
      .refine((v) => v === null || /^\d{1,12}(\.\d{1,2})?$/.test(v), "Enter an amount like 1500 or 1500.50"),
    note: text(500),
    applyToFile: z.boolean(),
  })
  .refine((v) => !v.endDate || v.endDate >= v.startDate, { path: ["endDate"], message: "The contract can't end before it starts" });

/** Adds a contract (new or renewal) with an optional scan; can update the person's file to match. */
export async function saveContract(employeeId: string, formData: FormData): Promise<Result> {
  const t = await getT();
  const auth = await hrEmployee(employeeId);
  if (!auth) return { ok: false, error: t(ADMINS_ONLY) };
  const raw = Object.fromEntries(["startDate", "endDate", "employmentType", "jobTitle", "basicPay", "note"].map((k) => [k, formData.get(k)]));
  const parsed = contractSchema.safeParse({ ...raw, applyToFile: formData.get("applyToFile") === "1" });
  if (!parsed.success) return invalid(parsed.error, t);
  const { applyToFile, ...d } = parsed.data;
  const e = auth.employee;
  const file = formData.get("file");
  let upload: { filePath: string; fileName: string; fileType: string } | null = null;
  if (file instanceof File && file.size > 0) {
    const saved = await saveReceipt(e.workspaceId, file, t);
    if ("error" in saved) return { ok: false, error: saved.error, fieldErrors: { file: saved.error } };
    upload = { filePath: saved.path, fileName: saved.name, fileType: saved.type };
  }
  await db.transaction(async (tx) => {
    await tx.insert(employeeContracts).values({ ...d, ...upload, currency: e.currency, workspaceId: e.workspaceId, employeeId, createdById: auth.user.id });
    if (applyToFile)
      await tx
        .update(employees)
        .set({
          contractEndDate: d.endDate,
          employmentType: d.employmentType,
          ...(d.jobTitle ? { jobTitle: d.jobTitle } : {}),
          ...(d.basicPay ? { basicPay: d.basicPay } : {}),
          ...(!e.hireDate ? { hireDate: d.startDate } : {}),
          updatedAt: new Date(),
        })
        .where(eq(employees.id, employeeId));
    await tx.insert(activities).values({ workspaceId: e.workspaceId, actorId: auth.user.id, type: "employee.contract_added", data: { name: e.name, code: employeeCode(e.number), from: d.startDate, to: d.endDate } });
  });
  refresh();
  return { ok: true };
}

export async function deleteContract(id: string): Promise<Result> {
  const t = await getT();
  const [c] = await db.select().from(employeeContracts).where(eq(employeeContracts.id, id)).limit(1);
  if (!c) return { ok: false, error: t("Not found") };
  const auth = await hrEmployee(c.employeeId);
  if (!auth) return { ok: false, error: t(ADMINS_ONLY) };
  await db.delete(employeeContracts).where(eq(employeeContracts.id, id));
  await deleteStoredFile(c.filePath);
  refresh();
  return { ok: true };
}

export async function setOffboardingItem(employeeId: string, key: string, done: boolean): Promise<Result> {
  const t = await getT();
  const auth = await hrEmployee(employeeId);
  if (!auth) return { ok: false, error: t(ADMINS_ONLY) };
  if (!OFFBOARDING_ITEMS.some((i) => i.key === key)) return { ok: false, error: t("Not found") };
  await db
    .update(employees)
    .set({ offboarding: { ...auth.employee.offboarding, [key]: done } })
    .where(eq(employees.id, employeeId));
  refresh();
  return { ok: true };
}
