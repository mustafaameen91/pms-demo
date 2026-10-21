import { test } from "node:test";
import assert from "node:assert/strict";
import { byScore, riskLevel, riskMatrix, riskScore } from "../src/lib/risks";

test("score is likelihood × impact and falls into low / medium / high bands", () => {
  assert.equal(riskScore(3, 4), 12);
  assert.equal(riskLevel(riskScore(1, 1)), "low");
  assert.equal(riskLevel(riskScore(2, 2)), "low");
  assert.equal(riskLevel(riskScore(1, 5)), "medium");
  assert.equal(riskLevel(riskScore(3, 4)), "medium");
  assert.equal(riskLevel(riskScore(3, 5)), "high");
  assert.equal(riskLevel(riskScore(5, 5)), "high");
});

test("highest score first, then higher impact, then older", () => {
  const risks = [
    { number: 1, likelihood: 2, impact: 3 },
    { number: 2, likelihood: 5, impact: 4 },
    { number: 3, likelihood: 3, impact: 2 },
    { number: 4, likelihood: 4, impact: 5 },
  ];
  assert.deepEqual([...risks].sort(byScore).map((r) => r.number), [4, 2, 1, 3]);
});

test("matrix counts risks per likelihood × impact cell", () => {
  const m = riskMatrix([
    { likelihood: 5, impact: 5 },
    { likelihood: 5, impact: 5 },
    { likelihood: 1, impact: 3 },
  ]);
  assert.equal(m[4][4], 2);
  assert.equal(m[0][2], 1);
  assert.equal(m.flat().reduce((a, b) => a + b, 0), 3);
});
