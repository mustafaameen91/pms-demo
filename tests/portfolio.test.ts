import { test } from "node:test";
import assert from "node:assert/strict";
import { computeForecast } from "../src/lib/forecast";
import { summarizePortfolio, type HealthRow } from "../src/lib/portfolio";

const row = (o: Partial<HealthRow> & { budget: number | null; spent: number; actual: number | null }): HealthRow => ({
  currency: "IQD",
  finished: false,
  planned: null,
  behind: false,
  overBudget: false,
  headingOver: false,
  ...o,
  forecast: computeForecast({ budget: o.budget, spent: o.spent, donePct: o.actual, plannedPct: o.planned ?? null }),
});

test("portfolio totals: per currency, forecast or budget, equal-weight progress", () => {
  const s = summarizePortfolio([
    // 40,000 spent for 30% → expected 133,333.33
    row({ budget: 100000, spent: 40000, actual: 30, planned: 40, behind: true, headingOver: true }),
    // no spending yet → counted at its budget
    row({ budget: 50000, spent: 0, actual: 10 }),
    row({ currency: "USD", budget: 20000, spent: 5000, actual: 50, finished: true }),
  ]);
  assert.equal(s.projects, 3);
  assert.equal(s.open, 2);
  assert.equal(s.finished, 1);
  assert.equal(s.avgActual, 30);
  assert.equal(s.avgPlanned, 40);
  assert.equal(s.behind, 1);
  assert.equal(s.headingOver, 1);
  const iqd = s.money.find((m) => m.currency === "IQD")!;
  assert.deepEqual(iqd, { currency: "IQD", projects: 2, budget: 150000, spent: 40000, expected: 183333.33, overBy: 33333.33, withoutBudget: 0 });
  const usd = s.money.find((m) => m.currency === "USD")!;
  assert.equal(usd.expected, 10000);
  assert.equal(usd.overBy, -10000);
});

test("no over/under when a project has no budget; empty portfolio", () => {
  const s = summarizePortfolio([row({ budget: 100000, spent: 50000, actual: 50 }), row({ budget: null, spent: 3000, actual: null })]);
  assert.equal(s.money[0].withoutBudget, 1);
  assert.equal(s.money[0].overBy, null);
  assert.equal(s.money[0].expected, 103000);
  assert.equal(s.avgActual, 50);
  const empty = summarizePortfolio([]);
  assert.equal(empty.avgActual, null);
  assert.deepEqual(empty.money, []);
});
