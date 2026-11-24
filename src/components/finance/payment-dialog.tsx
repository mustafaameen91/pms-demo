"use client";

import { useMemo, useState, useTransition } from "react";
import { ArrowDownLeft, ArrowUpRight, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { savePayment } from "@/lib/actions/finance";
import { todayISO } from "@/lib/accomplishment";
import { cn, formatDate, formatMoney } from "@/lib/utils";
import { useT } from "@/i18n/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SelectBox } from "@/components/ui/select-box";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { FieldError } from "@/components/projects/project-fields";

export type MoneyAccountLite = { id: string; name: string; currency: string };
export type OpenDoc = { id: string; code: string; contactId: string; currency: string; open: number; dueDate: string };

/**
 * Record money received ("in") or paid ("out"). The amount is spread over the
 * contact's open invoices / bills, oldest first; anything left stays on account.
 */
export function PaymentButton({
  slug,
  direction,
  contacts,
  accounts,
  docs,
  contactId,
  docId,
  variant = "default",
  size = "default",
  label,
}: {
  slug: string;
  direction: "in" | "out";
  contacts: { id: string; name: string }[];
  accounts: MoneyAccountLite[];
  docs: OpenDoc[];
  contactId?: string;
  docId?: string;
  variant?: "default" | "outline";
  size?: "default" | "sm";
  label?: string;
}) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const firstDoc = docs.find((d) => d.id === docId);
  const blank = () => {
    const c = contactId ?? firstDoc?.contactId ?? "";
    const cur = firstDoc?.currency;
    const acc = accounts.find((a) => a.currency === cur) ?? accounts[0];
    return { contactId: c, moneyAccountId: acc?.id ?? "", date: todayISO(), amount: firstDoc ? (firstDoc.open / 100).toFixed(2) : "", method: "", reference: "", note: "" };
  };
  const [f, setF] = useState(blank);
  const [split, setSplit] = useState<Record<string, string>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [pending, start] = useTransition();
  const account = accounts.find((a) => a.id === f.moneyAccountId);
  const mine = useMemo(() => docs.filter((d) => d.contactId === f.contactId && d.currency === account?.currency && d.open > 0).sort((a, b) => a.dueDate.localeCompare(b.dueDate)), [docs, f.contactId, account]);
  const otherCurrency = docs.filter((d) => d.contactId === f.contactId && d.open > 0 && d.currency !== account?.currency);

  /** Spread the amount over open documents, oldest first (the chosen one first). */
  const autoSplit = (amount: string, list = mine) => {
    let left = Math.round(Number((amount || "0").replace(/,/g, "")) * 100);
    const order = docId ? [...list.filter((d) => d.id === docId), ...list.filter((d) => d.id !== docId)] : list;
    const out: Record<string, string> = {};
    for (const d of order) {
      const take = Math.max(0, Math.min(left, d.open));
      if (take > 0) out[d.id] = (take / 100).toFixed(2);
      left -= take;
    }
    setSplit(out);
  };
  const total = Math.round(Number((f.amount || "0").replace(/,/g, "")) * 100);
  const used = Object.values(split).reduce((s, v) => s + Math.round(Number(v || 0) * 100), 0);
  const fmt = (c: number) => formatMoney(c / 100, account?.currency ?? "USD", t.intl);

  return (
    <>
      <Button
        variant={variant}
        size={size}
        onClick={() => {
          const b = blank();
          setF(b);
          setErrors({});
          setOpen(true);
          const acc = accounts.find((a) => a.id === b.moneyAccountId);
          autoSplit(b.amount, docs.filter((d) => d.contactId === b.contactId && d.currency === acc?.currency && d.open > 0).sort((a, c) => a.dueDate.localeCompare(c.dueDate)));
        }}
      >
        {direction === "in" ? <ArrowDownLeft className="size-4" /> : <ArrowUpRight className="size-4" />}
        {label ?? (direction === "in" ? t("Record money received") : t("Record a payment"))}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
          <form
            className="grid gap-4"
            onSubmit={(e) => {
              e.preventDefault();
              setErrors({});
              start(async () => {
                const res = await savePayment(slug, {
                  direction,
                  ...f,
                  allocations: Object.entries(split).map(([id, amount]) => (direction === "in" ? { invoiceId: id, amount } : { billId: id, amount })),
                });
                if (!res.ok) return setErrors(res.fieldErrors ?? { form: res.error });
                toast.success(direction === "in" ? t("Payment received") : t("Payment recorded"));
                setOpen(false);
              });
            }}
          >
            <DialogHeader>
              <DialogTitle>{direction === "in" ? t("Money received") : t("Payment to a supplier")}</DialogTitle>
              <DialogDescription>{direction === "in" ? t("It settles their open invoices, oldest first. Anything extra is kept as an advance.") : t("It settles their open bills, oldest first. Anything extra is kept as an advance.")}</DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-1.5 sm:col-span-2">
                <Label htmlFor="pay-contact">{direction === "in" ? t("From") : t("To")}</Label>
                <SelectBox
                  id="pay-contact"
                  className="h-9 w-full"
                  value={f.contactId}
                  onValueChange={(v) => {
                    setF({ ...f, contactId: v });
                    autoSplit(f.amount, docs.filter((d) => d.contactId === v && d.currency === account?.currency && d.open > 0).sort((a, b) => a.dueDate.localeCompare(b.dueDate)));
                  }}
                  placeholder={t("Choose who")}
                  aria-invalid={Boolean(errors.contactId)}
                >
                  {contacts.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </SelectBox>
                <FieldError message={errors.contactId} />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="pay-acc">{direction === "in" ? t("Into") : t("Paid from")}</Label>
                <SelectBox
                  id="pay-acc"
                  className="h-9 w-full"
                  value={f.moneyAccountId}
                  onValueChange={(v) => {
                    setF({ ...f, moneyAccountId: v });
                    const cur = accounts.find((a) => a.id === v)?.currency;
                    autoSplit(f.amount, docs.filter((d) => d.contactId === f.contactId && d.currency === cur && d.open > 0).sort((a, b) => a.dueDate.localeCompare(b.dueDate)));
                  }}
                >
                  {accounts.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name} ({a.currency})
                    </option>
                  ))}
                </SelectBox>
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="pay-date">{t("Date")}</Label>
                <Input id="pay-date" type="date" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="pay-amount">
                  {t("Amount")} <span className="font-normal text-muted-foreground">({account?.currency})</span>
                </Label>
                <Input
                  id="pay-amount"
                  dir="ltr"
                  inputMode="decimal"
                  value={f.amount}
                  onChange={(e) => {
                    setF({ ...f, amount: e.target.value });
                    autoSplit(e.target.value);
                  }}
                  aria-invalid={Boolean(errors.amount)}
                />
                <FieldError message={errors.amount} />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="pay-ref">{t("Reference")}</Label>
                <Input id="pay-ref" dir="auto" value={f.reference} onChange={(e) => setF({ ...f, reference: e.target.value })} placeholder={t("Cheque or transfer no.")} maxLength={80} />
              </div>
            </div>
            {mine.length > 0 && (
              <fieldset className="grid gap-2 rounded-xl border p-3">
                <legend className="px-1 text-sm font-medium">{direction === "in" ? t("Settles these invoices") : t("Settles these bills")}</legend>
                {mine.map((d) => (
                  <label key={d.id} className="flex items-center gap-3 text-sm">
                    <span className="min-w-0 flex-1">
                      <span className="font-medium" dir="ltr">
                        {d.code}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {" "}
                        · {t("due {date}", { date: formatDate(d.dueDate, t.intl) })} · {t("{amount} open", { amount: fmt(d.open) })}
                      </span>
                    </span>
                    <Input dir="ltr" inputMode="decimal" className="h-8 w-28 text-end" aria-label={t("Amount for {code}", { code: d.code })} value={split[d.id] ?? ""} onChange={(e) => setSplit({ ...split, [d.id]: e.target.value })} placeholder="0" />
                  </label>
                ))}
                <p className={cn("text-xs", used > total ? "text-destructive" : "text-muted-foreground")}>
                  {used > total ? t("You've split more than the payment amount.") : total - used > 0 ? t("{amount} kept as an advance", { amount: fmt(total - used) }) : t("All of it settles the documents above.")}
                </p>
              </fieldset>
            )}
            {otherCurrency.length > 0 && <p className="text-xs text-muted-foreground">{t("They also have open documents in {list}. Choose an account in that currency to settle them.", { list: [...new Set(otherCurrency.map((d) => d.currency))].join(", ") })}</p>}
            <FieldError message={errors.form} />
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
                {t("Cancel")}
              </Button>
              <Button type="submit" disabled={pending || used > total}>
                {pending && <Loader2 className="size-4 animate-spin" />}
                {t("Save")}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
