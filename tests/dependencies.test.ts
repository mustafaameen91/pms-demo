import { test } from "node:test";
import assert from "node:assert/strict";
import { openPredecessors, startsTooEarly, wouldCreateCycle } from "../src/lib/dependencies";

const edges = [
  { taskId: "B", dependsOnId: "A" },
  { taskId: "C", dependsOnId: "B" },
];

test("self and direct/indirect loops are detected", () => {
  assert.equal(wouldCreateCycle(edges, "A", "A"), true);
  assert.equal(wouldCreateCycle(edges, "A", "B"), true); // B already waits on A
  assert.equal(wouldCreateCycle(edges, "A", "C"), true); // C → B → A
  assert.equal(wouldCreateCycle(edges, "C", "A"), false); // just a shortcut, no loop
  assert.equal(wouldCreateCycle(edges, "D", "C"), false);
});

test("open predecessors and date conflicts", () => {
  assert.equal(openPredecessors([{ category: "done" }, { category: "todo" }, { category: "canceled" }]).length, 1);
  assert.equal(startsTooEarly("2027-01-10", "2027-01-10"), true);
  assert.equal(startsTooEarly("2027-01-11", "2027-01-10"), false);
  assert.equal(startsTooEarly(null, "2027-01-10"), false);
});
