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
