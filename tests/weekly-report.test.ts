import { test } from "node:test";
import assert from "node:assert/strict";
import { headline, progressChange, reportWeek, type ReportProject } from "../src/lib/weekly-report";

test("the report due is for the last full Saturday–Friday week", () => {
  // Wednesday 21 Oct 2026 → week of Sat 10 – Fri 16 Oct.
  assert.deepEqual(reportWeek("2026-10-21"), { start: "2026-10-10", end: "2026-10-16" });
  // On Saturday 24 Oct the week of 17–23 Oct has just ended.
  assert.deepEqual(reportWeek("2026-10-24"), { start: "2026-10-17", end: "2026-10-23" });
  // Friday is still inside the current week.
  assert.deepEqual(reportWeek("2026-10-23"), { start: "2026-10-10", end: "2026-10-16" });
});

test("progress change and the inbox headline", () => {
  assert.equal(progressChange(42.5, 36), 6.5);
  assert.equal(progressChange(40, null), null);
  assert.equal(progressChange(null, 20), null);
  const p = (o: Partial<ReportProject>): ReportProject =>
    ({ schedule: null, overBudget: false, forecast: null, lateCount: 0, doneCount: 0, ...o }) as ReportProject;
  const h = headline([
    p({ schedule: "behind", lateCount: 2, doneCount: 3 }),
    p({ overBudget: true, forecast: { final: 1, overBy: 1, overPct: 20, health: "bad", early: false } }),
    p({ forecast: { final: 1, overBy: 1, overPct: 5, health: "watch", early: false }, lateCount: 1 }),
    p({ forecast: { final: 1, overBy: 1, overPct: 50, health: "bad", early: true } }),
  ]);
  assert.deepEqual(h, { projects: 4, behind: 1, overBudget: 1, headingOver: 1, late: 3, done: 3 });
});
