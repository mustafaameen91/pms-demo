"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  BadgeCheck,
  Banknote,
  ClipboardList,
  FileSignature,
  FileText,
  Loader2,
  Mail,
  PackageCheck,
  Plus,
  Printer,
  Receipt,
  ShoppingCart,
  Building2,
  FilePen,
  Send,
  CircleCheck,
} from "lucide-react";
import { toast } from "sonner";
import { createDocument } from "@/lib/actions/documents";
import { PAPER_STYLES, type DocumentLanguage, type PaperStyle } from "@/lib/branding";
import { docNumber, docType, type DocTypeDef, type DocTypeKey } from "@/lib/documents/types";
import { layoutDef } from "@/lib/documents/customize";
import { cn, formatDate } from "@/lib/utils";
import { useT } from "@/i18n/client";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { nativeSelectClass } from "@/components/resources/resource-fields";
import { StatusBadge } from "./status-badge";
import { SelectBox } from "@/components/ui/select-box";
import { EmptyState, StatTile } from "@/components/page/kit";

export const DOC_ICONS: Record<DocTypeDef["icon"], typeof FileText> = {
  FileSignature,
  ShoppingCart,
  PackageCheck,
  Banknote,
  Mail,
  BadgeCheck,
  ClipboardList,
  FileText,
  Receipt,
};

type Row = { id: string; type: string; number: number; status: string; date: string; data: Record<string, string>; layout: unknown; createdByName: string | null };
type CompanyType = DocTypeDef & { enabled: boolean };

export function DocumentsList({
  projectId,
  basePath,
  printBase,
  documents,
  types,
  defaults,
  companyHref,
  invoicesHref,
}: {
  projectId: string;
  basePath: string;
  printBase: string;
  documents: Row[];
  /** This company's forms (with on / off). */
  types: CompanyType[];
  defaults: { language: DocumentLanguage; style: PaperStyle };
  /** Set when the company profile hasn't been filled in yet (admins get the link). */
  companyHref: string | null | false;
  /** Finance is set up: invoices live there (a link for owners/admins, null for others). Undefined = no Finance. */
  invoicesHref?: string | null;
}) {
  const t = useT();
  const lang = t.locale === "ar" ? "ar" : "en";
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState<string>("");
  const shown = documents.filter((d) => !filter || d.type === filter);
  // The first field (party / supplier / recipient) says who the document is for.
  // Each document is shown with the form it was made with.
  const defOf = (d: Row) => layoutDef(d.type, d.layout, docType);
  const who = (d: Row) => {
    const def = defOf(d);
    const first = def?.fields.find((f) => f.kind === "text");
    return first ? d.data[first.key] : "";
  };

  const byStatus = (st: string) => documents.filter((d) => d.status === st).length;

  return (
    <div className="grid grid-cols-1 gap-6">
      <dl className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile label={t("Documents")} value={documents.length} icon={FileText} />
        <StatTile label={t("Drafts")} value={byStatus("draft")} icon={FilePen} hint={t("Not issued yet")} />
        <StatTile label={t("Issued")} value={byStatus("issued")} icon={Send} />
        <StatTile label={t("Signed")} value={byStatus("signed")} icon={CircleCheck} tone={byStatus("signed") ? "good" : "default"} />
      </dl>

      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="flex items-center gap-2 text-lg font-semibold">
            <FileText className="size-5 text-primary" aria-hidden />
            {t("Documents")}
          </h2>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            {t("Contracts, purchase orders, vouchers, letters and more on your company's letterhead, filled in from this project. Print them or save as PDF.")}
          </p>
        </div>
        {documents.length > 0 && (
          <Button onClick={() => setOpen(true)}>
            <Plus className="size-4" />
            {t("New document")}
          </Button>
        )}
      </header>

      {companyHref !== false && (
        <p role="status" className="flex flex-wrap items-center gap-2 rounded-2xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm">
          <Building2 className="size-4 shrink-0 text-amber-700 dark:text-amber-300" aria-hidden />
          {t("Your company profile isn't set up yet, so documents show only the workspace name.")}
          {companyHref ? (
            <Link href={companyHref} className="font-medium text-primary underline-offset-4 hover:underline">
              {t("Add your logo and details")}
            </Link>
          ) : (
            <span>{t("Ask an owner or admin to add the logo and details.")}</span>
          )}
        </p>
      )}

      {documents.length === 0 ? (
        <EmptyState
          icon={FileText}
          title={t("No documents yet")}
          action={
            <Button onClick={() => setOpen(true)}>
              <Plus className="size-4" />
              {t("New document")}
            </Button>
          }
        >
          {t("Create a contract, purchase order or voucher from this project.")}
        </EmptyState>
      ) : (
      <section aria-labelledby="docs-heading" className="overflow-hidden rounded-2xl border bg-card">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b px-5 py-3">
          <h3 id="docs-heading" className="flex items-center gap-2 font-semibold">
            {t("All documents")}
            <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-semibold text-muted-foreground tabular-nums">{shown.length}</span>
          </h3>
          <label className="flex items-center gap-2 text-sm">
            <span className="text-muted-foreground">{t("Type")}</span>
            <SelectBox value={filter} onValueChange={(v) => setFilter(v)} className={cn(nativeSelectClass, "h-8 w-48")}>
              <option value="">{t("All types")}</option>
              {types.map((d) => (
                <option key={d.key} value={d.key}>
                  {d.title[lang]}
                </option>
              ))}
            </SelectBox>
          </label>
        </div>
        {shown.length === 0 ? (
          <p className="px-5 py-12 text-center text-sm text-muted-foreground">{t("No documents of this type.")}</p>
        ) : (
          <div className="relative overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead className="text-xs text-muted-foreground">
                <tr className="border-b bg-muted/40">
                  <th scope="col" className="py-2.5 pe-3 ps-5 text-start font-medium">{t("Number")}</th>
                  <th scope="col" className="px-3 py-2 text-start font-medium">{t("Type")}</th>
                  <th scope="col" className="px-3 py-2 text-start font-medium">{t("For")}</th>
                  <th scope="col" className="px-3 py-2 text-start font-medium">{t("Date")}</th>
                  <th scope="col" className="px-3 py-2 text-start font-medium">{t("Status")}</th>
                  <th scope="col" className="py-2.5 pe-5 ps-3"><span className="sr-only">{t("Actions")}</span></th>
                </tr>
              </thead>
              <tbody>
                {shown.map((d) => {
                  const def = defOf(d);
                  if (!def) return null;
                  const Icon = DOC_ICONS[def.icon];
                  return (
                    <tr key={d.id} className="relative border-b last:border-0 hover:bg-accent/40">
                      <td className="py-3 pe-3 ps-5 font-mono text-xs font-medium">
                        <Link href={`${basePath}/documents/${d.id}`} className="after:absolute after:inset-0 hover:underline">
                          <bdi dir="ltr">{docNumber(def.prefix, d.number)}</bdi>
                        </Link>
                      </td>
                      <td className="px-3 py-2.5">
                        <span className="flex items-center gap-2.5">
                          <span aria-hidden className="grid size-8 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
                            <Icon className="size-4" />
                          </span>
                          {def.title[lang]}
                        </span>
                      </td>
                      <td className="max-w-56 truncate px-3 py-2.5">{who(d)}</td>
                      <td className="px-3 py-2.5 whitespace-nowrap text-muted-foreground">{formatDate(d.date, t.intl)}</td>
                      <td className="px-3 py-2.5">
                        <StatusBadge status={d.status} />
                      </td>
                      <td className="relative z-10 py-2 pe-5 ps-3 text-end">
                        <Button asChild variant="ghost" size="sm">
                          <a href={`${printBase}/${d.id}`} target="_blank" rel="noreferrer" aria-label={t("Print {number}", { number: docNumber(def.prefix, d.number) })}>
                            <Printer className="size-4" />
                          </a>
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
      )}

      {invoicesHref !== undefined && (
        <p className="flex flex-wrap items-center gap-2 rounded-2xl border bg-card px-4 py-3 text-sm text-muted-foreground">
          <Receipt className="size-4 shrink-0" aria-hidden />
          {invoicesHref ? (
            <>
              {t("Invoices for this project are made in Finance, so payments and the books follow them.")}
              <Link href={invoicesHref} className="font-medium text-primary hover:underline">
                {t("New invoice")}
              </Link>
            </>
          ) : (
            t("Invoices are made in Finance by owners and admins.")
          )}
        </p>
      )}

      <NewDocumentDialog open={open} onOpenChange={setOpen} projectId={projectId} basePath={basePath} defaults={defaults} types={types.filter((d) => d.enabled && (invoicesHref === undefined || d.key !== "invoice"))} />
    </div>
  );
}

function NewDocumentDialog({
  open,
  onOpenChange,
  projectId,
  basePath,
  defaults,
  types,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  projectId: string;
  basePath: string;
  defaults: { language: DocumentLanguage; style: PaperStyle };
  types: CompanyType[];
}) {
  const t = useT();
  const router = useRouter();
  const lang = t.locale === "ar" ? "ar" : "en";
  const [type, setType] = useState<DocTypeKey | null>(null);
  const [language, setLanguage] = useState(defaults.language);
  const [style, setStyle] = useState(defaults.style);
  const [withMaterials, setWithMaterials] = useState(false);
  const [pending, startTransition] = useTransition();
  const def = type ? types.find((d) => d.key === type) : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl">
        <form
          className="grid gap-5"
          onSubmit={(e) => {
            e.preventDefault();
            if (!type) return;
            startTransition(async () => {
              const res = await createDocument(projectId, { type, language, style, withMaterials });
              if (!res.ok) return void toast.error(res.error);
              router.push(`${basePath}/documents/${res.data!.id}`);
            });
          }}
        >
          <DialogHeader>
            <DialogTitle>{t("New document")}</DialogTitle>
            <DialogDescription>{t("Pick a type. It starts filled in from this project; you can change everything before issuing.")}</DialogDescription>
          </DialogHeader>
          <fieldset>
            <legend className="sr-only">{t("Document type")}</legend>
            <div className="grid gap-2 sm:grid-cols-3">
              {types.map((d) => {
                const Icon = DOC_ICONS[d.icon];
                return (
                  <label
                    key={d.key}
                    className="flex cursor-pointer gap-2.5 rounded-lg border p-3 text-sm has-[:checked]:border-primary has-[:checked]:bg-primary/5 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring"
                  >
                    <input type="radio" name="doc-type" value={d.key} checked={type === d.key} onChange={() => setType(d.key)} className="sr-only" />
                    <Icon className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden />
                    <span>
                      <span className="block font-medium">{d.title[lang]}</span>
                      <span className="block text-xs text-muted-foreground">{d.description[lang]}</span>
                    </span>
                  </label>
                );
              })}
            </div>
          </fieldset>
          <div className="grid items-start gap-4 sm:grid-cols-2">
            <fieldset className="grid gap-1.5">
              <legend className="mb-1 text-sm font-medium">{t("Document language")}</legend>
              <div className="flex gap-4 text-sm">
                {(["ar", "en"] as const).map((l) => (
                  <label key={l} className="flex cursor-pointer items-center gap-2">
                    <input type="radio" name="doc-lang" checked={language === l} onChange={() => setLanguage(l)} className="accent-primary" />
                    {l === "ar" ? "العربية" : "English"}
                  </label>
                ))}
              </div>
            </fieldset>
            <label className="grid gap-1.5 text-sm">
              <span className="font-medium">{t("Paper style")}</span>
              <SelectBox value={style} onValueChange={(v) => setStyle(v as PaperStyle)} className={nativeSelectClass}>
                {PAPER_STYLES.map((s) => (
                  <option key={s.value} value={s.value}>
                    {t(s.label)}
                  </option>
                ))}
              </SelectBox>
            </label>
          </div>
          {def?.items && (
            <label className="flex cursor-pointer items-center gap-2 text-sm">
              <input type="checkbox" checked={withMaterials} onChange={(e) => setWithMaterials(e.target.checked)} className="size-4 accent-primary" />
              {t("Start with this project's planned materials")}
            </label>
          )}
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              {t("Cancel")}
            </Button>
            <Button type="submit" disabled={!type || pending}>
              {pending && <Loader2 className="size-4 animate-spin" />}
              {t("Create")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
