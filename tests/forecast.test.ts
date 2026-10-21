import { test } from "node:test";
import assert from "node:assert/strict";
import { computeForecast } from "../src/lib/forecast";

test("spending faster than progress forecasts an overrun", () => {
  // 40% of a 100,000 budget spent for 30% of the work → 133,333 at the end.
  const f = computeForecast({ budget: 100000, spent: 40000, donePct: 30, plannedPct: 40 });
  assert.ok(f.ready);
  assert.equal(f.final, 133333.33);
  assert.equal(f.overBy, 33333.33);
  assert.equal(f.overPct, 33.3);
  assert.equal(f.spentPct, 40);
  assert.equal(f.costIndex, 0.75);
  assert.equal(f.scheduleIndex, 0.75);
  assert.equal(f.health, "bad");
  assert.equal(f.toGo, 93333.33);
});

test("spending in step with progress is on budget; slower is under", () => {
  const even = computeForecast({ budget: 50000, spent: 25000, donePct: 50, plannedPct: null });
  assert.ok(even.ready);
  assert.equal(even.final, 50000);
  assert.equal(even.overBy, 0);
  assert.equal(even.health, "good");
  assert.equal(even.scheduleIndex, null);
  const under = computeForecast({ budget: 50000, spent: 20000, donePct: 50, plannedPct: 50 });
  assert.ok(under.ready);
  assert.equal(under.overBy, -10000);
  assert.equal(under.health, "good");
});

test("a little over is worth watching, a lot over is bad", () => {
  const watch = computeForecast({ budget: 100, spent: 53, donePct: 50, plannedPct: null });
  assert.ok(watch.ready && watch.health === "watch");
  const bad = computeForecast({ budget: 100, spent: 56, donePct: 50, plannedPct: null });
  assert.ok(bad.ready && bad.health === "bad");
});

test("no forecast without progress or without spending", () => {
  assert.deepEqual(computeForecast({ budget: 100, spent: 10, donePct: 0, plannedPct: 20 }), { ready: false, reason: "no-progress" });
  assert.deepEqual(computeForecast({ budget: 100, spent: 10, donePct: null, plannedPct: null }), { ready: false, reason: "no-progress" });
  assert.deepEqual(computeForecast({ budget: 100, spent: 0, donePct: 40, plannedPct: 20 }), { ready: false, reason: "no-spending" });
});

test("early estimates are flagged; finished projects cost what was spent", () => {
  const early = computeForecast({ budget: 1000, spent: 100, donePct: 5, plannedPct: null });
  assert.ok(early.ready && early.early && early.final === 2000);
  const done = computeForecast({ budget: 1000, spent: 1100, donePct: 100, plannedPct: 100 });
  assert.ok(done.ready && done.done && done.final === 1100 && done.toGo === 0 && done.overBy === 100);
});

test("without a budget there's still an expected total, but no over/under", () => {
  const f = computeForecast({ budget: null, spent: 3000, donePct: 60, plannedPct: null });
  assert.ok(f.ready);
  assert.equal(f.final, 5000);
  assert.equal(f.overBy, null);
  assert.equal(f.health, null);
});
