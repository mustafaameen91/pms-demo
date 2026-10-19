import { test } from "node:test";
import assert from "node:assert/strict";
import { formatFieldValue, parseFieldValue, type FieldDef } from "../src/lib/custom-fields";

const f = (type: FieldDef["type"], options: FieldDef["options"] = null): FieldDef => ({ id: "f", name: "Field", type, options });

test("parsing per type", () => {
  assert.deepEqual(parseFieldValue(f("number"), "1,250.5"), { value: 1250.5 });
  assert.ok("error" in parseFieldValue(f("number"), "abc"));
  assert.deepEqual(parseFieldValue(f("date"), "2027-01-31"), { value: "2027-01-31" });
  assert.deepEqual(parseFieldValue(f("checkbox"), "true"), { value: true });
  assert.deepEqual(parseFieldValue(f("select", [{ id: "a", label: "A" }]), "a"), { value: "a" });
  assert.ok("error" in parseFieldValue(f("select", [{ id: "a", label: "A" }]), "zzz"));
  assert.ok("error" in parseFieldValue(f("url"), "javascript:alert(1)"));
  assert.deepEqual(parseFieldValue(f("url"), "https://example.com/x"), { value: "https://example.com/x" });
  assert.deepEqual(parseFieldValue(f("text"), ""), { value: null });
});

test("formatting", () => {
  assert.equal(formatFieldValue(f("checkbox"), false), "No");
  assert.equal(formatFieldValue(f("select", [{ id: "a", label: "Floor 2" }]), "a"), "Floor 2");
  assert.equal(formatFieldValue(f("text"), null), "");
});
