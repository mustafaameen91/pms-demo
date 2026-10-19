import { test } from "node:test";
import assert from "node:assert/strict";
import { computeBudget } from "../src/lib/budget";

const usage = (id: string, usedQty: number, unitCost: number, taskId: string | null = null, plannedQty = 0) =>
  ({ id, taskId, usedQty: String(usedQty), plannedQty: String(plannedQty), unitCost: String(unitCost) });
const expense = (amount: number, taskId: string | null = null, projectResourceId: string | null = null) =>
  ({ amount: String(amount), taskId, projectResourceId });

test("actual = used resource costs + unlinked expenses", () => {
  const b = computeBudget("10000", [usage("u1", 5, 40), usage("u2", 100, 9)], [expense(300), expense(150.5)]);
  assert.equal(b.resourceCost, 1100); // 200 + 900
  assert.equal(b.otherExpenses, 450.5);
  assert.equal(b.actual, 1550.5);
  assert.equal(b.remaining, 8449.5);
  assert.equal(b.usedPct, 15.5);
  assert.equal(b.overBudget, false);
});

test("payments linked to a resource are not counted twice", () => {
  const b = computeBudget("1000", [usage("u1", 10, 40)], [expense(250, null, "u1")]);
  assert.equal(b.actual, 400); // only the usage
  assert.equal(b.paidToResources, 250);
  assert.equal(b.owedToResources, 150);
  assert.deepEqual(b.resources[0], { usageId: "u1", usedCost: 400, paid: 250, owed: 150 });
});

test("overpaying a resource never makes owed negative", () => {
  const b = computeBudget(null, [usage("u1", 1, 100)], [expense(150, null, "u1")]);
  assert.equal(b.owedToResources, 0);
  assert.equal(b.remaining, null);
  assert.equal(b.usedPct, null);
});

test("over budget", () => {
  const b = computeBudget("500", [usage("u1", 10, 40)], [expense(200)]);
  assert.equal(b.actual, 600);
  assert.equal(b.overBudget, true);
  assert.equal(b.remaining, -100);
});

test("per-task budget vs actual", () => {
  const b = computeBudget(
    "10000",
    [usage("u1", 10, 40, "t1"), usage("u2", 1, 1000, null)],
    [expense(100, "t1"), expense(999, "t1", "u1"), expense(50, "t2")],
    [{ id: "t1", budget: "450" }, { id: "t2", budget: null }],
  );
  const [t1, t2] = b.tasks;
  assert.equal(t1.actual, 500); // 400 resources + 100 expense (linked payment excluded)
  assert.equal(t1.overBudget, true);
  assert.equal(t1.remaining, -50);
  assert.equal(t2.actual, 50);
  assert.equal(t2.overBudget, false);
  assert.equal(t2.remaining, null);
});

test("planned resource cost", () => {
  const b = computeBudget("0", [usage("u1", 0, 9, null, 500)], []);
  assert.equal(b.plannedResourceCost, 4500);
  assert.equal(b.usedPct, null); // zero budget -> no percentage
});

test("only approved expenses count; pending total is reported", () => {
  const b = computeBudget(
    "1000",
    [usage("u1", 5, 40)],
    [
      { amount: "100", taskId: null, projectResourceId: null, approvalStatus: "approved" },
      { amount: "300", taskId: null, projectResourceId: null, approvalStatus: "pending" },
      { amount: "50", taskId: null, projectResourceId: null, approvalStatus: "rejected" },
      { amount: "200", taskId: null, projectResourceId: "u1", approvalStatus: "pending" },
    ],
  );
  assert.equal(b.actual, 300); // 200 resources + 100 approved
  assert.equal(b.paidToResources, 0); // pending payment not counted
  assert.equal(b.pendingApproval, 500);
});
