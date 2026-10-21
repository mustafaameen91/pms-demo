/**
 * A company's adjustments to a built-in document type (pure): applied on top of
 * the built-in definition to give the form that company actually uses.
 */
import { z } from "zod";
import type { DocTypeDef, FieldDef } from "./types";

const text = (max: number) => z.string().trim().max(max).optional().transform((v) => v || undefined);
const pair = (max: number) => z.object({ en: text(max), ar: text(max) }).optional();

export const EXTRA_KINDS = ["text", "textarea", "date", "money"] as const;
export const MAX_EXTRA_FIELDS = 12;

export const settingsSchema = z.object({
  title: pair(80),
  prefix: z
    .string()
    .trim()
    .toUpperCase()
    .optional()
    .transform((v) => v || undefined)
    .refine((v) => v === undefined || /^[A-Z]{1,5}$/.test(v), "Use 1–5 letters, e.g. PO"),
  labels: z.record(z.string(), z.object({ en: text(80), ar: text(80) })).optional(),
  hidden: z.array(z.string()).max(40).optional(),
  defaults: z.record(z.string(), z.object({ en: text(4000), ar: text(4000) })).optional(),
  extra: z
    .array(
      z.object({
        key: z.string().regex(/^x_[a-z0-9]{4,12}$/),
        label: z.object({ en: z.string().trim().max(80), ar: z.string().trim().max(80) }).refine((l) => l.en || l.ar, "Give the field a name"),
        kind: z.enum(EXTRA_KINDS),
        half: z.boolean().optional(),
      }),
    )
    .max(MAX_EXTRA_FIELDS, `At most ${MAX_EXTRA_FIELDS} extra fields`)
    .optional(),
  signatures: z.array(z.object({ en: text(60), ar: text(60) })).max(6).optional(),
});
export type DocTypeSettings = z.output<typeof settingsSchema>;
export type DocTypeSettingsInput = z.input<typeof settingsSchema>;

/** Fields the document can't work without: required ones and the amount spelled out in words. */
export const isLockedField = (def: DocTypeDef, key: string) =>
  def.fields.some((f) => f.key === key && (f.required || def.words === key));

/** The form a company actually uses: the built-in type with its adjustments applied. */
export function applySettings(def: DocTypeDef, s: DocTypeSettings | null | undefined): DocTypeDef {
  if (!s) return def;
  const merge = (base: { en: string; ar: string }, over?: { en?: string; ar?: string }) => ({ en: over?.en || base.en, ar: over?.ar || base.ar });
  const hidden = new Set((s.hidden ?? []).filter((k) => !isLockedField(def, k)));
  const fields: FieldDef[] = def.fields
    .filter((f) => !hidden.has(f.key))
    .map((f) => {
      const d = s.defaults?.[f.key];
      return {
        ...f,
        label: merge(f.label, s.labels?.[f.key]),
        ...((f.kind === "text" || f.kind === "textarea") && (d?.en || d?.ar)
          ? { defaultText: merge(f.defaultText ?? { en: "", ar: "" }, d) }
          : {}),
      };
    });
  for (const x of s.extra ?? []) {
    fields.push({ key: x.key, label: { en: x.label.en || x.label.ar, ar: x.label.ar || x.label.en }, kind: x.kind, half: x.half && x.kind !== "textarea" });
  }
  return {
    ...def,
    title: merge(def.title, s.title),
    prefix: s.prefix ?? def.prefix,
    fields,
    signatures: def.signatures.map((sig, i) => merge(sig, s.signatures?.[i])),
  };
}

/** A fresh key for a company's own field. */
export const newExtraKey = () => `x_${Math.random().toString(36).slice(2, 10).padEnd(6, "0")}`;

/**
 * The form a saved document was made with (its layout copy), or the built-in
 * type for documents made before forms could be customised.
 */
export function layoutDef(type: string, layout: unknown, builtIn: (key: string) => DocTypeDef | undefined): DocTypeDef | undefined {
  const l = layout as Partial<DocTypeDef> | null;
  if (l && Array.isArray(l.fields) && l.title && l.prefix && Array.isArray(l.signatures)) return { ...builtIn(type)!, ...l } as DocTypeDef;
  return builtIn(type);
}
