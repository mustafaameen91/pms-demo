"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Ban, Building2, ListOrdered, Loader2, Lock, Paperclip, Pencil, Plus, Save, ShoppingCart, X } from "lucide-react";
import { toast } from "sonner";
import { cancelBill, saveBill } from "@/lib/actions/finance";
import { CURRENCIES } from "@/lib/constants";
import { addDays } from "@/lib/hr-rules";
import { formatDate } from "@/lib/utils";
import { useT } from "@/i18n/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { SelectBox } from "@/components/ui/select-box";
import { FieldError } from "@/components/projects/project-fields";
import { ContactDialog, DocSummary, LinesEditor, type ContactLite } from "./ui";

type Line = { description: string; unit: string; quantity: string; unitPrice: string };
export type BillInput = {
  contactId: string;
  reference: string;
  projectId: string;
  accountId: string;
  date: string;
  dueDate: string;
  currency: string;
  items: Line[];
  taxRate: string;
  notes: string;
  documentId: string;
};
export type PurchaseOrder = { id: string; code: string; project: string; projectId: string; supplier: string; currency: string; items: Line[]; taxRate: string };

/** Add or edit a supplier bill; it can start from a purchase order. */
export function BillForm({
  slug,
  billId,
  initial,
  suppliers,
  projects,
  accounts,
  orders,
  baseCurrency,
  taxName,
  file,
  editable,
  cancellable,
}: {
  slug: string;
  billId: string | null;
  initial: BillInput;
  suppliers: ContactLite[];
  projects: { id: string; name: string; key: string; currency: string }[];
  accounts: { id: string; name: string; code: string }[];
  orders: PurchaseOrder[];
  baseCurrency: string;
  taxName: string;
  file: { name: string; href: string } | null;
  editable: boolean;
  cancellable: boolean;
}) {
  const t = useT();
  const router = useRouter();
  const [f, setF] = useState<BillInput>(initial);
  const [list, setList] = useState(suppliers);
  const [scan, setScan] = useState<File | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [newSupplier, setNewSupplier] = useState(false);
  const [pending, start] = useTransition();
  // A saved bill opens as a read-only page; "Edit" turns it into the form.
  const [editing, setEditing] = useState(billId === null);
  const currencies = [...new Set([f.currency, baseCurrency, ...CURRENCIES])];

  const fromOrder = (id: string) => {
    const po = orders.find((o) => o.id === id);
    if (!po) return setF({ ...f, documentId: "" });
    const supplier = list.find((c) => c.name.trim().toLowerCase() === po.supplier.trim().toLowerCase());
    setF({ ...f, documentId: po.id, projectId: po.projectId, currency: po.currency, items: po.items.length ? po.items : f.items, taxRate: po.taxRate || f.taxRate, contactId: supplier?.id ?? f.contactId, reference: f.reference || po.code });
  };

  const cancelButton = cancellable && (
    <Button
      type="button"
      variant="ghost"
      className="me-auto text-muted-foreground hover:text-destructive"
      disabled={pending}
      onClick={() =>
        confirm(t("Cancel this bill? It's kept, marked cancelled, and leaves the books.")) &&
        start(async () => {
          const res = await cancelBill(billId!, slug);
          if (!res.ok) return void toast.error(res.error);
          toast.success(t("Bill cancelled"));
        })
      }
    >
      <Ban className="size-4" />
      {t("Cancel bill")}
    </Button>
  );

  if (!editing) {
    const account = accounts.find((a) => a.id === f.accountId);
    const project = projects.find((p) => p.id === f.projectId);
    return (
      <div className="grid gap-6">
        <section aria-labelledby="bill-details" className="grid gap-5 rounded-2xl border bg-card p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 id="bill-details" className="font-semibold">
              {t("Bill details")}
            </h2>
            {editable ? (
              <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
                <Pencil className="size-4" />
                {t("Edit bill")}
              </Button>
            ) : (
              <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                <Lock className="size-3.5" aria-hidden />
                {t("Can't be changed (cancelled or in a closed period)")}
              </span>
            )}
          </div>
          <dl className="grid grid-cols-1 gap-x-6 gap-y-4 text-sm sm:grid-cols-2 lg:grid-cols-4">
            {(
              [
                [t("Supplier"), list.find((c) => c.id === f.contactId)?.name],
                [t("Their bill number"), f.reference],
                [t("What it's for"), account ? `${t(account.name)} · ${account.code}` : null],
                [t("Project"), project ? `${project.name} · ${project.key}` : t("Not for a project")],
                [t("Bill date"), formatDate(f.date, t.intl)],
                [t("Due date"), formatDate(f.dueDate, t.intl)],
                [t("Currency"), f.currency],
                [`${taxName} %`, f.taxRate || "0"],
              ] as [string, string | null | undefined][]
            ).map(([label, value]) => (
              <div key={label} className="min-w-0">
                <dt className="text-xs font-medium text-muted-foreground">{label}</dt>
                <dd className="mt-0.5 font-medium">{value ? <bdi>{value}</bdi> : <span className="text-muted-foreground/70">—</span>}</dd>
              </div>
            ))}
          </dl>
        </section>
        <section aria-labelledby="bill-lines" className="grid gap-4 rounded-2xl border bg-card p-5">
          <h2 id="bill-lines" className="font-semibold">
            {t("What they billed")}
          </h2>
          <LinesView lines={f.items} currency={f.currency} taxRate={f.taxRate} taxName={taxName} />
          {(f.notes || file) && (
            <div className="grid gap-4 border-t pt-4 sm:grid-cols-2">
              {f.notes && (
                <div>
                  <p className="text-xs font-medium text-muted-foreground">{t("Notes")}</p>
                  <p className="mt-1 text-sm whitespace-pre-wrap" dir="auto">
                    {f.notes}
                  </p>
                </div>
              )}
              {file && (
                <div>
                  <p className="text-xs font-medium text-muted-foreground">{t("Their bill (scan)")}</p>
                  <a href={file.href} target="_blank" rel="noopener" className="mt-1 inline-flex items-center gap-1.5 text-sm text-primary hover:underline">
                    <Paperclip className="size-4" aria-hidden />
                    {file.name}
                  </a>
                </div>
              )}
            </div>
          )}
        </section>
        {cancelButton && <div className="flex">{cancelButton}</div>}
      </div>
    );
  }

  return (
    <form
      className="grid grid-cols-1 items-start gap-6 xl:grid-cols-[minmax(0,1fr)_22rem]"
      onSubmit={(e) => {
        e.preventDefault();
        setErrors({});
        const fd = new FormData();
        fd.set("data", JSON.stringify(f));
        if (scan) fd.set("file", scan);
        start(async () => {
          const res = await saveBill(slug, billId, fd);
          if (!res.ok) {
            setErrors(res.fieldErrors ?? { form: res.error });
            return void toast.error(res.error);
          }
          toast.success(t("Bill saved"));
          if (billId) setEditing(false);
          router.push(`/w/${slug}/finance/bills/${res.data!.id}`);
        });
      }}
    >
      <fieldset disabled={!editable} className="grid min-w-0 grid-cols-1 gap-6">
        {orders.length > 0 && !billId && (
          <section className="flex flex-wrap items-end gap-3 rounded-2xl border border-primary/30 bg-primary/5 p-4">
            <ShoppingCart className="mb-2 size-5 text-primary" aria-hidden />
            <div className="grid min-w-64 flex-1 gap-1.5">
              <Label htmlFor="bl-po">{t("Start from a purchase order")}</Label>
              <SelectBox id="bl-po" className="h-9 w-full" value={f.documentId} onValueChange={fromOrder}>
                <option value="">{t("No, enter it by hand")}</option>
                {orders.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.code} · {o.supplier || "—"} · {o.project}
                  </option>
                ))}
              </SelectBox>
            </div>
          </section>
        )}
        <section aria-labelledby="bl-who" className="grid gap-4 rounded-2xl border bg-card p-5">
          <h2 id="bl-who" className="flex items-center gap-2 font-semibold">
            <Building2 className="size-4 text-muted-foreground" aria-hidden />
            {t("Who and when")}
          </h2>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 2xl:grid-cols-4">
            <div className="grid gap-1.5 md:col-span-2">
              <Label htmlFor="bl-supplier">{t("Supplier")}</Label>
              <div className="flex gap-2">
                <SelectBox id="bl-supplier" className="h-9 min-w-0 flex-1" value={f.contactId} onValueChange={(v) => setF({ ...f, contactId: v })} placeholder={t("Choose a supplier")} aria-invalid={Boolean(errors.contactId)}>
                  {list.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </SelectBox>
                <Button type="button" variant="outline" onClick={() => setNewSupplier(true)}>
                  <Plus className="size-4" />
                  {t("New")}
                </Button>
              </div>
              <FieldError message={errors.contactId} />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="bl-ref">{t("Their bill number")}</Label>
              <Input id="bl-ref" dir="auto" value={f.reference} onChange={(e) => setF({ ...f, reference: e.target.value })} maxLength={80} />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="bl-acc">{t("What it's for")}</Label>
              <SelectBox id="bl-acc" className="h-9 w-full" value={f.accountId} onValueChange={(v) => setF({ ...f, accountId: v })} aria-invalid={Boolean(errors.accountId)}>
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {t(a.name)} · {a.code}
                  </option>
                ))}
              </SelectBox>
              <FieldError message={errors.accountId} />
            </div>
            <div className="grid gap-1.5 md:col-span-2">
              <Label htmlFor="bl-project">
                {t("Project")} <span className="font-normal text-muted-foreground">{t("(optional)")}</span>
              </Label>
              <SelectBox id="bl-project" className="h-9 w-full" value={f.projectId} onValueChange={(v) => setF({ ...f, projectId: v })}>
                <option value="">{t("Not for a project")}</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} · {p.key}
                  </option>
                ))}
              </SelectBox>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="bl-date">{t("Bill date")}</Label>
              <Input id="bl-date" type="date" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value, dueDate: f.dueDate < e.target.value ? addDays(e.target.value, 30) : f.dueDate })} />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="bl-due">{t("Due date")}</Label>
              <Input id="bl-due" type="date" value={f.dueDate} min={f.date} onChange={(e) => setF({ ...f, dueDate: e.target.value })} aria-invalid={Boolean(errors.dueDate)} />
              <FieldError message={errors.dueDate} />
            </div>
          </div>
        </section>
        <section aria-labelledby="bl-lines" className="grid gap-4 rounded-2xl border bg-card p-5">
          <h2 id="bl-lines" className="flex items-center gap-2 font-semibold">
            <ListOrdered className="size-4 text-muted-foreground" aria-hidden />
            {t("What they billed")}
          </h2>
          <LinesEditor lines={f.items} onChange={(items) => setF({ ...f, items })} currency={f.currency} taxRate={f.taxRate} taxName={taxName} error={errors.items} hideTotals />
        </section>
        <section aria-labelledby="bl-extra" className="grid gap-4 rounded-2xl border bg-card p-5">
          <h2 id="bl-extra" className="flex items-center gap-2 font-semibold">
            <Paperclip className="size-4 text-muted-foreground" aria-hidden />
            {t("Scan and notes")}
          </h2>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="grid content-start gap-1.5">
              <Label htmlFor="bl-file">{file ? t("Replace their bill (scan)") : t("Their bill (scan)")}</Label>
              {file && (
                <a href={file.href} target="_blank" rel="noopener" className="inline-flex items-center gap-1.5 text-sm text-primary hover:underline">
                  <Paperclip className="size-4" aria-hidden />
                  {file.name}
                </a>
              )}
              <Input id="bl-file" type="file" accept="application/pdf,image/jpeg,image/png,image/webp" onChange={(e) => setScan(e.target.files?.[0] ?? null)} aria-invalid={Boolean(errors.file)} />
              <FieldError message={errors.file} />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="bl-notes">{t("Notes")}</Label>
              <Textarea id="bl-notes" dir="auto" rows={3} value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} maxLength={2000} />
            </div>
          </div>
        </section>
      </fieldset>
      <aside className="grid gap-4 xl:sticky xl:top-6">
        <DocSummary lines={f.items} currency={f.currency} taxRate={f.taxRate} taxName={taxName}>
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor="bl-cur">{t("Currency")}</Label>
              <SelectBox id="bl-cur" className="h-9 w-full" value={f.currency} onValueChange={(v) => setF({ ...f, currency: v })} disabled={!editable}>
                {currencies.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </SelectBox>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="bl-tax">{taxName} %</Label>
              <Input id="bl-tax" dir="ltr" inputMode="decimal" value={f.taxRate} onChange={(e) => setF({ ...f, taxRate: e.target.value })} aria-invalid={Boolean(errors.taxRate)} disabled={!editable} />
            </div>
          </div>
          <FieldError message={errors.form} />
          <div className="grid gap-2 border-t pt-4">
            {editable && (
              <Button type="submit" disabled={pending} className="w-full">
                {pending ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
                {t("Save bill")}
              </Button>
            )}
            {billId ? (
              <Button type="button" variant="ghost" className="w-full" disabled={pending} onClick={() => (setF(initial), setErrors({}), setEditing(false))}>
                <X className="size-4" />
                {t("Discard changes")}
              </Button>
            ) : (
              <Button type="button" variant="ghost" className="w-full" onClick={() => router.back()}>
                {t("Cancel")}
              </Button>
            )}
          </div>
        </DocSummary>
      </aside>
      <ContactDialog slug={slug} open={newSupplier} onOpenChange={setNewSupplier} kind="supplier" baseCurrency={baseCurrency} onSaved={(id, name) => (setList([...list, { id, name, kind: "supplier", currency: f.currency }]), setF({ ...f, contactId: id }))} />
    </form>
  );
}

/** The bill's lines as a plain table with totals (no inputs). */
function LinesView({ lines, currency, taxRate, taxName }: { lines: Line[]; currency: string; taxRate: string; taxName: string }) {
  const t = useT();
  const fmt = (c: number) => {
    try {
      return new Intl.NumberFormat(t.intl, { style: "currency", currency, minimumFractionDigits: 2 }).format(c / 100);
    } catch {
      return (c / 100).toFixed(2);
    }
  };
  const lineTotal = (l: Line) => Math.round(Number(l.quantity || 0) * Math.round(Number((l.unitPrice || "0").replace(/,/g, "")) * 100));
  const subtotal = lines.reduce((s, l) => s + lineTotal(l), 0);
  const tax = Math.round((subtotal * Number(taxRate || 0)) / 100);
  return (
    <div className="grid gap-3">
      <div className="relative overflow-x-auto rounded-xl border">
        <table className="w-full min-w-[32rem] text-sm">
          <thead className="bg-muted/50 text-xs text-muted-foreground">
            <tr>
              <th className="px-3 py-2 text-start font-medium">{t("Description")}</th>
              <th className="px-3 py-2 text-end font-medium">{t("Qty")}</th>
              <th className="px-3 py-2 text-end font-medium">{t("Unit price")}</th>
              <th className="px-3 py-2 text-end font-medium">{t("Amount")}</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {lines.map((l, i) => (
              <tr key={i}>
                <td className="px-3 py-2.5" dir="auto">
                  {l.description}
                </td>
                <td className="px-3 py-2.5 text-end tabular-nums">
                  {l.quantity} {l.unit && <span className="text-muted-foreground">{l.unit}</span>}
                </td>
                <td className="px-3 py-2.5 text-end tabular-nums">{fmt(Math.round(Number((l.unitPrice || "0").replace(/,/g, "")) * 100))}</td>
                <td className="px-3 py-2.5 text-end font-medium tabular-nums">{fmt(lineTotal(l))}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <dl className="ms-auto grid w-full max-w-xs gap-1.5 text-sm">
        <div className="flex justify-between gap-4">
          <dt className="text-muted-foreground">{t("Subtotal")}</dt>
          <dd className="tabular-nums">{fmt(subtotal)}</dd>
        </div>
        {tax !== 0 && (
          <div className="flex justify-between gap-4">
            <dt className="text-muted-foreground">
              {taxName} ({taxRate}%)
            </dt>
            <dd className="tabular-nums">{fmt(tax)}</dd>
          </div>
        )}
        <div className="flex justify-between gap-4 border-t pt-1.5 font-semibold">
          <dt>{t("Total")}</dt>
          <dd className="tabular-nums">{fmt(subtotal + tax)}</dd>
        </div>
      </dl>
    </div>
  );
}
