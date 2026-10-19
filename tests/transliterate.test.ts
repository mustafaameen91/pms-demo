import { test } from "node:test";
import assert from "node:assert/strict";
import { toLatin } from "../src/lib/transliterate";

test("Arabic names get Latin letters for keys and web addresses", () => {
  assert.equal(toLatin("محطة الضخ"), "mhth aldkh");
  assert.equal(toLatin("شركة البناء ٢٠٢٦"), "shrkh albna 2026");
  assert.equal(toLatin("Pump Station"), "Pump Station");
  assert.equal(toLatin("مُحَمَّد"), "mhmd");
});
