import { test } from "node:test";
import assert from "node:assert/strict";
import { detectProjectFile } from "../src/lib/file-types";

const b = (s: string) => Buffer.from(s, "latin1");

test("project files are recognised from their contents", () => {
  assert.deepEqual(detectProjectFile(b("%PDF-1.7 ..."), "plan.pdf"), { mime: "application/pdf", ext: "pdf" });
  assert.deepEqual(detectProjectFile(Buffer.from([0xff, 0xd8, 0xff, 0xe0]), "site.JPG"), { mime: "image/jpeg", ext: "jpg" });
  assert.deepEqual(detectProjectFile(b("AC1032\0\0\0"), "ground floor.dwg"), { mime: "image/vnd.dwg", ext: "dwg" });
  assert.deepEqual(detectProjectFile(b("PK\x03\x04rest"), "boq.xlsx"), { mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", ext: "xlsx" });
  assert.deepEqual(detectProjectFile(b("PK\x03\x04rest"), "photos.rar"), { mime: "application/zip", ext: "zip" });
  assert.deepEqual(detectProjectFile(b("  0\nSECTION\n  2\nHEADER"), "site.dxf"), { mime: "image/vnd.dxf", ext: "dxf" });
});

test("anything else is refused, whatever its name", () => {
  assert.equal(detectProjectFile(b("<html><script>alert(1)</script>"), "plan.pdf"), null);
  assert.equal(detectProjectFile(b("MZ\x90\x00"), "setup.exe"), null);
  assert.equal(detectProjectFile(b("  0\nSECTION"), "notes.txt"), null);
});

import { fileSize, guessCategory, nameWithoutExtension } from "../src/lib/files";

test("file helpers", () => {
  assert.equal(guessCategory("image/vnd.dwg", "x.dwg"), "drawing");
  assert.equal(guessCategory("image/jpeg", "IMG_2041.jpg"), "photo");
  assert.equal(guessCategory("application/pdf", "Building permit 2026.pdf"), "permit");
  assert.equal(guessCategory("application/pdf", "عقد المقاول.pdf"), "contract");
  assert.equal(guessCategory("application/pdf", "minutes.pdf"), "other");
  assert.equal(fileSize(512), "512 B");
  assert.equal(fileSize(2.4 * 1024 * 1024), "2.4 MB");
  assert.equal(nameWithoutExtension("Ground floor plan.pdf"), "Ground floor plan");
  assert.equal(nameWithoutExtension("README"), "README");
});
