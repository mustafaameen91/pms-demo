"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { ArrowLeftRight, Banknote, Landmark, Loader2, Plus, Trash2, Wallet } from "lucide-react";
import { toast } from "sonner";
import { deleteTransfer, saveLedgerAccount, saveTransfer } from "@/lib/actions/finance";
import { MONEY_KINDS } from "@/lib/finance/core";
import { CURRENCIES } from "@/lib/constants";
import { todayISO } from "@/lib/accomplishment";
import { cn, formatDate, formatMoney } from "@/lib/utils";
import { useT } from "@/i18n/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SelectBox } from "@/components/ui/select-box";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { FieldError } from "@/components/projects/project-fields";
import { Panel } from "@/components/page/kit";

type MoneyAcc = { id: string; code: string; name: string; kind: string; currency: string; bankName: string | null; accountNumber: string | null; own: number; base: number; isDefault: boolean; archived: boolean };
const ICON: Record<string, typeof Banknote> = { cash: Banknote, bank: Landmark, wallet: Wallet };

export function MoneyAccounts({ slug, accounts, baseCurrency, transfers }: { slug: string; accounts: MoneyAcc[]; baseCurrency: string; transfers: { id: string; date: string; from: string; to: string; amount: string; fromCurrency: string; note: string | null; locked: boolean }[] }) {
  const t = useT();
  const [adding, setAdding] = useState(false);
  const [moving, setMoving] = useState(false);
  const [, start] = useTransition();
  const active = accounts.filter((a) => !a.archived);
  return (
    <div className="grid grid-cols-1 gap-6">
      <div className="flex flex-wrap justify-end gap-2">
        <Button variant="outline" onClick={() => setMoving(true)} disabled={active.length < 2}>
          <ArrowLeftRight className="size-4" />
          {t("Move money between accounts")}
        </Button>
        <Button onClick={() => setAdding(true)}>
          <Plus className="size-4" />
          {t("Add account")}
        </Button>
      </div>
      <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {active.map((a) => {
          const Icon = ICON[a.kind] ?? Banknote;
          return (
            <li key={a.id}>
              <Link href={`/w/${slug}/finance/accounts/${a.id}`} className="group relative flex h-full flex-col gap-3 overflow-hidden rounded-2xl border bg-card p-5 transition-all hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-md focus-visible:outline-2 focus-visible:outline-ring motion-reduce:hover:translate-y-0">
                <div className="flex items-start gap-3">
                  <span aria-hidden className="grid size-10 place-items-center rounded-xl bg-primary/10 text-primary">
                    <Icon className="size-5" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold group-hover:text-primary" dir="auto">
                      {a.name}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                      {t(MONEY_KINDS.find((k) => k.value === a.kind)?.label ?? "")}
                      {a.bankName && ` · ${a.bankName}`}
                      {a.isDefault && ` · ${t("default")}`}
                    </p>
                  </div>
                </div>
                <p className={cn("text-3xl font-bold tracking-tight tabular-nums", a.own < 0 && "text-destructive")}>{formatMoney(a.own / 100, a.currency, t.intl)}</p>
                {a.currency !== baseCurrency && <p className="text-xs text-muted-foreground">{t("≈ {amount} in the books", { amount: formatMoney(a.base / 100, baseCurrency, t.intl) })}</p>}
              </Link>
            </li>
          );
        })}
      </ul>

      <Panel id="fin-transfers" title={t("Transfers")} icon={ArrowLeftRight} count={transfers.length}>
        {transfers.length === 0 ? (
          <p className="px-5 pb-5 text-sm text-muted-foreground">{t("Moving cash to the bank, or between banks, shows here.")}</p>
        ) : (
          <ul className="divide-y border-t">
            {transfers.slice(0, 50).map((tr) => (
              <li key={tr.id} className="flex flex-wrap items-center gap-3 px-5 py-2.5 text-sm">
                <span className="w-28 text-muted-foreground">{formatDate(tr.date, t.intl)}</span>
                <span className="min-w-0 flex-1" dir="auto">
                  {tr.from} → {tr.to}
                  {tr.note && <span className="text-muted-foreground"> · {tr.note}</span>}
                </span>
                <span className="font-semibold tabular-nums">{formatMoney(tr.amount, tr.fromCurrency, t.intl)}</span>
                {!tr.locked && (
                  <Button variant="ghost" size="icon" className="size-8 text-muted-foreground hover:text-destructive" aria-label={t("Delete")} onClick={() => confirm(t("Delete this transfer?")) && start(async () => void (await deleteTransfer(slug, tr.id)))}>
                    <Trash2 className="size-4" />
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <AddMoneyAccount slug={slug} open={adding} onOpenChange={setAdding} baseCurrency={baseCurrency} nextCode={String(Math.max(1100, ...accounts.map((a) => Number(a.code) || 0)) + 1)} />
      <TransferDialog slug={slug} open={moving} onOpenChange={setMoving} accounts={active} />
    </div>
  );
}

function AddMoneyAccount({ slug, open, onOpenChange, baseCurrency, nextCode }: { slug: string; open: boolean; onOpenChange: (o: boolean) => void; baseCurrency: string; nextCode: string }) {
  const t = useT();
  const blank = { name: "", kind: "bank", currency: baseCurrency, bankName: "", accountNumber: "", openingBalance: "0", code: nextCode };
  const [f, setF] = useState(blank);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [pending, start] = useTransition();
  return (
    <Dialog open={open} onOpenChange={(o) => (onOpenChange(o), o && (setF(blank), setErrors({})))}>
      <DialogContent className="sm:max-w-md">
        <form
          className="grid gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            start(async () => {
              const res = await saveLedgerAccount(slug, null, { ...f, type: "asset", moneyKind: f.kind });
              if (!res.ok) return setErrors(res.fieldErrors ?? { form: res.error });
              toast.success(t("Account added"));
              onOpenChange(false);
            });
          }}
        >
          <DialogHeader>
            <DialogTitle>{t("Add account")}</DialogTitle>
            <DialogDescription>{t("The opening balance is what it held on the day the books start.")}</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-1.5 sm:col-span-2">
              <Label htmlFor="ma-name">{t("Name")}</Label>
              <Input id="ma-name" dir="auto" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} maxLength={80} aria-invalid={Boolean(errors.name)} />
              <FieldError message={errors.name} />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="ma-kind">{t("Kind")}</Label>
              <SelectBox id="ma-kind" className="h-9 w-full" value={f.kind} onValueChange={(v) => setF({ ...f, kind: v })}>
                {MONEY_KINDS.map((k) => (
                  <option key={k.value} value={k.value}>
                    {t(k.label)}
                  </option>
                ))}
              </SelectBox>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="ma-cur">{t("Currency")}</Label>
              <SelectBox id="ma-cur" className="h-9 w-full" value={f.currency} onValueChange={(v) => setF({ ...f, currency: v })}>
                {[...new Set([baseCurrency, ...CURRENCIES])].map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </SelectBox>
            </div>
            {f.kind === "bank" && (
              <>
                <div className="grid gap-1.5">
                  <Label htmlFor="ma-bank">{t("Bank")}</Label>
                  <Input id="ma-bank" dir="auto" value={f.bankName} onChange={(e) => setF({ ...f, bankName: e.target.value })} maxLength={120} />
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="ma-no">{t("Account number / IBAN")}</Label>
                  <Input id="ma-no" dir="ltr" value={f.accountNumber} onChange={(e) => setF({ ...f, accountNumber: e.target.value })} maxLength={80} />
                </div>
              </>
            )}
            <div className="grid gap-1.5">
              <Label htmlFor="ma-open">{t("Opening balance")}</Label>
              <Input id="ma-open" dir="ltr" inputMode="decimal" value={f.openingBalance} onChange={(e) => setF({ ...f, openingBalance: e.target.value })} aria-invalid={Boolean(errors.openingBalance)} />
              <FieldError message={errors.openingBalance} />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="ma-code">{t("Account code")}</Label>
              <Input id="ma-code" dir="ltr" value={f.code} onChange={(e) => setF({ ...f, code: e.target.value })} aria-invalid={Boolean(errors.code)} />
              <FieldError message={errors.code} />
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

function TransferDialog({ slug, open, onOpenChange, accounts }: { slug: string; open: boolean; onOpenChange: (o: boolean) => void; accounts: MoneyAcc[] }) {
  const t = useT();
  const blank = () => ({ date: todayISO(), fromAccountId: accounts[0]?.id ?? "", toAccountId: accounts[1]?.id ?? "", amount: "", amountTo: "", note: "" });
  const [f, setF] = useState(blank);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [pending, start] = useTransition();
  const from = accounts.find((a) => a.id === f.fromAccountId);
  const to = accounts.find((a) => a.id === f.toAccountId);
  const cross = from && to && from.currency !== to.currency;
  return (
    <Dialog open={open} onOpenChange={(o) => (onOpenChange(o), o && (setF(blank()), setErrors({})))}>
      <DialogContent className="sm:max-w-md">
        <form
          className="grid gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            start(async () => {
              const res = await saveTransfer(slug, { ...f, amountTo: cross ? f.amountTo : null });
              if (!res.ok) return setErrors(res.fieldErrors ?? { form: res.error });
              toast.success(t("Transfer recorded"));
              onOpenChange(false);
            });
          }}
        >
          <DialogHeader>
            <DialogTitle>{t("Move money between accounts")}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-1.5">
              <Label htmlFor="tr-from">{t("From")}</Label>
              <SelectBox id="tr-from" className="h-9 w-full" value={f.fromAccountId} onValueChange={(v) => setF({ ...f, fromAccountId: v })}>
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name} ({a.currency})
                  </option>
                ))}
              </SelectBox>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="tr-to">{t("To")}</Label>
              <SelectBox id="tr-to" className="h-9 w-full" value={f.toAccountId} onValueChange={(v) => setF({ ...f, toAccountId: v })} aria-invalid={Boolean(errors.toAccountId)}>
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name} ({a.currency})
                  </option>
                ))}
              </SelectBox>
              <FieldError message={errors.toAccountId} />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="tr-amount">
                {t("Amount")} ({from?.currency})
              </Label>
              <Input id="tr-amount" dir="ltr" inputMode="decimal" value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} aria-invalid={Boolean(errors.amount)} />
              <FieldError message={errors.amount} />
            </div>
            {cross ? (
              <div className="grid gap-1.5">
                <Label htmlFor="tr-amount-to">
                  {t("Arrived")} ({to?.currency})
                </Label>
                <Input id="tr-amount-to" dir="ltr" inputMode="decimal" value={f.amountTo} onChange={(e) => setF({ ...f, amountTo: e.target.value })} />
              </div>
            ) : (
              <div className="grid gap-1.5">
                <Label htmlFor="tr-date">{t("Date")}</Label>
                <Input id="tr-date" type="date" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} />
              </div>
            )}
            {cross && (
              <div className="grid gap-1.5">
                <Label htmlFor="tr-date2">{t("Date")}</Label>
                <Input id="tr-date2" type="date" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} />
              </div>
            )}
            <div className="grid gap-1.5 sm:col-span-2">
              <Label htmlFor="tr-note">
                {t("Note")} <span className="font-normal text-muted-foreground">{t("(optional)")}</span>
              </Label>
              <Input id="tr-note" dir="auto" value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} maxLength={300} />
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
