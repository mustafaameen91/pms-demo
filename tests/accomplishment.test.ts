import { test } from "node:test";
import assert from "node:assert/strict";
import { computeAccomplishment, plannedProgress, weightWarnings } from "../src/lib/accomplishment";

const noDates = { startDate: null, endDate: null };
const t = (weight: number | null, progress: number, startDate: string | null = null, dueDate: string | null = null, cancelled = false) =>
  ({ weight, progress, startDate, dueDate, cancelled });

test("weighted average when weights add up to 100", () => {
  const a = computeAccomplishment([t(10, 100), t(30, 60), t(60, 0)], noDates);
  assert.equal(a.actual, 28); // 10*1 + 30*0.6 + 60*0
  assert.equal(a.mode, "weighted");
  assert.deepEqual(weightWarnings(a), []);
});

test("normalizes when weights don't add up to 100, and warns", () => {
  const a = computeAccomplishment([t(30, 100), t(50, 0)], noDates);
  assert.equal(a.actual, 37.5); // 30 / 80
  assert.match(weightWarnings(a)[0], /add up to 80%\. Assign the remaining 20%/);
});

test("over 100% and unweighted tasks are reported", () => {
  const a = computeAccomplishment([t(70, 0), t(40, 0), t(null, 100)], noDates);
  assert.equal(a.actual, 0); // unweighted task counts 0
  const w = weightWarnings(a);
  assert.match(w[0], /110%, which is 10% over/);
  assert.match(w[1], /1 task has no weight/);
});

test("equal weighting when no weights at all", () => {
  const a = computeAccomplishment([t(null, 100), t(null, 0), t(null, 50)], noDates);
  assert.equal(a.actual, 50);
  assert.equal(a.mode, "equal");
  assert.match(weightWarnings(a)[0], /every task counts equally/);
});

test("cancelled tasks are ignored", () => {
  const a = computeAccomplishment([t(50, 100), t(50, 0, null, null, true)], noDates);
  assert.equal(a.actual, 100);
  assert.equal(a.taskCount, 1);
});

test("empty project", () => {
  const a = computeAccomplishment([], noDates);
  assert.equal(a.actual, null);
  assert.equal(a.mode, "empty");
});

test("planned progress is linear between start and end", () => {
  assert.equal(plannedProgress("2026-01-01", "2026-01-11", "2025-12-31"), 0);
  assert.equal(plannedProgress("2026-01-01", "2026-01-11", "2026-01-06"), 50);
  assert.equal(plannedProgress("2026-01-01", "2026-01-11", "2026-01-11"), 100);
  assert.equal(plannedProgress("2026-01-01", null, "2026-01-06"), null);
});

test("schedule: behind / on track / ahead, with project-date fallback", () => {
  const project = { startDate: "2026-01-01", endDate: "2026-01-11" };
  const today = "2026-01-06"; // planned 50%
  assert.equal(computeAccomplishment([t(100, 20)], project, today).schedule, "behind");
  assert.equal(computeAccomplishment([t(100, 52)], project, today).schedule, "on_track");
  assert.equal(computeAccomplishment([t(100, 80)], project, today).schedule, "ahead");
  const a = computeAccomplishment([t(100, 20)], project, today);
  assert.equal(a.planned, 50);
  assert.equal(a.variance, -30);
});

test("task dates override project dates; undated tasks excluded from planned", () => {
  const today = "2026-01-06";
  const a = computeAccomplishment(
    [t(50, 100, "2026-01-01", "2026-01-03"), t(50, 0)], // first should be 100%, second has no dates
    noDates,
    today,
  );
  assert.equal(a.planned, 100);
  assert.equal(a.scheduledCount, 1);
});

test("milestones never count toward accomplishment or weights", () => {
  const a = computeAccomplishment(
    [t(100, 50), { weight: null, progress: 0, startDate: null, dueDate: "2026-01-05", isMilestone: true }],
    noDates,
  );
  assert.equal(a.actual, 50);
  assert.equal(a.taskCount, 1);
  assert.deepEqual(weightWarnings(a), []);
});
