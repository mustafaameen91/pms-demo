"use client";

import { useState, useTransition } from "react";
import { Banknote, Check, Landmark, Loader2, Plus, Receipt, Wallet, X } from "lucide-react";
import { toast } from "sonner";
import { setupFinance, type SetupInput } from "@/lib/actions/finance";
import { MONEY_KINDS } from "@/lib/finance/core";
import { CURRENCIES } from "@/lib/constants";
import { cn } from "@/lib/utils";
import { useT } from "@/i18n/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SelectBox } from "@/components/ui/select-box";
import { FieldError } from "@/components/projects/project-fields";

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

/** A numbered block of the setup form. */
function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <section className="grid gap-4 rounded-2xl border bg-card p-5 sm:grid-cols-[2.5rem_1fr]">
      <span aria-hidden className="grid size-9 place-items-center rounded-full bg-primary/10 text-sm font-bold text-primary">
        {n}
      </span>
      <div className="grid gap-4">
        <h2 className="text-base font-semibold">{title}</h2>
        {children}
      </div>
    </section>
  );
}

/** One screen to start the books: currency, year, tax, cash and bank accounts, and what to bring in. */
export function FinanceSetup({ slug, today, currency, invoiceDocs, suppliers }: { slug: string; today: string; currency: string; invoiceDocs: number; suppliers: number }) {
  const t = useT();
  const [f, setF] = useState<SetupInput>({
    baseCurrency: currency,
    fiscalYearStart: 1,
    startDate: `${today.slice(0, 4)}-01-01`,
    taxName: "VAT",
    taxRate: "0",
    taxNumber: "",
    moneyAccounts: [{ name: t("Main cash box"), kind: "cash", currency, openingBalance: "0" }],
    importInvoices: true,
    importSuppliers: true,
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [pending, start] = useTransition();
  const accounts = f.moneyAccounts;
  const setAcc = (i: number, patch: Partial<(typeof accounts)[number]>) => setF({ ...f, moneyAccounts: accounts.map((a, j) => (j === i ? { ...a, ...patch } : a)) });
  const currencies = [...new Set([f.baseCurrency, ...CURRENCIES])];
  return (
    <form
      className="mx-auto grid w-full max-w-3xl gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        setErrors({});
        start(async () => {
          const res = await setupFinance(slug, f);
          if (!res.ok) {
            setErrors(res.fieldErrors ?? { form: res.error });
            return void toast.error(res.error);
          }
          toast.success(t("Finance is ready"));
        });
      }}
    >
      <div className="relative isolate overflow-hidden rounded-2xl border bg-card p-6 text-center">
        <div aria-hidden className="absolute -top-24 left-1/2 -z-10 size-72 -translate-x-1/2 rounded-full bg-primary/15 blur-3xl" />
        <span aria-hidden className="mx-auto mb-3 grid size-14 place-items-center rounded-2xl bg-brand text-white shadow-md">
          <Landmark className="size-6" />
        </span>
        <h1 className="text-2xl font-bold tracking-tight">{t("Set up your books")}</h1>
        <p className="mx-auto mt-1 max-w-xl text-sm text-muted-foreground">
          {t("Answer four short questions. After that, invoices, payments, project expenses, loans and payroll go into the books by themselves.")}
        </p>
      </div>

      <Step n={1} title={t("Money and dates")}>
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="grid gap-1.5">
            <Label htmlFor="fs-cur">{t("Main currency")}</Label>
            <SelectBox id="fs-cur" className="h-9 w-full" value={f.baseCurrency} onValueChange={(v) => setF({ ...f, baseCurrency: v, moneyAccounts: accounts.map((a, i) => (i === 0 ? { ...a, currency: v } : a)) })}>
              {currencies.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </SelectBox>
            <p className="text-xs text-muted-foreground">{t("Reports are in this currency. Can't change later.")}</p>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="fs-year">{t("Financial year starts in")}</Label>
            <SelectBox id="fs-year" className="h-9 w-full" value={String(f.fiscalYearStart)} onValueChange={(v) => setF({ ...f, fiscalYearStart: Number(v) })}>
              {MONTHS.map((m, i) => (
                <option key={m} value={String(i + 1)}>
                  {t(m)}
                </option>
              ))}
            </SelectBox>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="fs-start">{t("Start the books on")}</Label>
            <Input id="fs-start" type="date" value={f.startDate} max={today} onChange={(e) => setF({ ...f, startDate: e.target.value })} aria-invalid={Boolean(errors.startDate)} />
            <p className="text-xs text-muted-foreground">{t("Records from this date on go into the books.")}</p>
          </div>
        </div>
      </Step>

      <Step n={2} title={t("Sales tax")}>
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="grid gap-1.5">
            <Label htmlFor="fs-taxname">{t("Name on invoices")}</Label>
            <Input id="fs-taxname" value={f.taxName} onChange={(e) => setF({ ...f, taxName: e.target.value })} maxLength={20} placeholder="VAT" />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="fs-taxrate">{t("Usual rate")}</Label>
            <div className="flex items-center gap-2">
              <Input id="fs-taxrate" inputMode="decimal" dir="ltr" className="w-24" value={f.taxRate} onChange={(e) => setF({ ...f, taxRate: e.target.value })} aria-invalid={Boolean(errors.taxRate)} />
              <span className="text-sm text-muted-foreground">%</span>
            </div>
            <FieldError message={errors.taxRate} />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="fs-taxno">
              {t("Tax number")} <span className="font-normal text-muted-foreground">{t("(optional)")}</span>
            </Label>
            <Input id="fs-taxno" dir="ltr" value={f.taxNumber ?? ""} onChange={(e) => setF({ ...f, taxNumber: e.target.value })} maxLength={60} />
          </div>
        </div>
        <p className="text-xs text-muted-foreground">{t("Leave the rate at 0 if you don't charge sales tax.")}</p>
      </Step>

      <Step n={3} title={t("Where your money is")}>
        <p className="-mt-2 text-sm text-muted-foreground">{t("Cash boxes, bank accounts and wallets, with what was in each on the start date.")}</p>
        <ul className="grid gap-3">
          {accounts.map((a, i) => {
            const Icon = a.kind === "bank" ? Landmark : a.kind === "wallet" ? Wallet : Banknote;
            return (
              <li key={i} className="grid gap-3 rounded-xl border p-3 sm:grid-cols-[auto_1fr_8rem_6rem_9rem_auto] sm:items-end">
                <span aria-hidden className="hidden size-9 place-items-center rounded-lg bg-muted text-muted-foreground sm:grid">
                  <Icon className="size-4" />
                </span>
                <div className="grid gap-1.5">
                  <Label htmlFor={`fs-a${i}-name`}>{t("Name")}</Label>
                  <Input id={`fs-a${i}-name`} dir="auto" value={a.name} onChange={(e) => setAcc(i, { name: e.target.value })} maxLength={80} />
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor={`fs-a${i}-kind`}>{t("Kind")}</Label>
                  <SelectBox id={`fs-a${i}-kind`} className="h-9 w-full" value={a.kind} onValueChange={(v) => setAcc(i, { kind: v })}>
                    {MONEY_KINDS.map((k) => (
                      <option key={k.value} value={k.value}>
                        {t(k.label)}
                      </option>
                    ))}
                  </SelectBox>
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor={`fs-a${i}-cur`}>{t("Currency")}</Label>
                  <SelectBox id={`fs-a${i}-cur`} className="h-9 w-full" value={a.currency} onValueChange={(v) => setAcc(i, { currency: v })}>
                    {currencies.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </SelectBox>
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor={`fs-a${i}-open`}>{t("Balance on start date")}</Label>
                  <Input id={`fs-a${i}-open`} inputMode="decimal" dir="ltr" value={a.openingBalance ?? ""} onChange={(e) => setAcc(i, { openingBalance: e.target.value })} />
                </div>
                <Button type="button" variant="ghost" size="icon" aria-label={t("Remove")} disabled={accounts.length === 1} onClick={() => setF({ ...f, moneyAccounts: accounts.filter((_, j) => j !== i) })}>
                  <X className="size-4" />
                </Button>
              </li>
            );
          })}
        </ul>
        <Button type="button" variant="outline" size="sm" className="justify-self-start" onClick={() => setF({ ...f, moneyAccounts: [...accounts, { name: t("Bank account"), kind: "bank", currency: f.baseCurrency, openingBalance: "0" }] })}>
          <Plus className="size-4" />
          {t("Add an account")}
        </Button>
        <FieldError message={errors.moneyAccounts} />
      </Step>

      <Step n={4} title={t("Bring in what you already have")}>
        {[
          { key: "importInvoices" as const, icon: Receipt, label: t.plural(invoiceDocs, "Move {count} invoice from project documents into Finance", "Move {count} invoices from project documents into Finance"), hint: t("They keep their numbers and letterhead. Issued ones count as owed to you.") },
          { key: "importSuppliers" as const, icon: Landmark, label: t.plural(suppliers, "Add {count} supplier from Resources", "Add {count} suppliers from Resources"), hint: t("So you can record their bills and payments.") },
        ].map((o) => (
          <label key={o.key} className={cn("flex cursor-pointer items-start gap-3 rounded-xl border p-3 text-sm transition-colors", f[o.key] && "border-primary/40 bg-primary/5")}>
            <input type="checkbox" className="mt-0.5 size-4 accent-primary" checked={Boolean(f[o.key])} onChange={(e) => setF({ ...f, [o.key]: e.target.checked })} />
            <span>
              <span className="block font-medium">{o.label}</span>
              <span className="block text-xs text-muted-foreground">{o.hint}</span>
            </span>
          </label>
        ))}
      </Step>

      <FieldError message={errors.form} />
      <div className="flex justify-end">
        <Button type="submit" size="lg" disabled={pending}>
          {pending ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
          {t("Start the books")}
        </Button>
      </div>
    </form>
  );
}
