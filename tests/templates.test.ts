import { test } from "node:test";
import assert from "node:assert/strict";
import { BUILTIN_TEMPLATES, addDays, describeLength, templateDataSchema, templateLengthDays } from "../src/lib/templates";

test("every built-in template is valid and its weights add up to 100%", () => {
  for (const tpl of BUILTIN_TEMPLATES) {
    assert.ok(templateDataSchema.safeParse(tpl.data).success, `${tpl.id} invalid`);
    const total = tpl.data.tasks.reduce((s, t) => s + (t.weight ?? 0), 0);
    assert.equal(total, 100, `${tpl.id} weights = ${total}`);
    assert.ok(tpl.data.statuses.some((s) => s.category === "done"), `${tpl.id} has no done status`);
    assert.ok(tpl.data.statuses.some((s) => s.category === "todo" || s.category === "backlog"), `${tpl.id} has no start status`);
  }
});

test("template ids are unique", () => {
  assert.equal(new Set(BUILTIN_TEMPLATES.map((t) => t.id)).size, BUILTIN_TEMPLATES.length);
});

test("length and dates", () => {
  const construction = BUILTIN_TEMPLATES.find((t) => t.id === "construction")!;
  assert.equal(templateLengthDays(construction.data), 195);
  assert.equal(describeLength(195), "≈ 7 months");
  assert.equal(describeLength(10), "10 days");
  assert.equal(addDays("2026-12-30", 3), "2027-01-02");
});

test("built-in dependencies form a valid chain with no date conflicts", () => {
  const c = BUILTIN_TEMPLATES.find((t) => t.id === "construction")!.data.tasks;
  // Site preparation (day 40) waits on Permits (ends day 40); Handover waits on Inspection.
  assert.deepEqual(c[2].dependsOn, [1]);
  assert.deepEqual(c[8].dependsOn, [7]);
  assert.equal(c[0].dependsOn, undefined);
  for (const tpl of BUILTIN_TEMPLATES) {
    for (const [i, task] of tpl.data.tasks.entries()) {
      for (const d of task.dependsOn ?? []) {
        assert.ok(d < i, `${tpl.id}: forward dependency`);
        const pred = tpl.data.tasks[d];
        assert.ok(pred.startOffset! + pred.duration! <= task.startOffset!, `${tpl.id}: ${task.title} starts before ${pred.title} ends`);
      }
    }
  }
});
