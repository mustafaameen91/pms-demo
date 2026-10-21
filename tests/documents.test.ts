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

import { applySettings, isLockedField, settingsSchema } from "../src/lib/documents/customize";

test("a company's adjustments are applied on top of the built-in form", () => {
  const po = docType("purchase_order")!;
  const s = settingsSchema.parse({
    title: { ar: "طلب شراء مواد" },
    prefix: "lpo",
    labels: { supplier: { en: "Vendor" } },
    hidden: ["supplierContact", "supplier"], // supplier is required: can't be hidden
    defaults: { paymentTerms: { en: "Cash on delivery." } },
    extra: [{ key: "x_site01", label: { en: "Site engineer", ar: "مهندس الموقع" }, kind: "text", half: true }],
    signatures: [{ en: "Storekeeper" }],
  });
  const def = applySettings(po, s);
  assert.equal(def.title.en, "Purchase order");
  assert.equal(def.title.ar, "طلب شراء مواد");
  assert.equal(def.prefix, "LPO");
  const keys = def.fields.map((f) => f.key);
  assert.ok(!keys.includes("supplierContact"));
  assert.ok(keys.includes("supplier"));
  assert.equal(def.fields.find((f) => f.key === "supplier")!.label.en, "Vendor");
  assert.equal(def.fields.find((f) => f.key === "supplier")!.label.ar, "المورّد");
  assert.equal(def.fields.find((f) => f.key === "paymentTerms")!.defaultText!.en, "Cash on delivery.");
  assert.equal(keys.at(-1), "x_site01");
  assert.deepEqual(def.signatures[0], { en: "Storekeeper", ar: "أعدّه" });
  // The built-in definition is untouched.
  assert.equal(po.prefix, "PO");
  assert.ok(po.fields.some((f) => f.key === "supplierContact"));
});

test("locked fields and bad settings", () => {
  const contract = docType("contract")!;
  assert.ok(isLockedField(contract, "value")); // spelled out in words
  assert.ok(isLockedField(contract, "secondParty")); // required
  assert.ok(!isLockedField(contract, "terms"));
  assert.ok(!settingsSchema.safeParse({ prefix: "PO-1" }).success);
  assert.ok(!settingsSchema.safeParse({ extra: [{ key: "bad key", label: { en: "x", ar: "" }, kind: "text" }] }).success);
  assert.ok(!settingsSchema.safeParse({ extra: [{ key: "x_abcd", label: { en: "", ar: "" }, kind: "text" }] }).success);
});
