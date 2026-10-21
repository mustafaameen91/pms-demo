import { test } from "node:test";
import assert from "node:assert/strict";
import { amountInWords, numberToArabic, numberToEnglish } from "../src/lib/documents/words";

test("English numbers", () => {
  assert.equal(numberToEnglish(0), "zero");
  assert.equal(numberToEnglish(15), "fifteen");
  assert.equal(numberToEnglish(42), "forty-two");
  assert.equal(numberToEnglish(305), "three hundred five");
  assert.equal(numberToEnglish(1500000), "one million five hundred thousand");
  assert.equal(numberToEnglish(2017), "two thousand seventeen");
});

test("Arabic numbers in the usual commercial form", () => {
  assert.equal(numberToArabic(1), "واحد");
  assert.equal(numberToArabic(12), "اثنا عشر");
  assert.equal(numberToArabic(25), "خمسة وعشرون");
  assert.equal(numberToArabic(100), "مائة");
  assert.equal(numberToArabic(250), "مائتان وخمسون");
  assert.equal(numberToArabic(1000), "ألف");
  assert.equal(numberToArabic(2000), "ألفان");
  assert.equal(numberToArabic(3000), "ثلاثة آلاف");
  assert.equal(numberToArabic(11000), "أحد عشر ألفًا");
  assert.equal(numberToArabic(150000), "مائة وخمسون ألفًا");
  assert.equal(numberToArabic(200000), "مائتا ألف");
  assert.equal(numberToArabic(103000), "مائة وثلاثة آلاف");
  assert.equal(numberToArabic(101000), "مائة وواحد ألف");
  assert.equal(numberToArabic(1500000), "مليون وخمسمائة ألف");
  assert.equal(numberToArabic(3250000), "ثلاثة ملايين ومائتان وخمسون ألفًا");
});

test("money in words", () => {
  assert.equal(amountInWords(1500000, "IQD", "en"), "One million five hundred thousand Iraqi dinars only");
  assert.equal(amountInWords("1500000.00", "IQD", "ar"), "فقط مليون وخمسمائة ألف دينار عراقي لا غير");
  assert.equal(amountInWords(1, "USD", "en"), "One US dollar only");
  assert.equal(amountInWords(250.5, "USD", "en"), "Two hundred fifty US dollars and fifty cents only");
  assert.equal(amountInWords(250.5, "USD", "ar"), "فقط مائتان وخمسون دولار أمريكي وخمسون سنت لا غير");
});
