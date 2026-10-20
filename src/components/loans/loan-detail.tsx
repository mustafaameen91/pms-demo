"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, CheckCircle2, Loader2, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { deleteLoan, deleteRepayment, recordRepayment } from "@/lib/actions/loans";
import { REPAYMENT_METHODS } from "@/lib/loans";
import { cn, formatDate, formatMoney } from "@/lib/utils";
import { useT } from "@/i18n/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FieldError } from "@/components/projects/project-fields";
import { nativeSelectClass } from "@/components/resources/resource-fields";

type Repayment = { id: string; amount: string; paidOn: string; method: string; note: string | null; recordedBy: string | null };
type Loan = {
  id: string;
  borrowerName: string;
  borrowerKind: "member" | "worker";
  amount: string;
  paid: string;
  balance: string;
  paidPct: number;
  paidOff: boolean;
  currency: string;
  issuedOn: string;
  reason: string | null;
  repayments: Repayment[];
};

export function LoanDetail({ loan, isAdmin, backHref, today }: { loan: Loan; isAdmin: boolean; backHref: string; today: string }) {
  const t = useT();
  const router = useRouter();
  const money = (v: string) => formatMoney(v, loan.currency, t.intl);
  const methodLabel = (m: string) => t(REPAYMENT_METHODS.find((x) => x.value === m)?.label ?? m);
  const [confirm, setConfirm] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <div className="grid grid-cols-1 gap-6">
      <Link href={backHref} className="flex w-fit items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4 rtl:-scale-x-100" aria-hidden />
        {t("All loans")}
      </Link>

      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-xl font-semibold tracking-tight">
            {t("Loan to {name}", { name: loan.borrowerName })}
            <span className="ms-2 rounded-full border px-2 py-0.5 align-middle text-xs font-normal text-muted-foreground">
              {loan.borrowerKind === "member" ? t("Member") : t("Worker")}
            </span>
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {t("Given on {date}", { date: formatDate(loan.issuedOn, t.intl) })}
            {loan.reason && <> · “{loan.reason}”</>}
          </p>
        </div>
        {isAdmin && loan.repayments.length === 0 && (
          <Button
            variant={confirm === "loan" ? "destructive" : "ghost"}
            size="sm"
            disabled={pending}
            onBlur={() => setConfirm((c) => (c === "loan" ? null : c))}
            onClick={() => {
              if (confirm !== "loan") return setConfirm("loan");
              startTransition(async () => {
                const res = await deleteLoan(loan.id);
                if (!res.ok) return void toast.error(res.error);
                toast.success(t("Loan deleted"));
                router.push(backHref);
              });
            }}
          >
            <Trash2 className="size-4" />
            {confirm === "loan" ? t("Delete this loan") : t("Delete")}
          </Button>
        )}
      </header>

      <section aria-label={t("Balance")} className="rounded-xl border bg-card p-5">
        <dl className="grid gap-4 sm:grid-cols-3">
          <div>
            <dt className="text-xs text-muted-foreground">{t("Amount")}</dt>
            <dd className="mt-1 text-xl font-semibold tabular-nums">{money(loan.amount)}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">{t("Repaid")}</dt>
            <dd className="mt-1 text-xl font-semibold tabular-nums">{money(loan.paid)}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">{t("Balance")}</dt>
            <dd className={cn("mt-1 text-xl font-semibold tabular-nums", loan.paidOff && "text-primary")}>
              {loan.paidOff ? (
                <span className="flex items-center gap-1.5">
                  <CheckCircle2 className="size-5" aria-hidden />
                  {t("Paid off")}
                </span>
              ) : (
                money(loan.balance)
              )}
            </dd>
          </div>
        </dl>
        <div className="mt-4 flex items-center gap-3">
          <div
            className="h-2 flex-1 overflow-hidden rounded-full bg-muted"
            role="progressbar"
            aria-valuenow={loan.paidPct}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label={t("Repaid")}
          >
            <div className="h-full rounded-full bg-primary" style={{ width: `${loan.paidPct}%` }} />
          </div>
          <span className="text-sm text-muted-foreground tabular-nums">{loan.paidPct}%</span>
        </div>
      </section>

      {isAdmin && !loan.paidOff && <RepaymentForm loan={loan} today={today} />}

      <section aria-labelledby="repayments-heading" className="rounded-xl border bg-card">
        <h2 id="repayments-heading" className="border-b px-4 py-3 font-semibold">
          {t("Repayments")} <span className="text-muted-foreground tabular-nums">{loan.repayments.length}</span>
        </h2>
        {loan.repayments.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-muted-foreground">{t("Nothing repaid yet.")}</p>
        ) : (
          <div className="relative overflow-x-auto">
            <table className="w-full min-w-[560px] text-sm">
              <thead className="text-xs text-muted-foreground">
                <tr className="border-b">
                  <th scope="col" className="px-4 py-2 text-start font-medium">{t("Date")}</th>
                  <th scope="col" className="px-4 py-2 text-end font-medium">{t("Amount")}</th>
                  <th scope="col" className="px-4 py-2 text-start font-medium">{t("How")}</th>
                  <th scope="col" className="px-4 py-2 text-start font-medium">{t("Note")}</th>
                  {isAdmin && <th scope="col" className="px-4 py-2"><span className="sr-only">{t("Actions")}</span></th>}
                </tr>
              </thead>
              <tbody>
                {loan.repayments.map((r) => (
                  <tr key={r.id} className="border-b last:border-0">
                    <td className="px-4 py-2.5 whitespace-nowrap">{formatDate(r.paidOn, t.intl)}</td>
                    <td className="px-4 py-2.5 text-end font-medium whitespace-nowrap tabular-nums">{money(r.amount)}</td>
                    <td className="px-4 py-2.5">{methodLabel(r.method)}</td>
                    <td className="px-4 py-2.5 text-muted-foreground">
                      {r.note}
                      {r.recordedBy && <span className="block text-xs">{t("Recorded by {name}", { name: r.recordedBy })}</span>}
                    </td>
                    {isAdmin && (
                      <td className="px-4 py-2 text-end">
                        <Button
                          size="sm"
                          variant={confirm === r.id ? "destructive" : "ghost"}
                          disabled={pending}
                          aria-label={confirm === r.id ? t("Confirm removing this repayment") : t("Remove repayment of {amount}", { amount: money(r.amount) })}
                          onBlur={() => setConfirm((c) => (c === r.id ? null : c))}
                          onClick={() => {
                            if (confirm !== r.id) return setConfirm(r.id);
                            setConfirm(null);
                            startTransition(async () => {
                              const res = await deleteRepayment(r.id);
                              if (!res.ok) return void toast.error(res.error);
                              toast.success(t("Repayment removed"));
                            });
                          }}
                        >
                          <Trash2 className="size-4" />
                          {confirm === r.id ? t("Remove") : <span className="sr-only">{t("Remove")}</span>}
                        </Button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

function RepaymentForm({ loan, today }: { loan: Loan; today: string }) {
  const t = useT();
  const [form, setForm] = useState({ amount: "", paidOn: today, method: "cash", note: "" });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [pending, startTransition] = useTransition();
  return (
    <form
      aria-labelledby="repay-heading"
      className="rounded-xl border-2 border-primary/30 bg-card p-5"
      onSubmit={(e) => {
        e.preventDefault();
        setErrors({});
        startTransition(async () => {
          const res = await recordRepayment(loan.id, form);
          if (!res.ok) return setErrors(res.fieldErrors ?? { form: res.error });
          toast.success(res.data?.paidOff ? t("Loan fully repaid") : t("Repayment recorded"));
          setForm({ amount: "", paidOn: today, method: form.method, note: "" });
        });
      }}
    >
      <h2 id="repay-heading" className="font-semibold">
        {t("Record a repayment")}
      </h2>
      <p className="mt-1 text-sm text-muted-foreground">
        {t("Any amount up to the remaining {balance}.", { balance: formatMoney(loan.balance, loan.currency, t.intl) })}
      </p>
      <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-[1fr_auto_auto_1.5fr_auto] xl:items-end">
        <div className="grid gap-1.5">
          <Label htmlFor="repay-amount">{t("Amount ({currency})", { currency: loan.currency })}</Label>
          <div className="flex gap-2">
            <Input id="repay-amount" inputMode="decimal" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} className="tabular-nums" aria-invalid={Boolean(errors.amount)} />
            <Button type="button" variant="outline" size="sm" className="h-9 shrink-0" onClick={() => setForm({ ...form, amount: String(Number(loan.balance)) })}>
              {t("All")}
            </Button>
          </div>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="repay-date">{t("Date")}</Label>
          <Input id="repay-date" type="date" value={form.paidOn} onChange={(e) => setForm({ ...form, paidOn: e.target.value })} className="w-40" />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="repay-method">{t("How")}</Label>
          <select id="repay-method" value={form.method} onChange={(e) => setForm({ ...form, method: e.target.value })} className={cn(nativeSelectClass, "w-44")}>
            {REPAYMENT_METHODS.map((m) => (
              <option key={m.value} value={m.value}>
                {t(m.label)}
              </option>
            ))}
          </select>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="repay-note">
            {t("Note")} <span className="font-normal text-muted-foreground">{t("(optional)")}</span>
          </Label>
          <Input id="repay-note" value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} maxLength={300} />
        </div>
        <Button type="submit" disabled={pending || !form.amount.trim()}>
          {pending ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
          {t("Record")}
        </Button>
      </div>
      <div className="mt-2">
        <FieldError message={errors.amount ?? errors.paidOn ?? errors.form} />
      </div>
    </form>
  );
}
