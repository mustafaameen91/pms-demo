"use client";

import { useState, useTransition } from "react";
import { FileText, Loader2, Lock, Plus, RotateCcw, Save, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { resetDocType, saveDocTypeSettings } from "@/lib/actions/document-settings";
import { EXTRA_KINDS, MAX_EXTRA_FIELDS, applySettings, isLockedField, newExtraKey, type DocTypeSettings } from "@/lib/documents/customize";
import type { DocTypeDef } from "@/lib/documents/types";
import type { CompanyProfile, DocumentLanguage } from "@/lib/branding";
import { cn } from "@/lib/utils";
import { useT } from "@/i18n/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { FieldError } from "@/components/projects/project-fields";
import { nativeSelectClass } from "@/components/resources/resource-fields";
import { Paper } from "./paper";
import { DocumentBody } from "./document-body";
import { SelectBox } from "@/components/ui/select-box";
import { PageHeader } from "@/components/page/kit";

const PREVIEW_SCALE = 0.56;
type Pair = { en?: string; ar?: string };
type Extra = { key: string; label: { en: string; ar: string }; kind: (typeof EXTRA_KINDS)[number]; half?: boolean };
type State = {
  title: Pair;
  prefix: string;
  labels: Record<string, Pair>;
  hidden: string[];
  defaults: Record<string, Pair>;
  extra: Extra[];
  signatures: Pair[];
};

const KIND_LABEL = { text: "Short text", textarea: "Paragraph", date: "Date", money: "Amount" } as const;

export function DocFormEditor({
  slug,
  def,
  initial,
  profile,
  tabs,
}: {
  slug: string;
  def: DocTypeDef;
  initial: DocTypeSettings;
  profile: CompanyProfile;
  /** The Company section tabs, shown under the title. */
  tabs?: React.ReactNode;
}) {
  const t = useT();
  const ui = t.locale === "ar" ? "ar" : "en";
  const [s, setS] = useState<State>({
    title: initial.title ?? {},
    prefix: initial.prefix ?? "",
    labels: initial.labels ?? {},
    hidden: initial.hidden ?? [],
    defaults: initial.defaults ?? {},
    extra: (initial.extra ?? []) as Extra[],
    signatures: initial.signatures ?? [],
  });
  const [lang, setLang] = useState<DocumentLanguage>(profile.defaultLanguage);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [confirmReset, setConfirmReset] = useState(false);
  const [pending, startTransition] = useTransition();
  const set = (patch: Partial<State>) => setS((v) => ({ ...v, ...patch }));
  const setPair = <K extends "labels" | "defaults">(k: K, key: string, l: "en" | "ar", v: string) =>
    setS((cur) => ({ ...cur, [k]: { ...cur[k], [key]: { ...cur[k][key], [l]: v } } }));

  const settings = { ...s, prefix: s.prefix.trim() || undefined } as DocTypeSettings;
  const preview = applySettings(def, settings);
  // Sample content so every field shows on the preview.
  const sample = Object.fromEntries(
    preview.fields.map((f) => [
      f.key,
      f.defaultText?.[lang] ?? (f.kind === "date" ? "2026-10-21" : f.kind === "money" ? "1500000" : f.options ? f.options[0].value : "…"),
    ]),
  );

  return (
    <div className="grid grid-cols-1 gap-6">
      <PageHeader
        icon={FileText}
        back={{ href: `/w/${slug}/company/forms`, label: t("Document forms") }}
        title={t("Customise: {name}", { name: preview.title[ui] })}
        description={t("Changes apply to new documents. Documents already made keep the form they were made with.")}
        actions={
          <>
              <Button
                type="button"
                variant={confirmReset ? "destructive" : "ghost"}
                disabled={pending}
                onBlur={() => setConfirmReset(false)}
                onClick={() => {
                  if (!confirmReset) return setConfirmReset(true);
                  startTransition(async () => {
                    const res = await resetDocType(slug, def.key);
                    if (!res.ok) return void toast.error(res.error);
                    set({ title: {}, prefix: "", labels: {}, hidden: [], defaults: {}, extra: [], signatures: [] });
                    setConfirmReset(false);
                    toast.success(t("Back to the built-in form"));
                  });
                }}
              >
                <RotateCcw className="size-4" />
                {confirmReset ? t("Click again to reset") : t("Reset to built-in")}
              </Button>
              <Button
                type="button"
                disabled={pending}
                onClick={() =>
                  startTransition(async () => {
                    setErrors({});
                    const res = await saveDocTypeSettings(slug, def.key, settings);
                    if (!res.ok) {
                      setErrors(res.fieldErrors ?? {});
                      return void toast.error(res.error);
                    }
                    toast.success(t("Form saved"));
                  })
                }
              >
                {pending ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
                {t("Save form")}
              </Button>
          </>
        }
      >
        {tabs}
      </PageHeader>

      <div className="grid grid-cols-1 gap-6 2xl:grid-cols-[minmax(0,1fr)_auto]">
        <div className="grid content-start gap-6">
          <Section title={t("Name and number")}>
            <div className="grid items-start gap-4 sm:grid-cols-3">
              <LabeledInput id="f-title-en" label={t("Name (English)")} dir="ltr" placeholder={def.title.en} value={s.title.en ?? ""} onChange={(v) => set({ title: { ...s.title, en: v } })} />
              <LabeledInput id="f-title-ar" label={t("Name (Arabic)")} dir="rtl" placeholder={def.title.ar} value={s.title.ar ?? ""} onChange={(v) => set({ title: { ...s.title, ar: v } })} />
              <div className="grid gap-1.5">
                <LabeledInput
                  id="f-prefix"
                  label={t("Number prefix")}
                  dir="ltr"
                  placeholder={def.prefix}
                  value={s.prefix}
                  onChange={(v) => {
                    set({ prefix: v.toUpperCase() });
                    // The old message no longer applies once the prefix is edited.
                    setErrors((e) => {
                      const next = { ...e };
                      delete next.prefix;
                      return next;
                    });
                  }}
                  invalid={Boolean(errors.prefix)}
                  help={t("Letters only, e.g. {example}", { example: `${s.prefix || def.prefix}-0001` })}
                />
                <FieldError message={errors.prefix} />
              </div>
            </div>
          </Section>

          <Section title={t("Fields")} description={t("Rename a field in either language, hide what you don't use, and change the starting text. Fields marked with a lock are needed by this document.")}>
            <ul className="grid gap-3">
              {def.fields.map((f) => {
                const locked = isLockedField(def, f.key);
                const shown = locked || !s.hidden.includes(f.key);
                const hasDefault = f.kind === "text" || f.kind === "textarea";
                return (
                  <li key={f.key} className={cn("grid gap-3 rounded-lg border p-3", !shown && "bg-muted/40")}>
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className={cn("text-sm font-medium", !shown && "text-muted-foreground line-through")}>{f.label[ui]}</p>
                      {locked ? (
                        <span className="flex items-center gap-1 text-xs text-muted-foreground">
                          <Lock className="size-3.5" aria-hidden />
                          {t("Needed")}
                        </span>
                      ) : (
                        <label className="flex cursor-pointer items-center gap-2 text-sm">
                          <input
                            type="checkbox"
                            checked={shown}
                            onChange={(e) => set({ hidden: e.target.checked ? s.hidden.filter((k) => k !== f.key) : [...s.hidden, f.key] })}
                            className="size-4 accent-primary"
                          />
                          {t("Show|field")}
                        </label>
                      )}
                    </div>
                    {shown && (
                      <div className="grid items-start gap-3 sm:grid-cols-2">
                        <LabeledInput id={`f-${f.key}-en`} label={t("Label (English)")} dir="ltr" placeholder={f.label.en} value={s.labels[f.key]?.en ?? ""} onChange={(v) => setPair("labels", f.key, "en", v)} small />
                        <LabeledInput id={`f-${f.key}-ar`} label={t("Label (Arabic)")} dir="rtl" placeholder={f.label.ar} value={s.labels[f.key]?.ar ?? ""} onChange={(v) => setPair("labels", f.key, "ar", v)} small />
                        {hasDefault && f.kind === "textarea" && (
                          <>
                            <LabeledArea id={`f-${f.key}-den`} label={t("Starting text (English)")} dir="ltr" placeholder={f.defaultText?.en ?? ""} value={s.defaults[f.key]?.en ?? ""} onChange={(v) => setPair("defaults", f.key, "en", v)} />
                            <LabeledArea id={`f-${f.key}-dar`} label={t("Starting text (Arabic)")} dir="rtl" placeholder={f.defaultText?.ar ?? ""} value={s.defaults[f.key]?.ar ?? ""} onChange={(v) => setPair("defaults", f.key, "ar", v)} />
                          </>
                        )}
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          </Section>

          <Section title={t("Your own fields")} description={t("Add details your company always writes on this document, e.g. a site engineer or a permit number.")}>
            {s.extra.length > 0 && (
              <ul className="grid gap-3">
                {s.extra.map((x, i) => {
                  const update = (patch: Partial<Extra>) => set({ extra: s.extra.map((e, j) => (j === i ? { ...e, ...patch } : e)) });
                  return (
                    <li key={x.key} className="grid items-end gap-3 rounded-lg border p-3 sm:grid-cols-[1fr_1fr_9rem_auto_auto]">
                      <LabeledInput id={`x-${x.key}-en`} label={t("Name (English)")} dir="ltr" value={x.label.en} onChange={(v) => update({ label: { ...x.label, en: v } })} small invalid={Boolean(errors[`extra.${i}.label`])} />
                      <LabeledInput id={`x-${x.key}-ar`} label={t("Name (Arabic)")} dir="rtl" value={x.label.ar} onChange={(v) => update({ label: { ...x.label, ar: v } })} small />
                      <label className="grid gap-1 text-xs">
                        <span className="font-medium">{t("Kind")}</span>
                        <SelectBox value={x.kind} onValueChange={(v) => update({ kind: v as Extra["kind"] })} className={cn(nativeSelectClass, "h-8")}>
                          {EXTRA_KINDS.map((k) => (
                            <option key={k} value={k}>
                              {t(KIND_LABEL[k])}
                            </option>
                          ))}
                        </SelectBox>
                      </label>
                      <label className="flex h-8 cursor-pointer items-center gap-1.5 text-xs">
                        <input type="checkbox" checked={Boolean(x.half)} disabled={x.kind === "textarea"} onChange={(e) => update({ half: e.target.checked })} className="size-4 accent-primary" />
                        {t("Half width")}
                      </label>
                      <Button type="button" variant="ghost" size="sm" onClick={() => set({ extra: s.extra.filter((_, j) => j !== i) })} aria-label={t("Remove {name}", { name: x.label[ui] || x.label.en || x.label.ar || t("field") })}>
                        <Trash2 className="size-4" />
                      </Button>
                      <div className="sm:col-span-5">
                        <FieldError message={errors[`extra.${i}.label`]} />
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="w-fit"
              disabled={s.extra.length >= MAX_EXTRA_FIELDS}
              onClick={() => set({ extra: [...s.extra, { key: newExtraKey(), label: { en: "", ar: "" }, kind: "text", half: true }] })}
            >
              <Plus className="size-4" />
              {t("Add a field")}
            </Button>
          </Section>

          <Section title={t("Signature boxes")}>
            <div className="grid items-start gap-3 sm:grid-cols-2">
              {def.signatures.map((sig, i) => (
                <div key={sig.en} className="contents">
                  <LabeledInput
                    id={`sig-${i}-en`}
                    label={t("Box {n} (English)", { n: i + 1 })}
                    dir="ltr"
                    placeholder={sig.en}
                    value={s.signatures[i]?.en ?? ""}
                    onChange={(v) => set({ signatures: def.signatures.map((_, j) => (j === i ? { ...s.signatures[j], en: v } : (s.signatures[j] ?? {}))) })}
                    small
                  />
                  <LabeledInput
                    id={`sig-${i}-ar`}
                    label={t("Box {n} (Arabic)", { n: i + 1 })}
                    dir="rtl"
                    placeholder={sig.ar}
                    value={s.signatures[i]?.ar ?? ""}
                    onChange={(v) => set({ signatures: def.signatures.map((_, j) => (j === i ? { ...s.signatures[j], ar: v } : (s.signatures[j] ?? {}))) })}
                    small
                  />
                </div>
              ))}
            </div>
          </Section>
        </div>

        <aside aria-label={t("Preview")} className="2xl:sticky 2xl:top-4 2xl:self-start">
          <div className="mb-3 flex items-center justify-between gap-2">
            <h2 className="font-semibold">{t("Preview")}</h2>
            <div role="group" aria-label={t("Document language")} className="flex rounded-lg bg-muted p-0.5 text-xs">
              {(["ar", "en"] as const).map((l) => (
                <button
                  key={l}
                  type="button"
                  aria-pressed={lang === l}
                  onClick={() => setLang(l)}
                  className={cn("cursor-pointer rounded-md px-2.5 py-1 text-muted-foreground", lang === l && "bg-background font-medium text-foreground shadow-sm")}
                >
                  {l === "ar" ? "ع" : "EN"}
                </button>
              ))}
            </div>
          </div>
          <div dir="ltr" className="overflow-auto rounded-md border shadow-sm" style={{ width: `min(100%, calc(210mm * ${PREVIEW_SCALE} + 2px))` }}>
            <div style={{ width: `calc(210mm * ${PREVIEW_SCALE})`, height: `calc(297mm * ${PREVIEW_SCALE})` }}>
              <div style={{ transform: `scale(${PREVIEW_SCALE})`, transformOrigin: "top left" }}>
                <Paper profile={profile} style={profile.defaultStyle} lang={lang}>
                  <DocumentBody
                    def={preview}
                    doc={{
                      number: 1,
                      status: "issued",
                      date: "2026-10-21",
                      currency: "IQD",
                      data: sample,
                      items: preview.items ? [{ description: "…", unit: "…", quantity: "1", unitPrice: preview.items.prices ? "1500000" : "", condition: "" }] : [],
                      taxRate: null,
                    }}
                    lang={lang}
                    profile={profile}
                    projectName="…"
                  />
                </Paper>
              </div>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}

function Section({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) {
  return (
    <section className="grid gap-4 rounded-xl border bg-card p-5">
      <div>
        <h2 className="font-semibold">{title}</h2>
        {description && <p className="mt-0.5 text-sm text-muted-foreground">{description}</p>}
      </div>
      {children}
    </section>
  );
}

function LabeledInput({
  id,
  label,
  value,
  onChange,
  dir,
  placeholder,
  help,
  small,
  invalid,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  dir: "ltr" | "rtl";
  placeholder?: string;
  help?: string;
  small?: boolean;
  invalid?: boolean;
}) {
  return (
    <div className="grid gap-1">
      <label htmlFor={id} className={cn("font-medium", small ? "text-xs" : "text-sm")}>
        {label}
      </label>
      <Input id={id} dir={dir} value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} className={cn(small && "h-8")} aria-invalid={invalid} aria-describedby={help ? `${id}-help` : undefined} />
      {help && (
        <p id={`${id}-help`} className="text-xs text-muted-foreground">
          {help}
        </p>
      )}
    </div>
  );
}

function LabeledArea({ id, label, value, onChange, dir, placeholder }: { id: string; label: string; value: string; onChange: (v: string) => void; dir: "ltr" | "rtl"; placeholder?: string }) {
  return (
    <div className="grid gap-1">
      <label htmlFor={id} className="text-xs font-medium">
        {label}
      </label>
      <Textarea id={id} dir={dir} rows={3} value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}
