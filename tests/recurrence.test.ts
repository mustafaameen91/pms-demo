import { test } from "node:test";
import assert from "node:assert/strict";
import { nextDate, nextOccurrence } from "../src/lib/recurrence";

test("next dates", () => {
  assert.equal(nextDate("2026-10-19", "daily"), "2026-10-20");
  assert.equal(nextDate("2026-12-29", "weekly"), "2027-01-05");
  assert.equal(nextDate("2027-01-31", "monthly"), "2027-02-28");
  assert.equal(nextDate("2028-02-29", "yearly"), "2029-02-28");
});

test("next occurrence keeps the task's length", () => {
  assert.deepEqual(nextOccurrence({ startDate: "2026-10-19", dueDate: "2026-10-21" }, "weekly", "2026-10-25"), {
    startDate: "2026-10-26",
    dueDate: "2026-10-28",
  });
  assert.deepEqual(nextOccurrence({ startDate: null, dueDate: null }, "monthly", "2026-10-19"), {
    startDate: null,
    dueDate: "2026-11-19",
  });
});
