/**
 * Lists English texts passed to t(...) / t.plural(...) that have no Arabic
 * translation, and Arabic plural entries that are plain strings.
 * Usage: pnpm i18n:check            (exit 1 if anything is missing)
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { ar } from "../src/i18n/ar";

const files: string[] = [];
(function walk(dir: string) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p);
    else if (/\.(ts|tsx)$/.test(name) && !p.includes("src/i18n/")) files.push(p);
  }
})("src");

const STR = String.raw`"((?:[^"\\]|\\.)*)"`;
const single = new RegExp(String.raw`\b(?:t|tr)\(\s*${STR}`, "g");
const plural = new RegExp(String.raw`\b(?:t|tr)\.plural\(\s*[^,]+,\s*${STR}\s*,\s*${STR}`, "g");
const unescape = (s: string) => JSON.parse(`"${s}"`) as string;

const missing = new Map<string, string>();
const wrongPlural = new Map<string, string>();
for (const file of files) {
  const src = readFileSync(file, "utf8");
  for (const m of src.matchAll(single)) {
    const key = unescape(m[1]);
    if (!(key in ar)) missing.set(key, file);
  }
  for (const m of src.matchAll(plural)) {
    const key = unescape(m[2]);
    if (!(key in ar)) missing.set(key, file);
    else if (typeof ar[key] === "string") wrongPlural.set(key, file);
  }
}

for (const [key, file] of missing) console.log(`missing  ${JSON.stringify(key)}  (${file})`);
for (const [key, file] of wrongPlural) console.log(`plural   ${JSON.stringify(key)} should list Arabic plural forms  (${file})`);
console.log(`${missing.size} missing, ${wrongPlural.size} plural problems`);
process.exitCode = missing.size || wrongPlural.size ? 1 : 0;
