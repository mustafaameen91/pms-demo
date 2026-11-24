/**
 * HR rules for attendance, leave, payroll and end of service (pure; Phase 28).
 * No country is built in: every rate and rule comes from the company's settings.
 * Money is worked in cents so rounding can't drift.
 */
import { daysBetween } from "@/lib/schedule";

// --- Settings ---

export type ResignationTier = { years: number; percent: number };
export type EndOfServiceRules = {
  firstYears: number;
  daysFirst: number;
  daysAfter: number;
  minYears: number;
  basis: "basic" | "gross";
  resignation: ResignationTier[];
};

export type HrRules = {
  weekend: number[];
  workStart: string;
  workEnd: string;
  graceMinutes: number;
  overtimeRate: number;
  dayBasis: "30" | "working";
  ssEmployee: number;
  ssEmployer: number;
  ssBase: "basic" | "gross";
  endOfService: EndOfServiceRules;
};

export const DEFAULT_RULES: HrRules = {
  weekend: [5, 6],
  workStart: "08:00",
  workEnd: "16:00",
  graceMinutes: 15,
  overtimeRate: 1.5,
  dayBasis: "30",
  ssEmployee: 0,
  ssEmployer: 0,
  ssBase: "basic",
  endOfService: { firstYears: 5, daysFirst: 15, daysAfter: 30, minYears: 1, basis: "basic", resignation: [] },
};

/** Leave types a company starts with (all editable). */
export const DEFAULT_LEAVE_TYPES = [
  { name: "Annual leave", paid: true, daysPerYear: "21", carryOver: "5", color: "#4F46E5" },
  { name: "Sick leave", paid: true, daysPerYear: "14", carryOver: "0", color: "#DB2777" },
  { name: "Unpaid leave", paid: false, daysPerYear: null, carryOver: "0", color: "#64748B" },
] as const;

export const WEEKDAYS = [
  { value: 6, label: "Saturday" },
  { value: 0, label: "Sunday" },
  { value: 1, label: "Monday" },
  { value: 2, label: "Tuesday" },
  { value: 3, label: "Wednesday" },
  { value: 4, label: "Thursday" },
  { value: 5, label: "Friday" },
] as const;

// --- Dates & times ---

const parseDay = (iso: string) => {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
};
const toISO = (d: Date) => d.toISOString().slice(0, 10);
export const addDays = (iso: string, n: number) => {
  const d = parseDay(iso);
  d.setUTCDate(d.getUTCDate() + n);
  return toISO(d);
};
export const weekday = (iso: string) => parseDay(iso).getUTCDay();

/** Every date of a month ("2026-11"). */
export function monthDays(month: string): string[] {
  const [y, m] = month.split("-").map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return Array.from({ length: last }, (_, i) => `${month}-${String(i + 1).padStart(2, "0")}`);
}
export const monthOf = (iso: string) => iso.slice(0, 7);
export const shiftMonth = (month: string, n: number) => {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + n, 1));
  return toISO(d).slice(0, 7);
};

/** "08:30" → 510 minutes; null when not a time. */
export function minutesOf(time: string | null | undefined): number | null {
  if (!time || !/^\d{1,2}:\d{2}$/.test(time)) return null;
  const [h, m] = time.split(":").map(Number);
  return h < 24 && m < 60 ? h * 60 + m : null;
}

/** Length of a work day in hours (a shift past midnight wraps). */
export function shiftHours(start: string, end: string) {
  const s = minutesOf(start);
  const e = minutesOf(end);
  if (s === null || e === null) return 8;
  const span = e > s ? e - s : e + 24 * 60 - s;
  return span / 60;
}

/** Hours between check-in and check-out (wraps past midnight). */
export function hoursBetween(checkIn: string | null, checkOut: string | null) {
  const s = minutesOf(checkIn);
  const e = minutesOf(checkOut);
  if (s === null || e === null) return null;
  const span = e >= s ? e - s : e + 24 * 60 - s;
  return Math.round((span / 60) * 100) / 100;
}

/** Minutes late after the grace period (0 when on time). */
export function lateMinutes(checkIn: string | null, start: string, grace: number) {
  const c = minutesOf(checkIn);
  const s = minutesOf(start);
  if (c === null || s === null) return 0;
  const late = c - s;
  return late > grace ? late : 0;
}

// --- Attendance ---

/** What someone can be marked as for a day. */
export const ATTENDANCE_STATUSES = [
  { value: "present", label: "Present" },
  { value: "late", label: "Late" },
  { value: "remote", label: "Remote" },
  { value: "half_day", label: "Half day" },
  { value: "absent", label: "Absent" },
] as const;
export type AttendanceStatus = (typeof ATTENDANCE_STATUSES)[number]["value"];

/** A day as shown and paid: recorded statuses plus the ones filled in automatically. */
export type DayKind = AttendanceStatus | "weekend" | "holiday" | "leave" | "not_recorded" | "not_employed";

export type DayRecord = { status: string; lateMinutes: number; overtimeHours: number; hours: number | null; checkIn: string | null; checkOut: string | null };

export type ResolvedDay = {
  date: string;
  kind: DayKind;
  /** For leave days: whether it's paid, and the type. */
  leavePaid?: boolean;
  leaveTypeId?: string;
  /** 0.5 for half-day leave. */
  leaveFraction?: number;
  record?: DayRecord;
  holidayName?: string;
};

export type LeaveSpan = { typeId: string; paid: boolean; startDate: string; endDate: string; days: number };

/**
 * What a day was for one person. Order: outside employment → leave → recorded →
 * holiday → weekend → not recorded. A record on a weekend (they came in) wins.
 */
export function resolveDay(
  date: string,
  ctx: {
    hireDate: string | null;
    endDate: string | null;
    weekend: number[];
    holidays: Map<string, string>;
    leaves: LeaveSpan[];
    record?: DayRecord;
  },
): ResolvedDay {
  if ((ctx.hireDate && date < ctx.hireDate) || (ctx.endDate && date > ctx.endDate)) return { date, kind: "not_employed" };
  const holiday = ctx.holidays.get(date);
  const off = ctx.weekend.includes(weekday(date));
  const leave = ctx.leaves.find((l) => l.startDate <= date && date <= l.endDate);
  if (leave && !holiday && !off) {
    const workDays = l2days(leave);
    return { date, kind: "leave", leavePaid: leave.paid, leaveTypeId: leave.typeId, leaveFraction: workDays.half ? 0.5 : 1, record: ctx.record };
  }
  if (ctx.record) return { date, kind: ctx.record.status as AttendanceStatus, record: ctx.record };
  if (holiday) return { date, kind: "holiday", holidayName: holiday };
  if (off) return { date, kind: "weekend" };
  return { date, kind: "not_recorded" };
}
const l2days = (l: LeaveSpan) => ({ half: l.startDate === l.endDate && l.days === 0.5 });

/** Working days (not weekend, not holiday) from start to end inclusive. */
export function workingDays(start: string, end: string, weekend: number[], holidays: Set<string> | Map<string, string>) {
  let n = 0;
  for (let d = start; d <= end; d = addDays(d, 1)) if (!weekend.includes(weekday(d)) && !holidays.has(d)) n++;
  return n;
}

export type MonthSummary = {
  /** Working days while employed. */
  workingDays: number;
  /** Working days in the whole month (for "÷ working days" pay). */
  monthWorkingDays: number;
  /** Calendar days in the month, and how many of them they were employed. */
  calendarDays: number;
  employedDays: number;
  /** Paid as worked: present, late, remote, half of half days, not recorded. */
  workedDays: number;
  absentDays: number;
  paidLeaveDays: number;
  unpaidLeaveDays: number;
  holidays: number;
  lateDays: number;
  lateMinutes: number;
  overtimeHours: number;
  /** Recorded hours (hourly staff); days without hours count as a full shift. */
  hoursWorked: number;
  notRecorded: number;
};

/** Adds up a person's month. Days not recorded are treated as worked, so companies that don't track attendance still pay in full. */
export function summarizeMonth(days: ResolvedDay[], ctx: { weekend: number[]; holidays: Map<string, string>; dayHours: number; month: string }): MonthSummary {
  const s: MonthSummary = {
    workingDays: 0,
    monthWorkingDays: workingDays(`${ctx.month}-01`, monthDays(ctx.month).at(-1)!, ctx.weekend, ctx.holidays),
    calendarDays: monthDays(ctx.month).length,
    employedDays: 0,
    workedDays: 0,
    absentDays: 0,
    paidLeaveDays: 0,
    unpaidLeaveDays: 0,
    holidays: 0,
    lateDays: 0,
    lateMinutes: 0,
    overtimeHours: 0,
    hoursWorked: 0,
    notRecorded: 0,
  };
  for (const d of days) {
    if (d.kind === "not_employed") continue;
    s.employedDays++;
    const off = d.kind === "weekend" || d.kind === "holiday" || ctx.weekend.includes(weekday(d.date)) || ctx.holidays.has(d.date);
    if (!off) s.workingDays++;
    if (d.record) {
      s.overtimeHours += d.record.overtimeHours;
      s.lateMinutes += d.record.lateMinutes;
    }
    const hours = (frac: number) => d.record?.hours ?? hoursBetween(d.record?.checkIn ?? null, d.record?.checkOut ?? null) ?? ctx.dayHours * frac;
    switch (d.kind) {
      case "present":
      case "remote":
        s.workedDays++;
        s.hoursWorked += hours(1);
        break;
      case "late":
        s.workedDays++;
        s.lateDays++;
        s.hoursWorked += hours(1);
        break;
      case "half_day":
        s.workedDays += 0.5;
        s.absentDays += 0.5;
        s.hoursWorked += hours(0.5);
        break;
      case "absent":
        s.absentDays++;
        break;
      case "leave": {
        const f = d.leaveFraction ?? 1;
        if (d.leavePaid) s.paidLeaveDays += f;
        else s.unpaidLeaveDays += f;
        if (f < 1) {
          s.workedDays += 1 - f;
          s.hoursWorked += ctx.dayHours * (1 - f);
        }
        break;
      }
      case "holiday":
        s.holidays++;
        break;
      case "not_recorded":
        s.workedDays++;
        s.notRecorded++;
        s.hoursWorked += ctx.dayHours;
        break;
    }
  }
  s.overtimeHours = round2(s.overtimeHours);
  s.hoursWorked = round2(s.hoursWorked);
  return s;
}
const round2 = (n: number) => Math.round(n * 100) / 100;

// --- Leave balances ---

/** Working days a leave request uses; a one-day request can be a half day. */
export function leaveDays(start: string, end: string, weekend: number[], holidays: Set<string> | Map<string, string>, halfDay = false) {
  if (end < start) return 0;
  const n = workingDays(start, end, weekend, holidays);
  return halfDay && start === end && n === 1 ? 0.5 : n;
}

export type LeaveBalance = {
  /** Days for the whole year (pro-rated from the hire date). */
  entitlement: number;
  /** Earned so far this year (monthly). */
  accrued: number;
  carried: number;
  used: number;
  pending: number;
  /** accrued + carried − used. */
  available: number;
};

/** Months employed in a year up to `uptoMonth` (1–12), counting the hire month if hired by the 15th. */
function monthsEmployed(year: number, hireDate: string | null, uptoMonth: number) {
  if (!hireDate) return uptoMonth;
  const [hy, hm, hd] = hireDate.split("-").map(Number);
  if (hy > year) return 0;
  if (hy < year) return uptoMonth;
  const first = hd <= 15 ? hm : hm + 1;
  return Math.max(0, uptoMonth - first + 1);
}

/**
 * Where someone stands on one leave type for the year of `today`. Days are earned
 * month by month; unused days from last year carry over up to the type's limit.
 */
export function leaveBalance(
  type: { daysPerYear: number | null; carryOver: number },
  hireDate: string | null,
  today: string,
  requests: { startDate: string; days: number; status: string }[],
): LeaveBalance | null {
  if (type.daysPerYear === null) return null;
  const year = Number(today.slice(0, 4));
  const month = Number(today.slice(5, 7));
  const per = type.daysPerYear;
  const inYear = (y: number, statuses: string[]) =>
    requests.filter((r) => Number(r.startDate.slice(0, 4)) === y && statuses.includes(r.status)).reduce((s, r) => s + r.days, 0);
  const lastYearEarned = (per * monthsEmployed(year - 1, hireDate, 12)) / 12;
  const carried = Math.min(type.carryOver, Math.max(0, lastYearEarned - inYear(year - 1, ["approved"])));
  const entitlement = (per * monthsEmployed(year, hireDate, 12)) / 12;
  const accrued = (per * monthsEmployed(year, hireDate, month)) / 12;
  const used = inYear(year, ["approved"]);
  const pending = inYear(year, ["pending"]);
  const r1 = (n: number) => Math.round(n * 10) / 10;
  return { entitlement: r1(entitlement), accrued: r1(accrued), carried: r1(carried), used: r1(used), pending: r1(pending), available: r1(accrued + carried - used) };
}

// --- Payroll ---

const cents = (v: string | number | null | undefined) => Math.round(Number(v || 0) * 100);
const money = (c: number) => (c / 100).toFixed(2);

export type PayInput = {
  payBasis: "monthly" | "daily" | "hourly";
  basicPay: string | null;
  allowances: { name: string; amount: string }[];
  summary: MonthSummary;
  rules: Pick<HrRules, "dayBasis" | "overtimeRate" | "ssEmployee" | "ssEmployer" | "ssBase">;
  dayHours: number;
  additions?: { name: string; amount: string }[];
  deductions?: { name: string; amount: string }[];
  loanDeduction?: string;
};

export type PayResult = {
  /** Days the basic was paid for (monthly: after absences and days not employed). */
  paidDays: number;
  basicEarned: string;
  allowances: { name: string; amount: string }[];
  overtimePay: string;
  hourlyRate: string;
  additions: string;
  gross: string;
  ssEmployee: string;
  ssEmployer: string;
  deductions: string;
  loanDeduction: string;
  net: string;
};

/**
 * One person's pay for a month.
 * - Monthly: basic and allowances, less unpaid days (absent, unpaid leave, days not employed) at a day's rate
 *   (monthly ÷ 30, or ÷ the month's working days).
 * - Daily: (basic + allowances) × days worked or on paid leave.
 * - Hourly: (basic + allowances) × hours worked (+ paid leave at a full shift).
 * Overtime = hourly rate × overtime rate × hours. Social security on basic (or gross).
 */
export function computePay(p: PayInput): PayResult {
  const s = p.summary;
  const basic = cents(p.basicPay);
  let factor: number;
  let paidDays: number;
  let hourly: number;
  if (p.payBasis === "monthly") {
    const divisor = p.rules.dayBasis === "working" ? Math.max(1, s.monthWorkingDays) : 30;
    const notEmployed = p.rules.dayBasis === "working" ? s.monthWorkingDays - s.workingDays : s.calendarDays - s.employedDays;
    const unpaid = Math.min(divisor, s.absentDays + s.unpaidLeaveDays + Math.max(0, notEmployed));
    paidDays = divisor - unpaid;
    factor = paidDays / divisor;
    hourly = basic / divisor / Math.max(1, p.dayHours);
  } else if (p.payBasis === "daily") {
    paidDays = s.workedDays + s.paidLeaveDays;
    factor = paidDays;
    hourly = basic / Math.max(1, p.dayHours);
  } else {
    paidDays = s.workedDays + s.paidLeaveDays;
    factor = s.hoursWorked + s.paidLeaveDays * p.dayHours;
    hourly = basic;
  }
  const basicEarned = Math.round(basic * factor);
  const allowances = p.allowances.map((a) => ({ name: a.name, amount: money(Math.round(cents(a.amount) * factor)) }));
  const allowanceTotal = allowances.reduce((t, a) => t + cents(a.amount), 0);
  const overtime = Math.round(hourly * p.rules.overtimeRate * s.overtimeHours);
  const additions = (p.additions ?? []).reduce((t, a) => t + cents(a.amount), 0);
  const gross = basicEarned + allowanceTotal + overtime + additions;
  const ssBase = p.rules.ssBase === "gross" ? basicEarned + allowanceTotal : basicEarned;
  const ssEmployee = Math.round((ssBase * p.rules.ssEmployee) / 100);
  const ssEmployer = Math.round((ssBase * p.rules.ssEmployer) / 100);
  const deductions = (p.deductions ?? []).reduce((t, a) => t + cents(a.amount), 0);
  const loan = cents(p.loanDeduction);
  return {
    paidDays: Math.round(paidDays * 10) / 10,
    basicEarned: money(basicEarned),
    allowances,
    overtimePay: money(overtime),
    hourlyRate: money(Math.round(hourly)),
    additions: money(additions),
    gross: money(gross),
    ssEmployee: money(ssEmployee),
    ssEmployer: money(ssEmployer),
    deductions: money(deductions),
    loanDeduction: money(loan),
    net: money(gross - ssEmployee - deductions - loan),
  };
}

// --- End of service & final settlement ---

/** Years of service as a decimal (days ÷ 365.25). */
export const serviceYears = (from: string, to: string) => Math.max(0, daysBetween(from, to) + 1) / 365.25;

export type EndOfService = { years: number; days: number; dailyWage: string; full: string; percent: number; amount: string };

/**
 * End-of-service pay: days of pay per year (one rate for the first years, another after),
 * paid in proportion for part years; nothing under the minimum service; a share if they resigned.
 */
export function endOfService(years: number, monthlyWage: string | number, rules: EndOfServiceRules, resigned: boolean): EndOfService {
  const daily = cents(monthlyWage) / 30;
  if (years < rules.minYears) return { years: round2(years), days: 0, dailyWage: money(Math.round(daily)), full: "0.00", percent: 0, amount: "0.00" };
  const first = Math.min(years, rules.firstYears);
  const after = Math.max(0, years - rules.firstYears);
  const days = first * rules.daysFirst + after * rules.daysAfter;
  const full = Math.round(daily * days);
  let percent = 100;
  if (resigned && rules.resignation.length) {
    const tiers = [...rules.resignation].sort((a, b) => a.years - b.years);
    percent = 0;
    for (const t of tiers) if (years >= t.years) percent = t.percent;
  }
  return { years: round2(years), days: round2(days), dailyWage: money(Math.round(daily)), full: money(full), percent, amount: money(Math.round((full * percent) / 100)) };
}

/** Ways someone can leave. */
export const LEAVING_REASONS = [
  { value: "resigned", label: "Resigned" },
  { value: "contract_ended", label: "Contract ended" },
  { value: "terminated", label: "Let go by the company" },
  { value: "retired", label: "Retired|leaving" },
  { value: "other", label: "Other" },
] as const;

/** The leaving checklist; "assets" and "loans" also check the real data. */
export const OFFBOARDING_ITEMS = [
  { key: "assets", label: "Company assets returned" },
  { key: "loans", label: "Loans settled" },
  { key: "settlement", label: "Final settlement paid" },
  { key: "documents", label: "Clearance and experience letter handed over" },
  { key: "access", label: "Tamm login and other accounts removed" },
] as const;

// --- Assets ---

export const ASSET_CATEGORIES = [
  { value: "laptop", label: "Laptop / computer" },
  { value: "phone", label: "Phone / tablet" },
  { value: "vehicle", label: "Vehicle" },
  { value: "tool", label: "Tools" },
  { value: "equipment", label: "Equipment" },
  { value: "safety", label: "Safety gear / uniform" },
  { value: "card", label: "Card / key / SIM" },
  { value: "furniture", label: "Furniture" },
  { value: "other", label: "Other" },
] as const;

export const ASSET_CONDITIONS = [
  { value: "new", label: "New" },
  { value: "good", label: "Good" },
  { value: "fair", label: "Fair" },
  { value: "poor", label: "Poor" },
  { value: "broken", label: "Broken" },
] as const;

export const ASSET_STATUSES = [
  { value: "available", label: "Available" },
  { value: "assigned", label: "With someone" },
  { value: "repair", label: "Under repair" },
  { value: "retired", label: "Retired" },
  { value: "lost", label: "Lost" },
] as const;

export const assetCode = (n: number) => `AST-${String(n).padStart(3, "0")}`;
