"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Gauge, ListOrdered, Loader2, NotebookPen, Plus, Save, Search, UserRound } from "lucide-react";
import { toast } from "sonner";
import { saveInvoice, type InvoiceInput } from "@/lib/actions/finance";
import { progressBilling } from "@/lib/finance/core";
import { CURRENCIES } from "@/lib/constants";
import { addDays } from "@/lib/hr-rules";
import { cn, formatDate, formatMoney } from "@/lib/utils";
import { useT } from "@/i18n/client";
import { intlLocale } from "@/i18n/config";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { SelectBox } from "@/components/ui/select-box";
import { FieldError } from "@/components/projects/project-fields";
import { EmptyState } from "@/components/page/kit";
import { ContactDialog, DocSummary, LinesEditor, StateBadge, type ContactLite, type DocState } from "./ui";

export type InvoiceListRow = {
  id: string;
  code: string;
  contact: string;
  project: string | null;
  date: string;
  dueDate: string;
  currency: string;
  total: number;
  open: number;
  state: DocState;
};

const FILTERS: { key: string; label: string; match: (s: DocState) => boolean }[] = [
  { key: "all", label: "All", match: () => true },
  { key: "unpaid", label: "Unpaid", match: (s) => s === "open" || s === "partial" || s === "overdue" },
  { key: "overdue", label: "Overdue", match: (s) => s === "overdue" },
  { key: "paid", label: "Paid|invoice", match: (s) => s === "paid" },
  { key: "draft", label: "Draft", match: (s) => s === "draft" },
];

/** Invoices or bills, searchable, with a status filter. */
export function DocList({ rows, hrefBase, newHref, newLabel, kind }: { rows: InvoiceListRow[]; hrefBase: string; newHref?: string; newLabel: string; kind: "invoice" | "bill" }) {
  const t = useT();
  const [q, setQ] = useState("");
  const [f, setF] = useState("all");
  const shown = useMemo(() => {
    const n = q.trim().toLowerCase();
    const flt = FILTERS.find((x) => x.key === f)!;
    return rows.filter((r) => flt.match(r.state) && (!n || [r.code, r.contact, r.project].some((v) => v?.toLowerCase().includes(n))));
  }, [rows, q, f]);
  const totals = new Map<string, number>();
  for (const r of shown) if (r.state !== "draft" && r.state !== "cancelled") totals.set(r.currency, (totals.get(r.currency) ?? 0) + r.open);
  if (rows.length === 0)
    return (
      <EmptyState
        icon={Plus}
        title={kind === "invoice" ? t("No invoices yet") : t("No bills yet")}
        action={
          newHref && (
            <Button asChild>
              <Link href={newHref}>
                <Plus className="size-4" />
                {newLabel}
              </Link>
            </Button>
          )
        }
      >
        {kind === "invoice" ? t("Bill a customer for a project, or for anything else you sell.") : t("Record what suppliers bill you, so you know what you owe and when.")}
      </EmptyState>
    );
  return (
    <section className="overflow-hidden rounded-2xl border bg-card">
      <div className="flex flex-wrap items-center gap-2 border-b px-4 py-3">
        <div className="relative min-w-48 flex-1">
          <Search className="pointer-events-none absolute top-1/2 size-4 -translate-y-1/2 text-muted-foreground inset-s-3" aria-hidden />
          <Input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("Search number, name, project…")} aria-label={t("Search")} className="h-9 ps-9" />
        </div>
        <div role="radiogroup" aria-label={t("Status")} className="inline-flex flex-wrap rounded-lg border p-0.5 text-sm">
          {FILTERS.map((x) => (
            <button
              key={x.key}
              type="button"
              role="radio"
              aria-checked={f === x.key}
              onClick={() => setF(x.key)}
              className="cursor-pointer rounded-md px-2.5 py-1 text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring aria-checked:bg-primary/10 aria-checked:font-medium aria-checked:text-primary"
            >
              {t(x.label)} <span className="text-xs tabular-nums opacity-70">{rows.filter((r) => x.match(r.state)).length}</span>
            </button>
          ))}
        </div>
        {newHref && (
          <Button asChild>
            <Link href={newHref}>
              <Plus className="size-4" />
              {newLabel}
            </Link>
          </Button>
        )}
      </div>
      {shown.length === 0 ? (
        <p className="px-4 py-10 text-center text-sm text-muted-foreground">{t("Nothing matches.")}</p>
      ) : (
        <div className="relative overflow-x-auto">
          <table className="w-full min-w-[44rem] text-sm">
            <thead>
              <tr className="border-b text-xs text-muted-foreground">
                <th className="px-4 py-2.5 text-start font-medium">{t("Number")}</th>
                <th className="px-3 py-2.5 text-start font-medium">{kind === "invoice" ? t("Customer") : t("Supplier")}</th>
                <th className="px-3 py-2.5 text-start font-medium">{t("Date")}</th>
                <th className="px-3 py-2.5 text-start font-medium">{t("Due")}</th>
                <th className="px-3 py-2.5 text-end font-medium">{t("Total")}</th>
                <th className="px-3 py-2.5 text-end font-medium">{t("Still to pay")}</th>
                <th className="px-4 py-2.5 text-end font-medium">{t("Status")}</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((r) => (
                <tr key={r.id} className="border-b last:border-0 hover:bg-muted/40">
                  <td className="px-4 py-2.5">
                    <Link href={`${hrefBase}/${r.id}`} className="font-medium text-primary hover:underline" dir="ltr">
                      {r.code}
                    </Link>
                  </td>
                  <td className="px-3 py-2.5">
                    <span className="block max-w-56 truncate font-medium" dir="auto">
                      {r.contact}
                    </span>
                    {r.project && (
                      <span className="block max-w-56 truncate text-xs text-muted-foreground" dir="auto">
                        {r.project}
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2.5 whitespace-nowrap text-muted-foreground">{formatDate(r.date, t.intl)}</td>
                  <td className={cn("px-3 py-2.5 whitespace-nowrap", r.state === "overdue" ? "font-medium text-destructive" : "text-muted-foreground")}>{formatDate(r.dueDate, t.intl)}</td>
                  <td className="px-3 py-2.5 text-end tabular-nums">{formatMoney(r.total / 100, r.currency, t.intl)}</td>
                  <td className="px-3 py-2.5 text-end font-semibold tabular-nums">{r.state === "draft" || r.state === "cancelled" ? "—" : formatMoney(r.open / 100, r.currency, t.intl)}</td>
                  <td className="px-4 py-2.5 text-end">
                    <StateBadge state={r.state} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {totals.size > 0 && (
        <p className="border-t px-4 py-2.5 text-end text-sm">
          <span className="text-muted-foreground">{t("Still to pay, shown:")} </span>
          <span className="font-semibold tabular-nums">{[...totals].map(([c, v]) => formatMoney(v / 100, c, t.intl)).join(" · ")}</span>
        </p>
      )}
    </section>
  );
}

type ProjectInfo = { id: string; name: string; key: string; currency: string; client: string | null; progress: number | null; contractValue: string | null; billedBefore: number };

/** Create or edit an invoice; a project can fill in a progress line from its accomplishment. */
export function InvoiceEditor({
  slug,
  invoiceId,
  initial,
  contacts,
  projects,
  baseCurrency,
  taxName,
  paymentTermsDays,
}: {
  slug: string;
  invoiceId: string | null;
  initial: InvoiceInput;
  contacts: ContactLite[];
  projects: ProjectInfo[];
  baseCurrency: string;
  taxName: string;
  paymentTermsDays: number;
}) {
  const t = useT();
  const router = useRouter();
  const [f, setF] = useState<InvoiceInput>(initial);
  const [list, setList] = useState(contacts);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [newContact, setNewContact] = useState(false);
  const [contract, setContract] = useState<string>("");
  const [pending, start] = useTransition();
  const project = projects.find((p) => p.id === f.projectId);
  const currencies = [...new Set([f.currency, baseCurrency, ...CURRENCIES])];
  const items = (f.items ?? []).map((i) => ({ ...i, unit: i.unit ?? "" }));

  const pickProject = (id: string) => {
    const p = projects.find((x) => x.id === id);
    const customer = p?.client ? list.find((c) => c.name.trim().toLowerCase() === p.client!.trim().toLowerCase()) : undefined;
    setF({ ...f, projectId: id || null, currency: p && items.every((i) => !i.unitPrice) ? p.currency : f.currency, contactId: f.contactId || customer?.id || "", subject: f.subject || p?.name || "" });
    setContract(p?.contractValue ?? "");
  };
  const addProgress = () => {
    if (!project) return;
    const value = Number((contract || "0").replace(/,/g, ""));
    if (!value) return setErrors({ contract: t("Enter the contract value") });
    const pct = project.progress ?? 0;
    const b = progressBilling(value, pct, project.billedBefore);
    if (b.thisInvoice <= 0) return setErrors({ contract: t("Nothing new to bill: {billed} was already billed for {pct}% done.", { billed: formatMoney(project.billedBefore / 100, f.currency, t.intl), pct: Math.round(pct) }) });
    setErrors({});
    // Written in the invoice's language, not the screen's.
    const intl = intlLocale(f.language === "ar" ? "ar" : "en");
    const vars = { pct: Math.round(pct * 10) / 10, value: formatMoney(value, f.currency, intl), billed: formatMoney(project.billedBefore / 100, f.currency, intl) };
    const desc =
      f.language === "ar"
        ? `الأعمال المنجزة حتى تاريخه: ${vars.pct}% من قيمة العقد (${vars.value})، مطروحًا منها ${vars.billed} سبق إصدار فواتير بها`
        : `Work done to date: ${vars.pct}% of the contract (${vars.value}), less ${vars.billed} billed before`;
    setF({ ...f, progressPercent: String(Math.round(pct * 100) / 100), items: [...items.filter((i) => i.description || i.unitPrice), { description: desc, unit: "", quantity: "1", unitPrice: (b.thisInvoice / 100).toFixed(2) }] });
  };

  return (
    <form
      className="grid grid-cols-1 items-start gap-6 xl:grid-cols-[minmax(0,1fr)_22rem]"
      onSubmit={(e) => {
        e.preventDefault();
        setErrors({});
        start(async () => {
          const res = await saveInvoice(slug, invoiceId, f);
          if (!res.ok) {
            setErrors(res.fieldErrors ?? { form: res.error });
            return void toast.error(res.error);
          }
          toast.success(t("Invoice saved"));
          router.push(`/w/${slug}/finance/invoices/${res.data!.id}`);
        });
      }}
    >
      <div className="grid min-w-0 grid-cols-1 gap-6">
        <section aria-labelledby="in-who" className="grid gap-4 rounded-2xl border bg-card p-5">
          <h2 id="in-who" className="flex items-center gap-2 font-semibold">
            <UserRound className="size-4 text-muted-foreground" aria-hidden />
            {t("Who and when")}
          </h2>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 2xl:grid-cols-4">
            <div className="grid gap-1.5 md:col-span-2">
              <Label htmlFor="in-contact">{t("Customer")}</Label>
              <div className="flex gap-2">
                <SelectBox id="in-contact" className="h-9 min-w-0 flex-1" value={f.contactId} onValueChange={(v) => setF({ ...f, contactId: v, currency: items.every((i) => !i.unitPrice) ? (list.find((c) => c.id === v)?.currency ?? f.currency) : f.currency })} placeholder={t("Choose a customer")} aria-invalid={Boolean(errors.contactId)}>
                  {list.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </SelectBox>
                <Button type="button" variant="outline" onClick={() => setNewContact(true)}>
                  <Plus className="size-4" />
                  {t("New")}
                </Button>
              </div>
              <FieldError message={errors.contactId} />
            </div>
            <div className="grid gap-1.5 md:col-span-2">
              <Label htmlFor="in-project">
                {t("Project")} <span className="font-normal text-muted-foreground">{t("(optional)")}</span>
              </Label>
              <SelectBox id="in-project" className="h-9 w-full" value={f.projectId ?? ""} onValueChange={pickProject}>
                <option value="">{t("Not for a project")}</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} · {p.key}
                  </option>
                ))}
              </SelectBox>
            </div>
            <div className="grid gap-1.5 md:col-span-2">
              <Label htmlFor="in-subject">{t("Subject")}</Label>
              <Input id="in-subject" dir="auto" value={f.subject ?? ""} onChange={(e) => setF({ ...f, subject: e.target.value })} maxLength={200} placeholder={t("e.g. Progress invoice for October")} />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="in-date">{t("Invoice date")}</Label>
              <Input id="in-date" type="date" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value, dueDate: f.dueDate < e.target.value ? addDays(e.target.value, paymentTermsDays) : f.dueDate })} />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="in-due">{t("Due date")}</Label>
              <Input id="in-due" type="date" value={f.dueDate} min={f.date} onChange={(e) => setF({ ...f, dueDate: e.target.value })} aria-invalid={Boolean(errors.dueDate)} />
              <FieldError message={errors.dueDate} />
            </div>
          </div>
        </section>

        {project && (
          <section className="grid gap-3 rounded-2xl border border-primary/30 bg-primary/5 p-5">
            <h2 className="flex items-center gap-2 font-semibold">
              <Gauge className="size-4 text-primary" aria-hidden />
              {t("Bill from progress")}
            </h2>
            <p className="text-sm text-muted-foreground">
              {t("{name} is {pct}% done. Already billed: {billed}.", { name: project.name, pct: Math.round((project.progress ?? 0) * 10) / 10, billed: formatMoney(project.billedBefore / 100, f.currency, t.intl) })}
            </p>
            <div className="flex flex-wrap items-end gap-2">
              <div className="grid gap-1.5">
                <Label htmlFor="in-contract">{t("Contract value")}</Label>
                <Input id="in-contract" dir="ltr" inputMode="decimal" className="w-44" value={contract} onChange={(e) => setContract(e.target.value)} aria-invalid={Boolean(errors.contract)} />
              </div>
              <Button type="button" variant="outline" onClick={addProgress}>
                {t("Add progress line")}
              </Button>
            </div>
            <FieldError message={errors.contract} />
          </section>
        )}

        <section aria-labelledby="in-lines" className="grid gap-4 rounded-2xl border bg-card p-5">
          <h2 id="in-lines" className="flex items-center gap-2 font-semibold">
            <ListOrdered className="size-4 text-muted-foreground" aria-hidden />
            {t("What you're billing")}
          </h2>
          <LinesEditor lines={items} onChange={(l) => setF({ ...f, items: l })} currency={f.currency} taxRate={f.taxRate ?? "0"} retention={f.retentionPercent ?? "0"} taxName={taxName} error={errors.items} hideTotals />
        </section>

        <section aria-labelledby="in-extra" className="grid gap-4 rounded-2xl border bg-card p-5">
          <h2 id="in-extra" className="flex items-center gap-2 font-semibold">
            <NotebookPen className="size-4 text-muted-foreground" aria-hidden />
            {t("On the invoice")}
          </h2>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="grid gap-1.5">
              <Label htmlFor="in-pay">{t("Payment details (bank account)")}</Label>
              <Textarea id="in-pay" dir="auto" rows={4} value={f.paymentDetails ?? ""} onChange={(e) => setF({ ...f, paymentDetails: e.target.value })} maxLength={1000} />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="in-notes">{t("Notes")}</Label>
              <Textarea id="in-notes" dir="auto" rows={4} value={f.notes ?? ""} onChange={(e) => setF({ ...f, notes: e.target.value })} maxLength={2000} />
            </div>
          </div>
        </section>
      </div>

      <aside className="grid gap-4 xl:sticky xl:top-6">
        <DocSummary lines={items} currency={f.currency} taxRate={f.taxRate ?? "0"} retention={f.retentionPercent ?? "0"} taxName={taxName}>
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor="in-cur">{t("Currency")}</Label>
              <SelectBox id="in-cur" className="h-9 w-full" value={f.currency} onValueChange={(v) => setF({ ...f, currency: v })}>
                {currencies.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </SelectBox>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="in-lang">{t("Printed in")}</Label>
              <SelectBox id="in-lang" className="h-9 w-full" value={f.language} onValueChange={(v) => setF({ ...f, language: v as "ar" | "en" })}>
                <option value="ar">العربية</option>
                <option value="en">English</option>
              </SelectBox>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="in-tax">{taxName} %</Label>
              <Input id="in-tax" dir="ltr" inputMode="decimal" value={f.taxRate ?? ""} onChange={(e) => setF({ ...f, taxRate: e.target.value })} aria-invalid={Boolean(errors.taxRate)} />
              <FieldError message={errors.taxRate} />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="in-ret">{t("Retention %")}</Label>
              <Input id="in-ret" dir="ltr" inputMode="decimal" value={f.retentionPercent ?? ""} onChange={(e) => setF({ ...f, retentionPercent: e.target.value })} aria-invalid={Boolean(errors.retentionPercent)} aria-describedby="in-ret-hint" />
              <FieldError message={errors.retentionPercent} />
            </div>
          </div>
          <p id="in-ret-hint" className="-mt-2 text-xs text-muted-foreground">
            {t("Retention: the share the customer holds back until handover.")}
          </p>
          <FieldError message={errors.form} />
          <div className="grid gap-2 border-t pt-4">
            <Button type="submit" disabled={pending} className="w-full">
              {pending ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
              {invoiceId ? t("Save") : t("Save as draft")}
            </Button>
            <Button type="button" variant="ghost" className="w-full" onClick={() => router.back()}>
              {t("Cancel")}
            </Button>
            {!invoiceId && <p className="text-center text-xs text-muted-foreground">{t("A draft doesn't touch the books until you issue it.")}</p>}
          </div>
        </DocSummary>
      </aside>
      <ContactDialog slug={slug} open={newContact} onOpenChange={setNewContact} kind="customer" baseCurrency={baseCurrency} onSaved={(id, name) => (setList([...list, { id, name, kind: "customer", currency: f.currency }]), setF({ ...f, contactId: id }))} />
    </form>
  );
}
