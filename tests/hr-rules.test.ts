import { test } from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_RULES,
  computePay,
  endOfService,
  hoursBetween,
  lateMinutes,
  leaveBalance,
  leaveDays,
  monthDays,
  resolveDay,
  serviceYears,
  shiftHours,
  summarizeMonth,
  workingDays,
  type DayRecord,
  type LeaveSpan,
} from "../src/lib/hr-rules";

const WEEKEND = [5, 6]; // Friday, Saturday
const rec = (status: string, o: Partial<DayRecord> = {}): DayRecord => ({ status, lateMinutes: 0, overtimeHours: 0, hours: null, checkIn: null, checkOut: null, ...o });

function month(month: string, opts: { records?: Record<string, DayRecord>; leaves?: LeaveSpan[]; hireDate?: string | null; endDate?: string | null; holidays?: [string, string][] } = {}) {
  const holidays = new Map(opts.holidays ?? []);
  const days = monthDays(month).map((d) =>
    resolveDay(d, { hireDate: opts.hireDate ?? null, endDate: opts.endDate ?? null, weekend: WEEKEND, holidays, leaves: opts.leaves ?? [], record: opts.records?.[d] }),
  );
  return { days, summary: summarizeMonth(days, { weekend: WEEKEND, holidays, dayHours: 8, month }) };
}

test("times: shift length, hours worked, lateness", () => {
  assert.equal(shiftHours("08:00", "16:00"), 8);
  assert.equal(shiftHours("22:00", "06:00"), 8);
  assert.equal(hoursBetween("08:15", "17:45"), 9.5);
  assert.equal(hoursBetween(null, "17:00"), null);
  assert.equal(lateMinutes("08:10", "08:00", 15), 0);
  assert.equal(lateMinutes("08:40", "08:00", 15), 40);
});

test("working days skip weekends and holidays", () => {
  // Nov 2026: 30 days, Fridays 6/13/20/27, Saturdays 7/14/21/28 → 22 working days.
  assert.equal(workingDays("2026-11-01", "2026-11-30", WEEKEND, new Set()), 22);
  assert.equal(workingDays("2026-11-01", "2026-11-30", WEEKEND, new Set(["2026-11-02"])), 21);
  assert.equal(leaveDays("2026-11-05", "2026-11-08", WEEKEND, new Set()), 2);
  assert.equal(leaveDays("2026-11-09", "2026-11-09", WEEKEND, new Set(), true), 0.5);
});

test("a day resolves to leave, record, holiday, weekend or not recorded", () => {
  const ctx = { hireDate: "2026-11-03", endDate: null, weekend: WEEKEND, holidays: new Map([["2026-11-10", "Holiday"]]), leaves: [{ typeId: "a", paid: true, startDate: "2026-11-11", endDate: "2026-11-12", days: 2 }] };
  assert.equal(resolveDay("2026-11-02", ctx).kind, "not_employed");
  assert.equal(resolveDay("2026-11-10", ctx).kind, "holiday");
  assert.equal(resolveDay("2026-11-11", ctx).kind, "leave");
  assert.equal(resolveDay("2026-11-06", ctx).kind, "weekend");
  assert.equal(resolveDay("2026-11-06", { ...ctx, record: rec("present") }).kind, "present");
  assert.equal(resolveDay("2026-11-04", ctx).kind, "not_recorded");
});

test("month summary: absences, half days, leave, overtime", () => {
  const { summary } = month("2026-11", {
    records: {
      "2026-11-02": rec("absent"),
      "2026-11-03": rec("half_day"),
      "2026-11-04": rec("late", { lateMinutes: 30, overtimeHours: 2 }),
    },
    leaves: [
      { typeId: "annual", paid: true, startDate: "2026-11-09", endDate: "2026-11-10", days: 2 },
      { typeId: "unpaid", paid: false, startDate: "2026-11-11", endDate: "2026-11-11", days: 1 },
    ],
  });
  assert.equal(summary.workingDays, 22);
  assert.equal(summary.absentDays, 1.5);
  assert.equal(summary.paidLeaveDays, 2);
  assert.equal(summary.unpaidLeaveDays, 1);
  assert.equal(summary.workedDays, 22 - 1 - 1 - 2 - 0.5);
  assert.equal(summary.overtimeHours, 2);
  assert.equal(summary.lateDays, 1);
});

const rules = { dayBasis: "30" as const, overtimeRate: 1.5, ssEmployee: 5, ssEmployer: 12, ssBase: "basic" as const };

test("monthly pay: full month, absences, overtime, social security, loan", () => {
  const full = month("2026-11").summary;
  const p = computePay({ payBasis: "monthly", basicPay: "3000", allowances: [{ name: "Housing", amount: "600" }], summary: full, rules, dayHours: 8 });
  assert.equal(p.basicEarned, "3000.00");
  assert.equal(p.gross, "3600.00");
  assert.equal(p.ssEmployee, "150.00");
  assert.equal(p.ssEmployer, "360.00");
  assert.equal(p.net, "3450.00");

  const { summary } = month("2026-11", { records: { "2026-11-02": rec("absent"), "2026-11-03": rec("present", { overtimeHours: 4 }) } });
  const q = computePay({ payBasis: "monthly", basicPay: "3000", allowances: [], summary, rules, dayHours: 8, loanDeduction: "200", additions: [{ name: "Bonus", amount: "100" }] });
  // 1 day off at 3000/30 = 100; overtime 3000/30/8 = 12.5/h × 1.5 × 4 = 75.
  assert.equal(q.basicEarned, "2900.00");
  assert.equal(q.overtimePay, "75.00");
  assert.equal(q.gross, "3075.00");
  assert.equal(q.net, String((3075 - 145 - 200).toFixed(2)));
});

test("monthly pay in a short month and when hired mid-month", () => {
  const feb = month("2027-02").summary;
  assert.equal(computePay({ payBasis: "monthly", basicPay: "3000", allowances: [], summary: feb, rules, dayHours: 8 }).basicEarned, "3000.00");
  const joined = month("2026-11", { hireDate: "2026-11-16" }).summary;
  // Employed 15 of 30 days → half.
  assert.equal(computePay({ payBasis: "monthly", basicPay: "3000", allowances: [], summary: joined, rules, dayHours: 8 }).basicEarned, "1500.00");
  const working = computePay({ payBasis: "monthly", basicPay: "2200", allowances: [], summary: month("2026-11", { records: { "2026-11-02": rec("absent") } }).summary, rules: { ...rules, dayBasis: "working" }, dayHours: 8 });
  assert.equal(working.basicEarned, "2100.00");
});

test("daily and hourly pay", () => {
  const { summary } = month("2026-11", { records: { "2026-11-02": rec("absent"), "2026-11-03": rec("present", { hours: 10 }) } });
  const d = computePay({ payBasis: "daily", basicPay: "40", allowances: [{ name: "Food", amount: "5" }], summary, rules, dayHours: 8 });
  assert.equal(d.basicEarned, "840.00"); // 21 days
  assert.equal(d.gross, "945.00");
  const h = computePay({ payBasis: "hourly", basicPay: "10", allowances: [], summary, rules: { ...rules, ssEmployee: 0 }, dayHours: 8 });
  // 20 days × 8h + 10h = 170h
  assert.equal(h.basicEarned, "1700.00");
});

test("leave balance: monthly accrual, carry-over, pro-rated first year", () => {
  const type = { daysPerYear: 24, carryOver: 5 };
  const b = leaveBalance(type, "2020-01-01", "2026-06-10", [
    { startDate: "2025-03-01", days: 10, status: "approved" },
    { startDate: "2026-02-01", days: 3, status: "approved" },
    { startDate: "2026-07-01", days: 2, status: "pending" },
  ])!;
  assert.deepEqual(b, { entitlement: 24, accrued: 12, carried: 5, used: 3, pending: 2, available: 14 });
  const fresh = leaveBalance(type, "2026-07-20", "2026-11-04", [])!;
  // Hired after the 15th → counts from August: 4 months of 2 days.
  assert.equal(fresh.accrued, 8);
  assert.equal(fresh.entitlement, 10);
  assert.equal(leaveBalance({ daysPerYear: null, carryOver: 0 }, null, "2026-01-01", []), null);
});

test("end of service: tiers, minimum, resignation share", () => {
  const rules = { firstYears: 5, daysFirst: 15, daysAfter: 30, minYears: 1, basis: "basic" as const, resignation: [{ years: 2, percent: 33 }, { years: 5, percent: 66 }, { years: 10, percent: 100 }] };
  const e = endOfService(7, "3000", rules, false);
  // 5×15 + 2×30 = 135 days × 100/day
  assert.equal(e.days, 135);
  assert.equal(e.amount, "13500.00");
  assert.equal(endOfService(7, "3000", rules, true).percent, 66);
  assert.equal(endOfService(7, "3000", rules, true).amount, "8910.00");
  assert.equal(endOfService(1.5, "3000", rules, true).amount, "0.00");
  assert.equal(endOfService(0.5, "3000", rules, false).amount, "0.00");
  assert.ok(Math.abs(serviceYears("2020-01-01", "2024-12-31") - 5) < 0.01);
  assert.equal(DEFAULT_RULES.overtimeRate, 1.5);
});
