"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Ban, CircleCheck, Loader2, Plus, Printer, Save, Send, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { deleteDocument, saveDocument, setDocumentStatus } from "@/lib/actions/documents";
import { PAPER_STYLES, type CompanyProfile, type DocumentLanguage, type PaperStyle } from "@/lib/branding";
import { docNumber, docTotals, type DocItem, type DocTypeDef } from "@/lib/documents/types";
import { cn, formatMoney } from "@/lib/utils";
import { useT } from "@/i18n/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { FieldError } from "@/components/projects/project-fields";
import { nativeSelectClass } from "@/components/resources/resource-fields";
import { Paper } from "./paper";
import { DocumentBody } from "./document-body";
import { StatusBadge } from "./status-badge";
import { SelectBox } from "@/components/ui/select-box";

const PREVIEW_SCALE = 0.62;

type Doc = {
  id: string;
  number: number;
  status: string;
  language: DocumentLanguage;
  style: PaperStyle;
  date: string;
  currency: string;
  data: Record<string, string>;
  items: DocItem[];
  taxRate: string | null;
};

const emptyItem = (def: DocTypeDef): DocItem => ({ description: "", unit: "", quantity: "", unitPrice: "", ...(def.items?.condition ? { condition: "" } : {}) });

export function DocumentEditor({
  def,
  doc,
  profile,
  projectName,
  listHref,
  printHref,
}: {
  def: DocTypeDef;
  doc: Doc;
  profile: CompanyProfile;
  projectName: string;
  listHref: string;
  printHref: string;
}) {
  const t = useT();
  const router = useRouter();
  const ui = t.locale === "ar" ? "ar" : "en";
  const draft = doc.status === "draft";
  const [date, setDate] = useState(doc.date);
  const [language, setLanguage] = useState(doc.language);
  const [style, setStyle] = useState(doc.style);
  const [data, setData] = useState(doc.data);
  const [items, setItems] = useState<DocItem[]>(doc.items.length ? doc.items : def.items ? [emptyItem(def)] : []);
  const [taxRate, setTaxRate] = useState(doc.taxRate ? String(Number(doc.taxRate)) : "");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [dirty, setDirty] = useState(false);
  const [confirm, setConfirm] = useState<"cancel" | "delete" | null>(null);
  const [pending, startTransition] = useTransition();
  const touch = () => setDirty(true);
  const totals = def.items?.prices ? docTotals(items, taxRate) : null;
  const number = docNumber(def.prefix, doc.number);

  const save = (then?: () => Promise<void>) =>
    startTransition(async () => {
      setErrors({});
      const res = await saveDocument(doc.id, { date, language, style, data, items, taxRate });
      if (!res.ok) {
        setErrors(res.fieldErrors ?? {});
        toast.error(res.error);
        return;
      }
      setDirty(false);
      if (then) await then();
      else toast.success(t("Saved"));
    });
  const changeStatus = (status: "issued" | "signed" | "cancelled") =>
    save(async () => {
      const res = await setDocumentStatus(doc.id, status);
      if (!res.ok) {
        setErrors(res.fieldErrors ?? {});
        toast.error(res.error);
        return;
      }
      toast.success({ issued: t("Document issued"), signed: t("Marked as signed"), cancelled: t("Document cancelled") }[status]);
      setConfirm(null);
    });

  const setItem = (i: number, patch: Partial<DocItem>) => {
    setItems((list) => list.map((item, j) => (j === i ? { ...item, ...patch } : item)));
    touch();
  };

  return (
    <div className="grid grid-cols-1 gap-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <Link href={listHref} className="mb-1 flex w-fit items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
            <ArrowLeft className="size-4 rtl:-scale-x-100" aria-hidden />
            {t("All documents")}
          </Link>
          <h2 className="flex flex-wrap items-center gap-2 text-lg font-semibold">
            {def.title[ui]} <bdi dir="ltr" className="font-mono text-base text-muted-foreground">{number}</bdi>
            <StatusBadge status={doc.status} />
          </h2>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" disabled={pending} onClick={() => save()}>
            {pending ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
            {t("Save")}
          </Button>
          <Button asChild variant="outline">
            <a href={printHref} target="_blank" rel="noreferrer" onClick={(e) => dirty && (e.preventDefault(), save(async () => void window.open(printHref, "_blank")))}>
              <Printer className="size-4" />
              {t("Print / PDF")}
            </a>
          </Button>
          {doc.status === "draft" && (
            <Button type="button" disabled={pending} onClick={() => changeStatus("issued")}>
              <Send className="size-4" />
              {t("Issue")}
            </Button>
          )}
          {doc.status === "issued" && (
            <Button type="button" disabled={pending} onClick={() => changeStatus("signed")}>
              <CircleCheck className="size-4" />
              {t("Mark as signed")}
            </Button>
          )}
          {doc.status === "draft" && (
            <Button
              type="button"
              variant={confirm === "delete" ? "destructive" : "ghost"}
              disabled={pending}
              onBlur={() => setConfirm(null)}
              onClick={() => {
                if (confirm !== "delete") return setConfirm("delete");
                startTransition(async () => {
                  const res = await deleteDocument(doc.id);
                  if (!res.ok) return void toast.error(res.error);
                  toast.success(t("Draft deleted"));
                  router.push(listHref);
                });
              }}
            >
              <Trash2 className="size-4" />
              {confirm === "delete" ? t("Click again to delete") : t("Delete")}
            </Button>
          )}
          {(doc.status === "issued" || doc.status === "signed") && (
            <Button
              type="button"
              variant={confirm === "cancel" ? "destructive" : "ghost"}
              disabled={pending}
              onBlur={() => setConfirm(null)}
              onClick={() => (confirm === "cancel" ? changeStatus("cancelled") : setConfirm("cancel"))}
            >
              <Ban className="size-4" />
              {confirm === "cancel" ? t("Click again to cancel it") : t("Cancel document")}
            </Button>
          )}
        </div>
      </header>

      {!draft && (
        <p role="status" className="rounded-lg border bg-muted/50 px-3 py-2 text-sm">
          {doc.status === "cancelled"
            ? t("This document was cancelled. Its number stays used so the sequence has no gaps.")
            : t("This document has been issued, so its content can't change. You can still switch the paper style or language. To change the content, cancel it and create a new one.")}
        </p>
      )}

      <div className="grid grid-cols-1 gap-6 2xl:grid-cols-[minmax(0,1fr)_auto]">
        <div className="grid content-start gap-6">
          <section className="grid gap-4 rounded-xl border bg-card p-5">
            <div className="grid items-start gap-4 sm:grid-cols-3">
              <div className="grid gap-1.5">
                <Label htmlFor="doc-date">{t("Date")}</Label>
                <Input id="doc-date" type="date" value={date} disabled={!draft} onChange={(e) => (setDate(e.target.value), touch())} />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="doc-language">{t("Document language")}</Label>
                <SelectBox id="doc-language" value={language} onValueChange={(v) => (setLanguage(v as DocumentLanguage), touch())} className={nativeSelectClass}>
                  <option value="ar">العربية</option>
                  <option value="en">English</option>
                </SelectBox>
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="doc-style">{t("Paper style")}</Label>
                <SelectBox id="doc-style" value={style} onValueChange={(v) => (setStyle(v as PaperStyle), touch())} className={nativeSelectClass}>
                  {PAPER_STYLES.map((s) => (
                    <option key={s.value} value={s.value}>
                      {t(s.label)}
                    </option>
                  ))}
                </SelectBox>
              </div>
            </div>
          </section>

          <fieldset disabled={!draft} className="grid gap-4 rounded-xl border bg-card p-5">
            <legend className="sr-only">{t("Details")}</legend>
            <div className="grid items-start gap-4 sm:grid-cols-2">
              {def.fields.map((f) => {
                const id = `doc-${f.key}`;
                const err = errors[`data.${f.key}`];
                const value = data[f.key] ?? "";
                const onChange = (v: string) => {
                  setData((d) => ({ ...d, [f.key]: v }));
                  touch();
                };
                return (
                  <div key={f.key} className={cn("grid gap-1.5", (!f.half || f.kind === "textarea") && "sm:col-span-2")}>
                    <Label htmlFor={id}>
                      {f.label[ui]} {f.required && <span aria-hidden className="text-destructive">*</span>}
                    </Label>
                    {f.kind === "textarea" ? (
                      <Textarea id={id} dir="auto" rows={f.key === "body" ? 10 : 3} value={value} onChange={(e) => onChange(e.target.value)} aria-invalid={Boolean(err)} />
                    ) : f.kind === "select" ? (
                      <SelectBox id={id} value={value} onValueChange={(v) => onChange(v)} className={nativeSelectClass}>
                        {f.options!.map((o) => (
                          <option key={o.value} value={o.value}>
                            {o.label[ui]}
                          </option>
                        ))}
                      </SelectBox>
                    ) : (
                      <Input
                        id={id}
                        type={f.kind === "date" ? "date" : "text"}
                        inputMode={f.kind === "money" ? "decimal" : undefined}
                        dir={f.kind === "money" ? "ltr" : "auto"}
                        value={value}
                        onChange={(e) => onChange(f.kind === "money" ? e.target.value.replace(/,/g, "") : e.target.value)}
                        className={cn(f.kind === "money" && "tabular-nums")}
                        aria-invalid={Boolean(err)}
                      />
                    )}
                    {f.kind === "money" && <p className="text-xs text-muted-foreground">{t("In {currency}", { currency: doc.currency })}</p>}
                    <FieldError message={err} />
                  </div>
                );
              })}
            </div>
          </fieldset>

          {def.items && (
            <fieldset disabled={!draft} className="rounded-xl border bg-card">
              <legend className="sr-only">{t("Lines")}</legend>
              <h3 className="border-b px-4 py-3 font-semibold">{t("Lines")}</h3>
              <div className="relative overflow-x-auto">
                <table className="w-full min-w-[640px] text-sm">
                  <thead className="text-xs text-muted-foreground">
                    <tr className="border-b bg-muted/40">
                      <th scope="col" className="py-2 pe-2 ps-4 text-start font-medium">{t("Description")}</th>
                      <th scope="col" className="w-24 px-2 py-2 text-start font-medium">{t("Unit")}</th>
                      <th scope="col" className="w-24 px-2 py-2 text-start font-medium">{t("Quantity")}</th>
                      {def.items.prices && <th scope="col" className="w-32 px-2 py-2 text-start font-medium">{t("Unit price")}</th>}
                      {def.items.condition && <th scope="col" className="w-40 px-2 py-2 text-start font-medium">{t("Condition")}</th>}
                      {def.items.prices && <th scope="col" className="w-32 px-2 py-2 text-end font-medium">{t("Amount")}</th>}
                      <th scope="col" className="w-10 py-2 pe-4"><span className="sr-only">{t("Remove")}</span></th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((item, i) => (
                      <tr key={i} className="border-b last:border-0">
                        <td className="py-1.5 pe-2 ps-4">
                          <Input dir="auto" value={item.description} onChange={(e) => setItem(i, { description: e.target.value })} aria-label={t("Line {n} description", { n: i + 1 })} />
                        </td>
                        <td className="px-2 py-1.5">
                          <Input dir="auto" value={item.unit} onChange={(e) => setItem(i, { unit: e.target.value })} aria-label={t("Line {n} unit", { n: i + 1 })} />
                        </td>
                        <td className="px-2 py-1.5">
                          <Input dir="ltr" inputMode="decimal" value={item.quantity} onChange={(e) => setItem(i, { quantity: e.target.value.replace(/,/g, "") })} className="tabular-nums" aria-label={t("Line {n} quantity", { n: i + 1 })} aria-invalid={Boolean(errors[`items.${i}.quantity`])} />
                        </td>
                        {def.items!.prices && (
                          <td className="px-2 py-1.5">
                            <Input dir="ltr" inputMode="decimal" value={item.unitPrice} onChange={(e) => setItem(i, { unitPrice: e.target.value.replace(/,/g, "") })} className="tabular-nums" aria-label={t("Line {n} unit price", { n: i + 1 })} aria-invalid={Boolean(errors[`items.${i}.unitPrice`])} />
                          </td>
                        )}
                        {def.items!.condition && (
                          <td className="px-2 py-1.5">
                            <Input dir="auto" value={item.condition ?? ""} onChange={(e) => setItem(i, { condition: e.target.value })} aria-label={t("Line {n} condition", { n: i + 1 })} />
                          </td>
                        )}
                        {def.items!.prices && <td className="px-2 py-1.5 text-end font-medium whitespace-nowrap tabular-nums">{formatMoney(totals!.lines[i], doc.currency, t.intl)}</td>}
                        <td className="py-1.5 pe-4 text-end">
                          <Button type="button" variant="ghost" size="sm" onClick={() => (setItems((l) => l.filter((_, j) => j !== i)), touch())} aria-label={t("Remove line {n}", { n: i + 1 })}>
                            <X className="size-4" />
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="flex flex-wrap items-center justify-between gap-3 border-t px-4 py-3">
                <Button type="button" variant="outline" size="sm" onClick={() => (setItems((l) => [...l, emptyItem(def)]), touch())}>
                  <Plus className="size-4" />
                  {t("Add line")}
                </Button>
                {totals && (
                  <div className="flex flex-wrap items-center gap-4 text-sm">
                    <label className="flex items-center gap-2">
                      {t("Tax %")}
                      <Input dir="ltr" inputMode="decimal" value={taxRate} onChange={(e) => (setTaxRate(e.target.value), touch())} className="h-8 w-20 tabular-nums" aria-invalid={Boolean(errors.taxRate)} />
                    </label>
                    <span>
                      {t("Total")} <strong className="tabular-nums">{formatMoney(totals.total, doc.currency, t.intl)}</strong>
                    </span>
                  </div>
                )}
              </div>
              <div className="px-4 pb-3">
                <FieldError message={errors.taxRate ?? Object.entries(errors).find(([k]) => k.startsWith("items"))?.[1]} />
              </div>
            </fieldset>
          )}
        </div>

        <aside aria-label={t("Preview")} className="2xl:sticky 2xl:top-4 2xl:self-start">
          <h3 className="mb-3 font-semibold">{t("Preview")}</h3>
          <div dir="ltr" className="overflow-auto rounded-md border shadow-sm" style={{ width: `min(100%, calc(210mm * ${PREVIEW_SCALE} + 2px))` }}>
            <div style={{ width: `calc(210mm * ${PREVIEW_SCALE})`, height: `calc(297mm * ${PREVIEW_SCALE})` }}>
              <div style={{ transform: `scale(${PREVIEW_SCALE})`, transformOrigin: "top left" }}>
                <Paper profile={profile} style={style} lang={language}>
                  <DocumentBody def={def} doc={{ number: doc.number, status: doc.status, date, currency: doc.currency, data, items, taxRate }} lang={language} profile={profile} projectName={projectName} />
                </Paper>
              </div>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
