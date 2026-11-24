"use client";

import { useState, useTransition } from "react";
import { AlertTriangle, CircleCheck, CircleDashed, Clock, FileText, Loader2, XCircle } from "lucide-react";
import { toast } from "sonner";
import { saveContact, type ContactInput } from "@/lib/actions/finance";
import { CURRENCIES } from "@/lib/constants";
import { cn } from "@/lib/utils";
import { useT } from "@/i18n/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { SelectBox } from "@/components/ui/select-box";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { FieldError } from "@/components/projects/project-fields";

export type DocState = "draft" | "open" | "partial" | "paid" | "overdue" | "cancelled";

const STATE: Record<DocState, { label: string; icon: typeof Clock; style: string }> = {
  draft: { label: "Draft", icon: FileText, style: "bg-muted text-muted-foreground" },
  open: { label: "Unpaid", icon: CircleDashed, style: "bg-primary/10 text-primary" },
  partial: { label: "Partly paid", icon: Clock, style: "bg-amber-500/15 text-amber-800 dark:text-amber-300" },
  paid: { label: "Paid|invoice", icon: CircleCheck, style: "bg-green-600/10 text-green-700 dark:text-green-400" },
  overdue: { label: "Overdue", icon: AlertTriangle, style: "bg-destructive/10 text-destructive" },
  cancelled: { label: "Cancelled", icon: XCircle, style: "bg-muted text-muted-foreground line-through" },
};

/** Where an invoice or bill stands, with an icon (never colour alone). */
export function StateBadge({ state, className }: { state: DocState; className?: string }) {
  const t = useT();
  const s = STATE[state];
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap", s.style, className)}>
      <s.icon className="size-3.5" aria-hidden />
      {t(s.label)}
    </span>
  );
}

export type ContactLite = { id: string; name: string; kind: string; currency: string | null };

/** Add or edit a customer / supplier. `onSaved` gets the id (e.g. to pick it in a form). */
export function ContactDialog({
  slug,
  open,
  onOpenChange,
  contact,
  kind = "customer",
  baseCurrency,
  onSaved,
}: {
  slug: string;
  open: boolean;
  onOpenChange: (o: boolean) => void;
  contact?: (ContactInput & { id: string }) | null;
  kind?: "customer" | "supplier" | "both";
  baseCurrency: string;
  onSaved?: (id: string, name: string) => void;
}) {
  const t = useT();
  const blank = (): ContactInput => ({ kind, name: "", email: "", phone: "", address: "", taxNumber: "", currency: baseCurrency, notes: "" });
  const [f, setF] = useState<ContactInput>(blank);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [last, setLast] = useState<boolean>(false);
  const [pending, start] = useTransition();
  if (open !== last) {
    setLast(open);
    if (open) {
      setErrors({});
      setF(contact ? { ...contact } : blank());
    }
  }
  const currencies = [...new Set([f.currency || baseCurrency, ...CURRENCIES])];
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
        <form
          className="grid gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            start(async () => {
              const res = await saveContact(slug, contact?.id ?? null, f);
              if (!res.ok) return setErrors(res.fieldErrors ?? { form: res.error });
              toast.success(t("Saved"));
              onOpenChange(false);
              if (res.data) onSaved?.(res.data.id, f.name);
            });
          }}
        >
          <DialogHeader>
            <DialogTitle>{contact ? t("Edit {name}", { name: contact.name }) : f.kind === "supplier" ? t("New supplier") : t("New customer")}</DialogTitle>
            <DialogDescription>{t("Name and contact details print on invoices and statements.")}</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-1.5 sm:col-span-2">
              <Label htmlFor="ct-name">{t("Name")}</Label>
              <Input id="ct-name" dir="auto" autoFocus value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} maxLength={120} aria-invalid={Boolean(errors.name)} />
              <FieldError message={errors.name} />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="ct-kind">{t("Type")}</Label>
              <SelectBox id="ct-kind" className="h-9 w-full" value={f.kind} onValueChange={(v) => setF({ ...f, kind: v as ContactInput["kind"] })}>
                <option value="customer">{t("Customer")}</option>
                <option value="supplier">{t("Supplier")}</option>
                <option value="both">{t("Customer and supplier")}</option>
              </SelectBox>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="ct-cur">{t("Usual currency")}</Label>
              <SelectBox id="ct-cur" className="h-9 w-full" value={f.currency ?? baseCurrency} onValueChange={(v) => setF({ ...f, currency: v })}>
                {currencies.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </SelectBox>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="ct-phone">{t("Phone")}</Label>
              <Input id="ct-phone" type="tel" dir="ltr" value={f.phone ?? ""} onChange={(e) => setF({ ...f, phone: e.target.value })} maxLength={60} />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="ct-email">{t("Email")}</Label>
              <Input id="ct-email" type="email" dir="ltr" value={f.email ?? ""} onChange={(e) => setF({ ...f, email: e.target.value })} maxLength={160} aria-invalid={Boolean(errors.email)} />
              <FieldError message={errors.email} />
            </div>
            <div className="grid gap-1.5 sm:col-span-2">
              <Label htmlFor="ct-address">{t("Address")}</Label>
              <Input id="ct-address" dir="auto" value={f.address ?? ""} onChange={(e) => setF({ ...f, address: e.target.value })} maxLength={300} />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="ct-tax">{t("Tax number")}</Label>
              <Input id="ct-tax" dir="ltr" value={f.taxNumber ?? ""} onChange={(e) => setF({ ...f, taxNumber: e.target.value })} maxLength={60} />
            </div>
            <div className="grid gap-1.5 sm:col-span-2">
              <Label htmlFor="ct-notes">
                {t("Notes")} <span className="font-normal text-muted-foreground">{t("(optional)")}</span>
              </Label>
              <Textarea id="ct-notes" dir="auto" rows={2} value={f.notes ?? ""} onChange={(e) => setF({ ...f, notes: e.target.value })} maxLength={1000} />
            </div>
          </div>
          <FieldError message={errors.form} />
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              {t("Cancel")}
            </Button>
            <Button type="submit" disabled={pending}>
              {pending && <Loader2 className="size-4 animate-spin" />}
              {t("Save")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** Line items: description, unit, quantity, price; totals underneath. */
export function LinesEditor({
  lines,
  onChange,
  currency,
  taxRate,
  retention = "0",
  taxName,
  error,
  hideTotals,
}: {
  lines: { description: string; unit: string; quantity: string; unitPrice: string }[];
  onChange: (l: { description: string; unit: string; quantity: string; unitPrice: string }[]) => void;
  currency: string;
  taxRate: string;
  retention?: string;
  taxName: string;
  error?: string;
  /** The totals are shown elsewhere (the editor's summary panel). */
  hideTotals?: boolean;
}) {
  const t = useT();
  const fmt = (c: number) => {
    try {
      return new Intl.NumberFormat(t.intl, { style: "currency", currency, minimumFractionDigits: 2 }).format(c / 100);
    } catch {
      return (c / 100).toFixed(2);
    }
  };
  const lineTotal = (l: (typeof lines)[number]) => Math.round(Number(l.quantity || 0) * Math.round(Number((l.unitPrice || "0").replace(/,/g, "")) * 100));
  const subtotal = lines.reduce((s, l) => s + lineTotal(l), 0);
  const tax = Math.round((subtotal * Number(taxRate || 0)) / 100);
  const ret = Math.round((subtotal * Number(retention || 0)) / 100);
  const set = (i: number, patch: Partial<(typeof lines)[number]>) => onChange(lines.map((l, j) => (j === i ? { ...l, ...patch } : l)));
  return (
    <div className="grid gap-2">
      <div className="relative overflow-x-auto rounded-xl border">
        <table className="w-full min-w-[36rem] text-sm">
          <thead className="bg-muted/50 text-xs text-muted-foreground">
            <tr>
              <th className="px-3 py-2 text-start font-medium">{t("Description")}</th>
              <th className="w-20 px-2 py-2 text-start font-medium">{t("Unit")}</th>
              <th className="w-24 px-2 py-2 text-end font-medium">{t("Qty")}</th>
              <th className="w-32 px-2 py-2 text-end font-medium">{t("Unit price")}</th>
              <th className="w-32 px-3 py-2 text-end font-medium">{t("Amount")}</th>
              <th className="w-10">
                <span className="sr-only">{t("Remove")}</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {lines.map((l, i) => (
              <tr key={i} className="border-t align-top">
                <td className="p-1.5">
                  <Input dir="auto" aria-label={t("Description of line {n}", { n: i + 1 })} value={l.description} onChange={(e) => set(i, { description: e.target.value })} maxLength={500} />
                </td>
                <td className="p-1.5">
                  <Input dir="auto" aria-label={t("Unit")} value={l.unit} onChange={(e) => set(i, { unit: e.target.value })} maxLength={30} />
                </td>
                <td className="p-1.5">
                  <Input dir="ltr" inputMode="decimal" aria-label={t("Qty")} className="text-end" value={l.quantity} onChange={(e) => set(i, { quantity: e.target.value })} />
                </td>
                <td className="p-1.5">
                  <Input dir="ltr" inputMode="decimal" aria-label={t("Unit price")} className="text-end" value={l.unitPrice} onChange={(e) => set(i, { unitPrice: e.target.value })} />
                </td>
                <td className="px-3 py-3 text-end tabular-nums">{fmt(lineTotal(l))}</td>
                <td className="p-1.5">
                  <Button type="button" variant="ghost" size="icon" className="size-8" aria-label={t("Remove line {n}", { n: i + 1 })} onClick={() => onChange(lines.filter((_, j) => j !== i))} disabled={lines.length === 1}>
                    <XCircle className="size-4" />
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <Button type="button" variant="outline" size="sm" onClick={() => onChange([...lines, { description: "", unit: "", quantity: "1", unitPrice: "" }])} disabled={lines.length >= 200}>
          {t("Add a line")}
        </Button>
        {!hideTotals && <dl className="grid min-w-56 gap-1 text-sm">
          <div className="flex justify-between gap-6">
            <dt className="text-muted-foreground">{t("Subtotal")}</dt>
            <dd className="tabular-nums">{fmt(subtotal)}</dd>
          </div>
          {Number(taxRate) > 0 && (
            <div className="flex justify-between gap-6">
              <dt className="text-muted-foreground">
                {taxName} {Number(taxRate)}%
              </dt>
              <dd className="tabular-nums">{fmt(tax)}</dd>
            </div>
          )}
          <div className="flex justify-between gap-6 border-t pt-1 font-semibold">
            <dt>{t("Total")}</dt>
            <dd className="tabular-nums">{fmt(subtotal + tax)}</dd>
          </div>
          {ret > 0 && (
            <>
              <div className="flex justify-between gap-6 text-muted-foreground">
                <dt>{t("Retention held ({percent}%)", { percent: Number(retention) })}</dt>
                <dd className="tabular-nums">−{fmt(ret)}</dd>
              </div>
              <div className="flex justify-between gap-6 font-semibold">
                <dt>{t("Due now")}</dt>
                <dd className="tabular-nums">{fmt(subtotal + tax - ret)}</dd>
              </div>
            </>
          )}
        </dl>}
      </div>
      <FieldError message={error} />
    </div>
  );
}

const lineCents = (l: { quantity: string; unitPrice: string }) => Math.round(Number(l.quantity || 0) * Math.round(Number((l.unitPrice || "0").replace(/,/g, "")) * 100));

/** The editor's side panel: the total in big type, its breakdown, then the settings and buttons passed in. */
export function DocSummary({
  lines,
  currency,
  taxRate,
  retention = "0",
  taxName,
  children,
}: {
  lines: { quantity: string; unitPrice: string }[];
  currency: string;
  taxRate: string;
  retention?: string;
  taxName: string;
  children: React.ReactNode;
}) {
  const t = useT();
  const fmt = (c: number) => {
    try {
      return new Intl.NumberFormat(t.intl, { style: "currency", currency, minimumFractionDigits: 2 }).format(c / 100);
    } catch {
      return (c / 100).toFixed(2);
    }
  };
  const subtotal = lines.reduce((s, l) => s + lineCents(l), 0);
  const tax = Math.round((subtotal * Number(taxRate || 0)) / 100);
  const ret = Math.round((subtotal * Number(retention || 0)) / 100);
  return (
    <section aria-labelledby="doc-summary" className="overflow-hidden rounded-2xl border bg-card">
      <div className="relative isolate overflow-hidden border-b bg-linear-to-br from-primary/10 via-primary/5 to-transparent px-5 py-5">
        <div aria-hidden className="absolute -top-10 -z-10 size-32 rounded-full bg-brand-accent/15 blur-2xl inset-e-[-2rem]" />
        <h2 id="doc-summary" className="text-sm font-medium text-muted-foreground">
          {ret > 0 ? t("Due now") : t("Total")}
        </h2>
        <p className="mt-1 text-3xl font-bold tracking-tight tabular-nums" aria-live="polite">
          {fmt(subtotal + tax - ret)}
        </p>
        <dl className="mt-4 grid gap-1.5 text-sm">
          <div className="flex justify-between gap-4">
            <dt className="text-muted-foreground">{t("Subtotal")}</dt>
            <dd className="tabular-nums">{fmt(subtotal)}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-muted-foreground">
              {taxName} {Number(taxRate) || 0}%
            </dt>
            <dd className="tabular-nums">{fmt(tax)}</dd>
          </div>
          {ret > 0 && (
            <>
              <div className="flex justify-between gap-4 border-t pt-1.5 font-medium">
                <dt>{t("Total")}</dt>
                <dd className="tabular-nums">{fmt(subtotal + tax)}</dd>
              </div>
              <div className="flex justify-between gap-4 text-muted-foreground">
                <dt>{t("Retention held ({percent}%)", { percent: Number(retention) })}</dt>
                <dd className="tabular-nums">−{fmt(ret)}</dd>
              </div>
            </>
          )}
        </dl>
      </div>
      <div className="grid gap-4 p-5">{children}</div>
    </section>
  );
}
