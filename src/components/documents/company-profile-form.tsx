"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { Check, ImageIcon, Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { saveCompanyProfile } from "@/lib/actions/company";
import {
  BRAND_SWATCHES,
  PAPER_STYLES,
  contrastRatio,
  isHexColor,
  readableOnWhite,
  type CompanyProfile,
  type DocumentLanguage,
  type PaperStyle,
} from "@/lib/branding";
import { cn } from "@/lib/utils";
import { useT } from "@/i18n/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FieldError } from "@/components/projects/project-fields";
import { Paper } from "./paper";

const IMAGE_ACCEPT = "image/png,image/jpeg,image/webp";
const PREVIEW_SCALE = 0.56;

/** Sample body for the preview, in the document's language. */
const SAMPLE = {
  en: { title: "Purchase order", number: "PO-0001", date: "Date", to: "To", item: "Item", qty: "Qty", total: "Total", rows: [["Cement (bag)", "200"], ["Steel bars (ton)", "12"]] },
  ar: { title: "أمر شراء", number: "PO-0001", date: "التاريخ", to: "إلى", item: "المادة", qty: "الكمية", total: "المجموع", rows: [["إسمنت (كيس)", "200"], ["حديد تسليح (طن)", "12"]] },
} as const;

type Fields = Omit<CompanyProfile, "logoUrl" | "stampUrl" | "defaultStyle" | "defaultLanguage"> & {
  defaultStyle: PaperStyle;
  defaultLanguage: DocumentLanguage;
};

export function CompanyProfileForm({ slug, profile }: { slug: string; profile: CompanyProfile }) {
  const t = useT();
  const [f, setF] = useState<Fields>(() => {
    const { logoUrl: _l, stampUrl: _s, ...rest } = profile;
    void _l;
    void _s;
    return rest;
  });
  const set = (patch: Partial<Fields>) => setF((v) => ({ ...v, ...patch }));
  const [logo, setLogo] = useState<{ file?: File; remove?: boolean }>({});
  const [stamp, setStamp] = useState<{ file?: File; remove?: boolean }>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [pending, startTransition] = useTransition();
  const [previewStyle, setPreviewStyle] = useState<PaperStyle>(profile.defaultStyle);
  const [previewLang, setPreviewLang] = useState<DocumentLanguage>(profile.defaultLanguage);

  // Show a newly chosen image straight away (and free it afterwards).
  const logoPreview = useObjectUrl(logo.file);
  const stampPreview = useObjectUrl(stamp.file);
  const logoUrl = logo.remove ? null : (logoPreview ?? profile.logoUrl);
  const stampUrl = stamp.remove ? null : (stampPreview ?? profile.stampUrl);
  const color = isHexColor(f.brandColor) ? f.brandColor : profile.brandColor;
  const preview: CompanyProfile = { ...f, brandColor: color, logoUrl, stampUrl };
  const lowContrast = isHexColor(f.brandColor) && contrastRatio(f.brandColor, "#FFFFFF") < 3;
  const sample = SAMPLE[previewLang];

  const text = (key: keyof Fields, label: string, opts: { dir?: "rtl" | "ltr"; type?: string; placeholder?: string; help?: string } = {}) => (
    <div className="grid gap-1.5">
      <Label htmlFor={`co-${key}`}>{label}</Label>
      <Input
        id={`co-${key}`}
        type={opts.type}
        dir={opts.dir ?? "auto"}
        value={(f[key] as string | null) ?? ""}
        onChange={(e) => set({ [key]: e.target.value } as Partial<Fields>)}
        placeholder={opts.placeholder}
        aria-invalid={Boolean(errors[key])}
        aria-describedby={opts.help ? `co-${key}-help` : undefined}
      />
      {opts.help && (
        <p id={`co-${key}-help`} className="text-xs text-muted-foreground">
          {opts.help}
        </p>
      )}
      <FieldError message={errors[key]} />
    </div>
  );

  return (
    <form
      className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_auto]"
      onSubmit={(e) => {
        e.preventDefault();
        setErrors({});
        const data = new FormData();
        for (const [k, v] of Object.entries(f)) data.set(k, v ?? "");
        if (logo.file) data.set("logo", logo.file);
        if (logo.remove) data.set("remove_logo", "1");
        if (stamp.file) data.set("stamp", stamp.file);
        if (stamp.remove) data.set("remove_stamp", "1");
        startTransition(async () => {
          const res = await saveCompanyProfile(slug, data);
          if (!res.ok) {
            setErrors(res.fieldErrors ?? {});
            toast.error(res.error);
            return;
          }
          toast.success(t("Company profile saved"));
          setLogo({});
          setStamp({});
        });
      }}
    >
      <div className="grid content-start gap-6">
        <Section title={t("Name & logo")}>
          <div className="grid items-start gap-4 sm:grid-cols-2">
            {text("nameEn", t("Company name (English)"), { dir: "ltr", placeholder: "Al-Noor Construction Co." })}
            {text("nameAr", t("Company name (Arabic)"), { dir: "rtl", placeholder: "شركة النور للمقاولات" })}
          </div>
          <ImagePicker
            id="logo"
            label={t("Logo")}
            help={t("PNG, JPG or WebP, up to 2 MB. A logo with a transparent background looks best.")}
            url={logoUrl}
            error={errors.logo}
            onPick={(file) => setLogo({ file })}
            onRemove={() => setLogo({ remove: true })}
          />
        </Section>

        <Section title={t("Brand colour")}>
          <div className="flex flex-wrap items-center gap-2" role="radiogroup" aria-label={t("Brand colour")}>
            {BRAND_SWATCHES.map((c) => (
              <button
                key={c}
                type="button"
                role="radio"
                aria-checked={f.brandColor.toUpperCase() === c}
                aria-label={c}
                onClick={() => set({ brandColor: c })}
                className="flex size-9 cursor-pointer items-center justify-center rounded-full ring-offset-2 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none aria-checked:ring-2 aria-checked:ring-foreground"
                style={{ backgroundColor: c }}
              >
                {f.brandColor.toUpperCase() === c && <Check className="size-4 text-white" aria-hidden />}
              </button>
            ))}
            <label className="flex items-center gap-2 text-sm">
              <input
                type="color"
                value={color}
                onChange={(e) => set({ brandColor: e.target.value.toUpperCase() })}
                className="size-9 cursor-pointer rounded-full border bg-transparent p-0.5"
                aria-label={t("Pick any colour")}
              />
              <Input
                value={f.brandColor}
                onChange={(e) => set({ brandColor: e.target.value })}
                className="w-28 font-mono tabular-nums"
                dir="ltr"
                aria-label={t("Colour code")}
                aria-invalid={Boolean(errors.brandColor)}
              />
            </label>
          </div>
          <FieldError message={errors.brandColor} />
          {lowContrast && (
            <p className="text-xs text-amber-800 dark:text-amber-300">
              {t("This colour is light. Headings will use a darker shade of it so they stay readable: {color}", { color: readableOnWhite(f.brandColor) })}
            </p>
          )}
        </Section>

        <Section title={t("Contact details")}>
          <div className="grid items-start gap-4 sm:grid-cols-2">
            {text("addressEn", t("Address (English)"), { dir: "ltr" })}
            {text("addressAr", t("Address (Arabic)"), { dir: "rtl" })}
            {text("phone", t("Phone"), { dir: "ltr", type: "tel", placeholder: "+964 770 000 0000" })}
            {text("email", t("Email"), { dir: "ltr", type: "email" })}
            {text("website", t("Website"), { dir: "ltr" })}
          </div>
        </Section>

        <Section title={t("Registration")}>
          <div className="grid items-start gap-4 sm:grid-cols-2">
            {text("registrationNo", t("Registration number"), { dir: "ltr" })}
            {text("taxNo", t("Tax number"), { dir: "ltr" })}
          </div>
        </Section>

        <Section title={t("Documents")}>
          <fieldset className="grid gap-2">
            <legend className="mb-1.5 text-sm font-medium">{t("Default paper style")}</legend>
            <div className="grid gap-2 sm:grid-cols-3">
              {PAPER_STYLES.map((s) => (
                <label
                  key={s.value}
                  className={cn(
                    "flex cursor-pointer flex-col gap-1 rounded-lg border p-3 text-sm has-[:checked]:border-primary has-[:checked]:bg-primary/5 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring",
                  )}
                >
                  <span className="flex items-center gap-2 font-medium">
                    <input
                      type="radio"
                      name="defaultStyle"
                      value={s.value}
                      checked={f.defaultStyle === s.value}
                      onChange={() => {
                        set({ defaultStyle: s.value });
                        setPreviewStyle(s.value);
                      }}
                      className="accent-primary"
                    />
                    {t(s.label)}
                  </span>
                  <span className="text-xs text-muted-foreground">{t(s.hint)}</span>
                </label>
              ))}
            </div>
          </fieldset>
          <fieldset className="grid gap-2">
            <legend className="mb-1.5 text-sm font-medium">{t("Documents are written in")}</legend>
            <div className="flex flex-wrap gap-4 text-sm">
              {(["ar", "en"] as const).map((l) => (
                <label key={l} className="flex cursor-pointer items-center gap-2">
                  <input
                    type="radio"
                    name="defaultLanguage"
                    value={l}
                    checked={f.defaultLanguage === l}
                    onChange={() => {
                      set({ defaultLanguage: l });
                      setPreviewLang(l);
                    }}
                    className="accent-primary"
                  />
                  {l === "ar" ? "العربية" : "English"}
                </label>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">{t("You can still choose the other language for any single document.")}</p>
          </fieldset>
          <div className="grid items-start gap-4 sm:grid-cols-2">
            {text("footerEn", t("Footer line (English)"), { dir: "ltr", placeholder: "Thank you for your business" })}
            {text("footerAr", t("Footer line (Arabic)"), { dir: "rtl", placeholder: "شكرًا لتعاملكم معنا" })}
          </div>
          <ImagePicker
            id="stamp"
            label={t("Stamp or signature")}
            help={t("Printed in the company's signature box. PNG with a transparent background works best.")}
            url={stampUrl}
            error={errors.stamp}
            onPick={(file) => setStamp({ file })}
            onRemove={() => setStamp({ remove: true })}
          />
        </Section>

        <div className="sticky bottom-0 -mx-1 flex justify-end border-t bg-background/95 px-1 py-3 backdrop-blur">
          <Button type="submit" disabled={pending}>
            {pending && <Loader2 className="size-4 animate-spin" />}
            {t("Save company profile")}
          </Button>
        </div>
      </div>

      <aside aria-label={t("Preview")} className="xl:sticky xl:top-4 xl:self-start">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-semibold">{t("Preview")}</h2>
          <div className="flex gap-2">
            <div role="group" aria-label={t("Paper style")} className="flex rounded-lg bg-muted p-0.5 text-xs">
              {PAPER_STYLES.map((s) => (
                <button
                  key={s.value}
                  type="button"
                  aria-pressed={previewStyle === s.value}
                  onClick={() => setPreviewStyle(s.value)}
                  className={cn("cursor-pointer rounded-md px-2.5 py-1 text-muted-foreground", previewStyle === s.value && "bg-background font-medium text-foreground shadow-sm")}
                >
                  {t(s.label)}
                </button>
              ))}
            </div>
            <div role="group" aria-label={t("Document language")} className="flex rounded-lg bg-muted p-0.5 text-xs">
              {(["ar", "en"] as const).map((l) => (
                <button
                  key={l}
                  type="button"
                  aria-pressed={previewLang === l}
                  onClick={() => setPreviewLang(l)}
                  className={cn("cursor-pointer rounded-md px-2.5 py-1 text-muted-foreground", previewLang === l && "bg-background font-medium text-foreground shadow-sm")}
                >
                  {l === "ar" ? "ع" : "EN"}
                </button>
              ))}
            </div>
          </div>
        </div>
        {/* A4 scaled down; dir=ltr keeps the scaling anchored on the same side in both languages. */}
        <div
          dir="ltr"
          className="overflow-hidden rounded-md border shadow-sm"
          style={{ width: `calc(210mm * ${PREVIEW_SCALE})`, height: `calc(297mm * ${PREVIEW_SCALE})` }}
        >
          <div style={{ transform: `scale(${PREVIEW_SCALE})`, transformOrigin: "top left" }}>
            <Paper profile={preview} style={previewStyle} lang={previewLang}>
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-[18pt] font-semibold" style={{ color: "var(--brand-ink)" }}>
                    {sample.title}
                  </p>
                  <p className="text-[10pt] text-gray-500">
                    {sample.to}: …
                  </p>
                </div>
                <p className="text-end text-[10pt]">
                  <bdi dir="ltr">{sample.number}</bdi>
                  <br />
                  {sample.date}: <bdi dir="ltr">2026-10-21</bdi>
                </p>
              </div>
              <table className="mt-6 w-full text-[10pt]">
                <thead>
                  <tr className="border-b-2" style={{ borderColor: "var(--brand-ink)" }}>
                    <th className="py-1.5 text-start">{sample.item}</th>
                    <th className="py-1.5 text-end">{sample.qty}</th>
                  </tr>
                </thead>
                <tbody>
                  {sample.rows.map(([item, qty]) => (
                    <tr key={item} className="border-b border-gray-200">
                      <td className="py-1.5">{item}</td>
                      <td className="py-1.5 text-end tabular-nums">{qty}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Paper>
          </div>
        </div>
      </aside>
    </form>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="grid gap-4 rounded-xl border bg-card p-5">
      <h2 className="font-semibold">{title}</h2>
      {children}
    </section>
  );
}

function ImagePicker({
  id,
  label,
  help,
  url,
  error,
  onPick,
  onRemove,
}: {
  id: string;
  label: string;
  help: string;
  url: string | null;
  error?: string;
  onPick: (file: File) => void;
  onRemove: () => void;
}) {
  const t = useT();
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={`co-${id}`}>{label}</Label>
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex h-16 w-32 items-center justify-center rounded-lg border bg-white p-1.5">
          {url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={url} alt={t("Current {name}", { name: label })} className="max-h-full max-w-full object-contain" />
          ) : (
            <ImageIcon className="size-6 text-muted-foreground" aria-hidden />
          )}
        </div>
        <Input
          id={`co-${id}`}
          type="file"
          accept={IMAGE_ACCEPT}
          onChange={(e) => e.target.files?.[0] && onPick(e.target.files[0])}
          className="w-auto max-w-full cursor-pointer file:me-3 file:cursor-pointer"
          aria-describedby={`co-${id}-help`}
          aria-invalid={Boolean(error)}
        />
        {url && (
          <Button type="button" variant="ghost" size="sm" onClick={onRemove}>
            <Trash2 className="size-4" />
            {t("Remove")}
          </Button>
        )}
      </div>
      <p id={`co-${id}-help`} className="text-xs text-muted-foreground">
        {help}
      </p>
      <FieldError message={error} />
    </div>
  );
}

function useObjectUrl(file: File | undefined) {
  const url = useMemo(() => (file ? URL.createObjectURL(file) : null), [file]);
  useEffect(() => () => void (url && URL.revokeObjectURL(url)), [url]);
  return url;
}
