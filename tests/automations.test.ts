import { test } from "node:test";
import assert from "node:assert/strict";
import { brokenReason, describeRule, matchesTrigger, ruleSchema, type Action, type Trigger } from "../src/lib/automations";

const names = {
  statuses: { done: "Done", review: "In review" },
  people: { u1: "Sara" },
  money: (a: string) => `$${Number(a)}`,
};
const notifyManager: Action = { type: "notify", to: "manager", userId: null, message: null, email: false };

test("status trigger matches a specific column or any column", () => {
  const ev = { type: "task.status_changed", projectId: "p", taskId: "t", statusId: "done" } as const;
  assert.equal(matchesTrigger({ type: "task.status_changed", statusId: "done" }, ev), true);
  assert.equal(matchesTrigger({ type: "task.status_changed", statusId: "review" }, ev), false);
  assert.equal(matchesTrigger({ type: "task.status_changed", statusId: null }, ev), true);
  assert.equal(matchesTrigger({ type: "task.created" }, ev), false);
});

test("expense trigger respects the minimum amount (strictly above)", () => {
  const ev = (amount: string) => ({ type: "expense.added", projectId: "p", expenseId: "e", amount, description: "x" }) as const;
  const t: Trigger = { type: "expense.added", minAmount: "500" };
  assert.equal(matchesTrigger(t, ev("500.00")), false);
  assert.equal(matchesTrigger(t, ev("500.01")), true);
  assert.equal(matchesTrigger({ type: "expense.added", minAmount: null }, ev("1")), true);
});

test("rules are described in plain words", () => {
  assert.equal(
    describeRule({ trigger: { type: "task.status_changed", statusId: "done" }, action: { ...notifyManager, email: true } }, names),
    "When a task moves to “Done”, notify the project manager (in app + email).",
  );
  assert.equal(
    describeRule({ trigger: { type: "expense.added", minAmount: "1000" }, action: { type: "notify", to: "user", userId: "u1", message: null, email: false } }, names),
    "When an expense above $1000 is added, notify Sara.",
  );
  assert.equal(
    describeRule({ trigger: { type: "task.late" }, action: { type: "set_priority", priority: "urgent" } }, names),
    "When a task becomes late, set priority to Urgent.",
  );
});

test("validation blocks rules that make no sense", () => {
  const bad = (trigger: Trigger, action: Action) => !ruleSchema.safeParse({ trigger, action }).success;
  assert.ok(bad({ type: "expense.added", minAmount: null }, { type: "assign", userId: "u1" }));
  assert.ok(bad({ type: "expense.added", minAmount: null }, { ...notifyManager, to: "assignee" }));
  assert.ok(bad({ type: "task.created" }, { ...notifyManager, to: "user", userId: null }));
  assert.ok(bad({ type: "task.status_changed", statusId: null }, { type: "set_status", statusId: "done" }));
  assert.ok(bad({ type: "task.status_changed", statusId: "done" }, { type: "set_status", statusId: "done" }));
  assert.ok(bad({ type: "expense.added", minAmount: "abc" }, notifyManager));
  assert.ok(!bad({ type: "task.status_changed", statusId: "review" }, { type: "set_status", statusId: "done" }));
  assert.ok(!bad({ type: "expense.added", minAmount: "99.50" }, notifyManager));
});

test("rules pointing at deleted columns or former members are flagged", () => {
  assert.equal(brokenReason({ trigger: { type: "task.status_changed", statusId: "gone" }, action: notifyManager }, names), "Its column was deleted.");
  assert.equal(brokenReason({ trigger: { type: "task.created" }, action: { type: "assign", userId: "u9" } }, names), "The person it names is no longer a member.");
  assert.equal(brokenReason({ trigger: { type: "task.created" }, action: { type: "assign", userId: "u1" } }, names), null);
});
