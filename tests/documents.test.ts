import { test } from "node:test";
import assert from "node:assert/strict";
import { DOC_TYPES, DOC_TYPE_KEYS, docNumber, docTotals, docType } from "../src/lib/documents/types";

test("every type is complete in both languages", () => {
  assert.equal(DOC_TYPES.length, DOC_TYPE_KEYS.length);
  for (const d of DOC_TYPES) {
    assert.ok(d.title.en && d.title.ar, d.key);
    assert.ok(d.signatures.length > 0 && d.stampOn < d.signatures.length, d.key);
    for (const field of d.fields) assert.ok(field.label.en && field.label.ar, `${d.key}.${field.key}`);
    if (d.words && d.words !== "total") assert.ok(d.fields.some((x) => x.key === d.words && x.kind === "money"), d.key);
    if (d.words === "total") assert.ok(d.items?.prices, d.key);
  }
  assert.equal(new Set(DOC_TYPES.map((d) => d.prefix)).size, DOC_TYPES.length);
});

test("numbers and totals", () => {
  assert.equal(docNumber(docType("purchase_order")!.prefix, 7), "PO-0007");
  const t = docTotals(
    [
      { description: "Cement", unit: "bag", quantity: "200", unitPrice: "8500" },
      { description: "Steel", unit: "ton", quantity: "1.5", unitPrice: "1100000.10" },
    ],
    "15",
  );
  assert.deepEqual(t.lines, [1700000, 1650000.15]);
  assert.equal(t.subtotal, 3350000.15);
  assert.equal(t.tax, 502500.02);
  assert.equal(t.total, 3852500.17);
  assert.deepEqual(docTotals([], null), { lines: [], subtotal: 0, tax: 0, total: 0 });
});
