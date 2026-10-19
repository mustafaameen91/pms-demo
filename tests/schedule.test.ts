import { test } from "node:test";
import assert from "node:assert/strict";
import { daysBetween, lateTasks, upcomingTasks } from "../src/lib/schedule";

const t = (dueDate: string | null, category = "todo") => ({ dueDate, category });

test("late = open tasks past their end date", () => {
  const late = lateTasks([t("2026-10-01"), t("2026-10-01", "done"), t("2026-10-17"), t(null)], "2026-10-17");
  assert.equal(late.length, 1);
});

test("upcoming = open tasks due today .. +14 days, soonest first", () => {
  const up = upcomingTasks([t("2026-10-31"), t("2026-10-17"), t("2026-11-01"), t("2026-10-20", "canceled")], "2026-10-17");
  assert.deepEqual(up.map((x) => x.dueDate), ["2026-10-17", "2026-10-31"]);
});

test("daysBetween", () => {
  assert.equal(daysBetween("2026-10-17", "2026-10-20"), 3);
  assert.equal(daysBetween("2026-10-20", "2026-10-17"), -3);
  assert.equal(daysBetween("2026-12-31", "2027-01-01"), 1);
});

import { dueGroup } from "../src/lib/my-tasks-groups";

test("my-tasks grouping", () => {
  const today = "2026-10-19";
  assert.equal(dueGroup({ dueDate: "2026-10-18", category: "todo" }, today), "overdue");
  assert.equal(dueGroup({ dueDate: "2026-10-19", category: "in_progress" }, today), "today");
  assert.equal(dueGroup({ dueDate: "2026-10-26", category: "todo" }, today), "week");
  assert.equal(dueGroup({ dueDate: "2026-10-27", category: "todo" }, today), "later");
  assert.equal(dueGroup({ dueDate: null, category: "todo" }, today), "none");
  assert.equal(dueGroup({ dueDate: "2026-10-01", category: "done" }, today), "done");
});
