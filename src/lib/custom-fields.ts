/** Custom field rules (pure). Values are stored in tasks.custom_fields as { fieldId: value }. */
import { createT, type T } from "@/i18n/translate";

const EN = createT("en", {});

export const FIELD_TYPES = [
  { value: "text", label: "Text" },
  { value: "number", label: "Number" },
  { value: "date", label: "Date" },
  { value: "select", label: "Choice" },
  { value: "checkbox", label: "Yes / no" },
  { value: "url", label: "Link" },
] as const;

export type FieldType = (typeof FIELD_TYPES)[number]["value"];
export type FieldDef = { id: string; name: string; type: FieldType; options: { id: string; label: string }[] | null };

/** Normalises an input value for a field; returns { value } or { error }. null clears it. */
export function parseFieldValue(field: FieldDef, raw: unknown, t: T = EN): { value: string | number | boolean | null } | { error: string } {
  if (raw === null || raw === undefined || raw === "") return { value: null };
  switch (field.type) {
    case "text": {
      const v = String(raw).trim();
      return v.length > 500 ? { error: t("At most 500 characters") } : { value: v || null };
    }
    case "number": {
      const n = Number(String(raw).replace(/,/g, ""));
      return Number.isFinite(n) && Math.abs(n) < 1e15 ? { value: n } : { error: t("{name} must be a number", { name: field.name }) };
    }
    case "date":
      return /^\d{4}-\d{2}-\d{2}$/.test(String(raw)) ? { value: String(raw) } : { error: t("Choose a date") };
    case "checkbox":
      return { value: raw === true || raw === "true" };
    case "select":
      return (field.options ?? []).some((o) => o.id === raw) ? { value: String(raw) } : { error: t("Choose one of the options") };
    case "url": {
      try {
        const u = new URL(String(raw).trim());
        return u.protocol === "http:" || u.protocol === "https:" ? { value: u.toString() } : { error: t("Links must start with http(s)://") };
      } catch {
        return { error: t("Enter a full link, e.g. https://…") };
      }
    }
  }
}

/** Display text for a stored value, in the viewer's language (English by default). */
export function formatFieldValue(field: FieldDef, value: unknown, t: T = EN) {
  if (value === null || value === undefined || value === "") return "";
  if (field.type === "checkbox") return value ? t("Yes") : t("No");
  if (field.type === "select") return field.options?.find((o) => o.id === value)?.label ?? "";
  if (field.type === "number") return t === EN ? Number(value).toLocaleString() : Number(value).toLocaleString(t.intl);
  return String(value);
}
