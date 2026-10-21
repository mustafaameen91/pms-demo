import { test } from "node:test";
import assert from "node:assert/strict";
import { addDays, buildWeek, isISODate, totalsByTask, usedFromTimesheets, weekDays, weekStartOf } from "../src/lib/timesheets";

test("weeks start on Saturday", () => {
  // 2026-10-21 is a Wednesday → week starts Saturday 2026-10-17.
  assert.equal(weekStartOf("2026-10-21"), "2026-10-17");
  assert.equal(weekStartOf("2026-10-17"), "2026-10-17");
  assert.equal(weekStartOf("2026-10-23"), "2026-10-17"); // Friday
  assert.equal(weekStartOf("2026-10-24"), "2026-10-24"); // next Saturday
  assert.deepEqual(weekDays("2026-10-17"), ["2026-10-17", "2026-10-18", "2026-10-19", "2026-10-20", "2026-10-21", "2026-10-22", "2026-10-23"]);
  assert.equal(addDays("2026-12-30", 3), "2027-01-02");
});

test("only real dates are accepted", () => {
  assert.ok(isISODate("2026-02-28"));
  assert.ok(!isISODate("2026-02-30"));
  assert.ok(!isISODate("21/10/2026"));
  assert.ok(!isISODate(undefined));
});

test("the week grid adds up per person and day, skips rejected, flags pending", () => {
  const entries = [
    { date: "2026-10-17", personKey: "w:1", personName: "Karim", kind: "worker" as const, quantity: "1", unit: "day", status: "approved" },
    { date: "2026-10-18", personKey: "w:1", personName: "Karim", kind: "worker" as const, quantity: "0.5", unit: "day", status: "approved" },
    { date: "2026-10-18", personKey: "u:1", personName: "Mona", kind: "member" as const, quantity: "3", unit: "hour", status: "approved" },
    { date: "2026-10-18", personKey: "u:1", personName: "Mona", kind: "member" as const, quantity: "4.5", unit: "hour", status: "pending" },
    { date: "2026-10-19", personKey: "u:1", personName: "Mona", kind: "member" as const, quantity: "8", unit: "hour", status: "rejected" },
    { date: "2026-10-25", personKey: "u:1", personName: "Mona", kind: "member" as const, quantity: "8", unit: "hour", status: "approved" },
  ];
  const rows = buildWeek(entries, "2026-10-17");
  assert.deepEqual(rows.map((r) => r.personName), ["Mona", "Karim"]);
  assert.deepEqual(rows[0].days["2026-10-18"], [{ quantity: 7.5, unit: "hour", pending: true }]);
  assert.equal(rows[0].days["2026-10-19"], undefined);
  assert.deepEqual(rows[0].totals, [{ quantity: 7.5, unit: "hour" }]);
  assert.deepEqual(rows[1].totals, [{ quantity: 1.5, unit: "day" }]);
});

test("task totals and a worker's used quantity only count approved time", () => {
  const entries = [
    { taskId: "t1", quantity: "1", unit: "day", status: "approved" },
    { taskId: "t1", quantity: "1", unit: "day", status: "approved" },
    { taskId: null, quantity: "2", unit: "hour", status: "approved" },
    { taskId: "t1", quantity: "5", unit: "day", status: "pending" },
  ];
  const map = totalsByTask(entries);
  assert.deepEqual(map.get("t1"), [{ quantity: 2, unit: "day" }]);
  assert.deepEqual(map.get(null), [{ quantity: 2, unit: "hour" }]);
  assert.equal(usedFromTimesheets("3", entries), 7);
});
