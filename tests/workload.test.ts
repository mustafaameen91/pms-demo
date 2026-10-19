import { test } from "node:test";
import assert from "node:assert/strict";
import { buildWorkload, columnFor, weekStart, workloadColumns } from "../src/lib/workload";

const today = "2026-10-21"; // Wednesday
const cols = workloadColumns(today, 2); // weeks of Oct 19 and Oct 26

test("weeks start on Monday", () => {
  assert.equal(weekStart("2026-10-21"), "2026-10-19");
  assert.equal(weekStart("2026-10-19"), "2026-10-19");
  assert.equal(weekStart("2026-10-25"), "2026-10-19");
  assert.deepEqual(cols.map((c) => c.key), ["overdue", "2026-10-19", "2026-10-26", "later", "none"]);
});

test("tasks land in the right column", () => {
  const t = (dueDate: string | null, category = "todo", isMilestone = false) => ({ id: "x", assigneeId: "a", dueDate, category, isMilestone });
  assert.equal(columnFor(t("2026-10-20"), today, cols), "overdue");
  assert.equal(columnFor(t("2026-10-21"), today, cols), "2026-10-19");
  assert.equal(columnFor(t("2026-11-01"), today, cols), "2026-10-26");
  assert.equal(columnFor(t("2026-11-02"), today, cols), "later");
  assert.equal(columnFor(t(null), today, cols), "none");
  assert.equal(columnFor(t("2026-10-21", "done"), today, cols), null);
  assert.equal(columnFor(t("2026-10-21", "todo", true), today, cols), null);
});

test("grid groups by assignee", () => {
  const grid = buildWorkload(
    [
      { id: "1", assigneeId: "a", dueDate: "2026-10-22", category: "todo", isMilestone: false },
      { id: "2", assigneeId: "a", dueDate: "2026-10-23", category: "in_progress", isMilestone: false },
      { id: "3", assigneeId: null, dueDate: null, category: "todo", isMilestone: false },
    ],
    today,
    cols,
  );
  assert.deepEqual(grid.get("a")!.get("2026-10-19"), ["1", "2"]);
  assert.deepEqual(grid.get("")!.get("none"), ["3"]);
});
