/** Project file library rules (pure). */

export const FILE_CATEGORIES = [
  { value: "drawing", label: "Drawings" },
  { value: "contract", label: "Contracts" },
  { value: "permit", label: "Permits" },
  { value: "photo", label: "Photos" },
  { value: "report", label: "Reports" },
  { value: "other", label: "Other" },
] as const;
export type FileCategory = (typeof FILE_CATEGORIES)[number]["value"];
export const isFileCategory = (v: unknown): v is FileCategory => FILE_CATEGORIES.some((c) => c.value === v);

/** A sensible category from the file itself (the uploader can change it). */
export function guessCategory(mime: string, name: string): FileCategory {
  if (mime === "image/vnd.dwg" || mime === "image/vnd.dxf") return "drawing";
  if (mime.startsWith("image/")) return "photo";
  if (/permit|licen[cs]e|رخصة|ترخيص/i.test(name)) return "permit";
  if (/contract|agreement|عقد/i.test(name)) return "contract";
  if (/drawing|plan|layout|مخطط/i.test(name)) return "drawing";
  return "other";
}

/** "2.4 MB" */
export function fileSize(bytes: number, locale = "en-US") {
  const units = ["B", "KB", "MB", "GB"];
  let v = bytes;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v.toLocaleString(locale, { maximumFractionDigits: i === 0 ? 0 : 1 })} ${units[i]}`;
}

/** "Ground floor plan.pdf" → "Ground floor plan" */
export const nameWithoutExtension = (name: string) => name.replace(/\.[^./\\]{1,8}$/, "") || name;
