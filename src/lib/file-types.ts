/** What uploaded files really are, from their first bytes (pure; shared by server and tests). */
import path from "node:path";

export const TYPES = {
  "application/pdf": { ext: "pdf", magic: (b: Buffer) => b.subarray(0, 5).toString("latin1") === "%PDF-" },
  "image/jpeg": { ext: "jpg", magic: (b: Buffer) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  "image/png": {
    ext: "png",
    magic: (b: Buffer) => b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
  },
  "image/webp": {
    ext: "webp",
    magic: (b: Buffer) => b.subarray(0, 4).toString("latin1") === "RIFF" && b.subarray(8, 12).toString("latin1") === "WEBP",
  },
} as const;

export type ReceiptType = keyof typeof TYPES;

export const ZIP_TYPES: Record<string, string> = {
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  zip: "application/zip",
};

/** Opened in the browser; everything else is always downloaded. */
export const INLINE_TYPES = new Set(["application/pdf", "image/jpeg", "image/png", "image/webp"]);

/** What a project file really is, from its first bytes (and its extension for zip-based formats). */
export function detectProjectFile(bytes: Buffer, name: string): { mime: string; ext: string } | null {
  const ext = path.extname(name).slice(1).toLowerCase();
  for (const type of Object.keys(TYPES) as ReceiptType[]) {
    if (TYPES[type].magic(bytes)) return { mime: type, ext: TYPES[type].ext };
  }
  const head = bytes.subarray(0, 6).toString("latin1");
  // AutoCAD drawing: "AC10xx" version marker.
  if (/^AC10\d\d$/.test(head)) return { mime: "image/vnd.dwg", ext: "dwg" };
  // Word / Excel / PowerPoint / zip are all zip archives.
  if (bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 0x03 && bytes[3] === 0x04) {
    return ZIP_TYPES[ext] ? { mime: ZIP_TYPES[ext], ext } : { mime: ZIP_TYPES.zip, ext: "zip" };
  }
  // DXF drawings are text files with a SECTION header.
  if (ext === "dxf" && bytes.subarray(0, 2048).toString("latin1").includes("SECTION")) return { mime: "image/vnd.dxf", ext: "dxf" };
  return null;
}

