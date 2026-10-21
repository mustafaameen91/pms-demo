import { test } from "node:test";
import assert from "node:assert/strict";
import { contrastRatio, inLanguage, isHexColor, readableOnWhite, textOn, type CompanyProfile } from "../src/lib/branding";

test("text on the brand colour is whichever of white / near-black reads better", () => {
  assert.equal(textOn("#0F172A"), "#FFFFFF");
  assert.equal(textOn("#B91C1C"), "#FFFFFF");
  assert.equal(textOn("#FDE047"), "#111827");
  assert.equal(textOn("#FFFFFF"), "#111827");
});

test("a light brand colour is darkened until it's readable on white", () => {
  const yellow = readableOnWhite("#FDE047");
  assert.ok(contrastRatio(yellow, "#FFFFFF") >= 4.5, yellow);
  // Already dark enough: unchanged.
  assert.equal(readableOnWhite("#1D4ED8"), "#1D4ED8");
});

test("only #RRGGBB colours are accepted", () => {
  assert.ok(isHexColor("#0d9488"));
  assert.ok(!isHexColor("0D9488"));
  assert.ok(!isHexColor("#FFF"));
  assert.ok(!isHexColor("red"));
});

test("each language falls back to the other when a field is empty", () => {
  const p = { nameEn: "Al-Noor Construction", nameAr: "", addressEn: null, addressAr: "بغداد، المنصور", footerEn: "Thank you", footerAr: null } as CompanyProfile;
  assert.deepEqual(inLanguage(p, "ar"), { name: "Al-Noor Construction", address: "بغداد، المنصور", footer: "Thank you" });
  assert.deepEqual(inLanguage(p, "en"), { name: "Al-Noor Construction", address: "بغداد، المنصور", footer: "Thank you" });
});
