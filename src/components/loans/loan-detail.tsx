"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CheckCircle2, FolderKanban, HandCoins, Loader2, Paperclip, Plus, Receipt as ReceiptIcon, Trash2, Undo2 } from "lucide-react";
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
import { ApprovalBadge, type ApprovalState } from "@/components/expenses/approval";
import { SelectBox } from "@/components/ui/select-box";
import { PageHeader } from "@/components/page/kit";

type Repayment = { id: string; amount: string; paidOn: string; method: string; note: string | null; recordedBy: string | null };
type Receipt = {
  id: string;
  date: string;
  amount: string;
  description: string;
  approvalStatus: ApprovalState;
  decisionNote: string | null;
  hasReceipt: boolean;
};
type Loan = {
  id: string;
  borrowerName: string;
  borrowerKind: "member" | "worker";
  amount: string;
  paid: string;
  returned: string;
  spent: string;
  pending: string;
  balance: string;
  open: string;
  paidPct: number;
  paidOff: boolean;
  currency: string;
  issuedOn: string;
  reason: string | null;
  /** Set for a cash advance from a project's budget. */
  project: { name: string; href: string } | null;
  repayments: Repayment[];
  receipts: Receipt[];
};

export function LoanDetail({
  loan,
  isAdmin,
  backHref,
  today,
  receiptHref,
  moneyAccounts = [],
}: {
  loan: Loan;
  isAdmin: boolean;
  backHref: string;
  today: string;
  /** Finance's cash boxes and banks (empty until Finance is set up). */
  moneyAccounts?: { id: string; name: string; isDefault: boolean }[];
  /** Where to add a receipt for this advance (null when it can't take more). */
  receiptHref: string | null;
}) {
  const t = useT();
  const router = useRouter();
  const money = (v: string) => formatMoney(v, loan.currency, t.intl);
  const methodLabel = (m: string) => t(REPAYMENT_METHODS.find((x) => x.value === m)?.label ?? m);
  const [confirm, setConfirm] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <div className="grid grid-cols-1 gap-6">
      <PageHeader
        icon={HandCoins}
        back={{ href: backHref, label: t("All loans") }}
        title={
          <>
            {loan.project ? t("Advance to {name}", { name: loan.borrowerName }) : t("Loan to {name}", { name: loan.borrowerName })}
            <span className="rounded-full bg-white/15 px-2.5 py-0.5 text-xs font-medium ring-1 ring-white/25">{loan.borrowerKind === "member" ? t("Member") : t("Worker")}</span>
          </>
        }
        description={
          <>
            <span>
              {t("Given on {date}", { date: formatDate(loan.issuedOn, t.intl) })}
              {loan.reason && <> · “{loan.reason}”</>}
            </span>
            {loan.project && (
              <Link href={loan.project.href} className="mt-2 flex w-fit items-center gap-1.5 rounded-full bg-white px-2.5 py-1 text-xs font-medium text-amber-900 shadow-sm hover:underline">
                <FolderKanban className="size-3.5" aria-hidden />
                {t("From the budget of {project}", { project: loan.project.name })}
              </Link>
            )}
          </>
        }
        actions={
          <>
            {isAdmin && loan.repayments.length === 0 && loan.receipts.length === 0 && (
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
          </>
        }
      />

      <section aria-label={t("Balance")} className="rounded-2xl border bg-card p-5 sm:p-6">
        <dl className={cn("grid gap-4", loan.project ? "sm:grid-cols-2 lg:grid-cols-4" : "sm:grid-cols-3")}>
          <div>
            <dt className="text-sm font-medium text-muted-foreground">{t("Amount")}</dt>
            <dd className="mt-1 text-2xl font-bold tracking-tight tabular-nums">{money(loan.amount)}</dd>
          </div>
          {loan.project ? (
            <>
              <div>
                <dt className="text-sm font-medium text-muted-foreground">{t("Spent (approved receipts)")}</dt>
                <dd className="mt-1 text-2xl font-bold tracking-tight tabular-nums">{money(loan.spent)}</dd>
                {Number(loan.pending) > 0 && (
                  <p className="mt-0.5 text-xs text-amber-800 dark:text-amber-300">
                    {t("+ {amount} waiting for approval", { amount: money(loan.pending) })}
                  </p>
                )}
              </div>
              <div>
                <dt className="text-sm font-medium text-muted-foreground">{t("Brought back")}</dt>
                <dd className="mt-1 text-2xl font-bold tracking-tight tabular-nums">{money(loan.returned)}</dd>
              </div>
            </>
          ) : (
            <div>
              <dt className="text-sm font-medium text-muted-foreground">{t("Repaid")}</dt>
              <dd className="mt-1 text-2xl font-bold tracking-tight tabular-nums">{money(loan.paid)}</dd>
            </div>
          )}
          <div>
            <dt className="text-sm font-medium text-muted-foreground">{loan.project ? t("Still with them") : t("Balance")}</dt>
            <dd className={cn("mt-1 text-2xl font-bold tracking-tight tabular-nums", loan.paidOff && "text-green-700 dark:text-green-400")}>
              {loan.paidOff ? (
                <span className="flex items-center gap-1.5">
                  <CheckCircle2 className="size-5" aria-hidden />
                  {loan.project ? t("Settled") : t("Paid off")}
                </span>
              ) : (
                money(loan.balance)
              )}
            </dd>
          </div>
        </dl>
        <div className="mt-4 flex items-center gap-3">
          <div
            className="h-2.5 flex-1 overflow-hidden rounded-full bg-muted"
            role="progressbar"
            aria-valuenow={loan.paidPct}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label={loan.project ? t("Settled") : t("Repaid")}
          >
            <div className="h-full rounded-full bg-primary" style={{ width: `${loan.paidPct}%` }} />
          </div>
          <span className="text-sm font-semibold tabular-nums">{loan.paidPct}%</span>
        </div>
      </section>

      {loan.project && (
        <section aria-labelledby="receipts-heading" className="overflow-hidden rounded-2xl border bg-card">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b px-5 pt-4 pb-3">
            <h2 id="receipts-heading" className="flex items-center gap-2 font-semibold">
              <ReceiptIcon className="size-4 text-muted-foreground" aria-hidden />
              {t("Receipts")}
              <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-semibold text-muted-foreground tabular-nums">{loan.receipts.length}</span>
            </h2>
            {receiptHref && (
              <Button asChild size="sm">
                <Link href={receiptHref}>
                  <Plus className="size-4" />
                  {t("Add a receipt")}
                </Link>
              </Button>
            )}
          </div>
          {loan.receipts.length === 0 ? (
            <p className="px-5 py-10 text-center text-sm text-muted-foreground">
              {t("No receipts yet. Each purchase made with this advance is added as an expense of the project.")}
            </p>
          ) : (
            <ul className="divide-y">
              {loan.receipts.map((r) => (
                <li key={r.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-5 py-3 text-sm transition-colors hover:bg-accent">
                  <span className="w-28 shrink-0 text-muted-foreground tabular-nums">{formatDate(r.date, t.intl)}</span>
                  <span className="min-w-0 flex-1">
                    {r.description} <ApprovalBadge status={r.approvalStatus} note={r.decisionNote} />
                  </span>
                  {r.hasReceipt && (
                    <a
                      href={`/api/files/receipts/${r.id}`}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                      aria-label={t("Open receipt for {name}", { name: r.description })}
                    >
                      <Paperclip className="size-3.5" aria-hidden />
                      {t("Receipt")}
                    </a>
                  )}
                  <span
                    className={cn("text-end font-medium tabular-nums", r.approvalStatus !== "approved" && "text-muted-foreground line-through decoration-1")}
                  >
                    {money(r.amount)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {isAdmin && !loan.paidOff && <RepaymentForm loan={loan} today={today} moneyAccounts={moneyAccounts} />}

      <section aria-labelledby="repayments-heading" className="overflow-hidden rounded-2xl border bg-card">
        <h2 id="repayments-heading" className="flex items-center gap-2 border-b px-5 pt-4 pb-3 font-semibold">
          <Undo2 className="size-4 text-muted-foreground" aria-hidden />
          {loan.project ? t("Cash brought back") : t("Repayments")} <span className="text-muted-foreground tabular-nums">{loan.repayments.length}</span>
        </h2>
        {loan.repayments.length === 0 ? (
          <p className="px-5 py-10 text-center text-sm text-muted-foreground">{loan.project ? t("Nothing brought back yet.") : t("Nothing repaid yet.")}</p>
        ) : (
          <div className="relative overflow-x-auto">
            <table className="w-full min-w-[560px] text-sm">
              <thead className="text-xs text-muted-foreground">
                <tr className="border-b bg-muted/40">
                  <th scope="col" className="px-5 py-2.5 text-start font-medium">{t("Date")}</th>
                  <th scope="col" className="px-5 py-2.5 text-end font-medium">{t("Amount")}</th>
                  <th scope="col" className="px-5 py-2.5 text-start font-medium">{t("How")}</th>
                  <th scope="col" className="px-5 py-2.5 text-start font-medium">{t("Note")}</th>
                  {isAdmin && <th scope="col" className="px-4 py-2"><span className="sr-only">{t("Actions")}</span></th>}
                </tr>
              </thead>
              <tbody>
                {loan.repayments.map((r) => (
                  <tr key={r.id} className="border-b transition-colors last:border-0 hover:bg-accent">
                    <td className="px-5 py-3 whitespace-nowrap">{formatDate(r.paidOn, t.intl)}</td>
                    <td className="px-5 py-3 text-end font-medium whitespace-nowrap tabular-nums">{money(r.amount)}</td>
                    <td className="px-5 py-3">{methodLabel(r.method)}</td>
                    <td className="px-5 py-3 text-muted-foreground">
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

function RepaymentForm({ loan, today, moneyAccounts }: { loan: Loan; today: string; moneyAccounts: { id: string; name: string; isDefault: boolean }[] }) {
  const t = useT();
  const [form, setForm] = useState({ amount: "", paidOn: today, method: "cash", note: "", moneyAccountId: moneyAccounts.find((a) => a.isDefault)?.id ?? "" });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [pending, startTransition] = useTransition();
  return (
    <form
      aria-labelledby="repay-heading"
      className="rounded-2xl border-2 border-primary/30 bg-card p-5 sm:p-6"
      onSubmit={(e) => {
        e.preventDefault();
        setErrors({});
        startTransition(async () => {
          const res = await recordRepayment(loan.id, form);
          if (!res.ok) return setErrors(res.fieldErrors ?? { form: res.error });
          toast.success(
            res.data?.paidOff
              ? loan.project ? t("Advance settled") : t("Loan fully repaid")
              : loan.project ? t("Cash brought back recorded") : t("Repayment recorded"),
          );
          setForm({ amount: "", paidOn: today, method: form.method, note: "", moneyAccountId: form.moneyAccountId });
        });
      }}
    >
      <h2 id="repay-heading" className="font-semibold">
        {loan.project ? t("Record cash brought back") : t("Record a repayment")}
      </h2>
      <p className="mt-1 text-sm text-muted-foreground">
        {loan.project
          ? t("Money they didn't spend goes back to the project's budget. Up to {balance}.", { balance: formatMoney(loan.open, loan.currency, t.intl) })
          : t("Any amount up to the remaining {balance}.", { balance: formatMoney(loan.open, loan.currency, t.intl) })}
        {Number(loan.pending) > 0 && ` ${t("Receipts waiting for approval ({amount}) are held back.", { amount: formatMoney(loan.pending, loan.currency, t.intl) })}`}
      </p>
      <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-[1fr_auto_auto_1.5fr_auto] xl:items-end">
        <div className="grid gap-1.5">
          <Label htmlFor="repay-amount">{t("Amount ({currency})", { currency: loan.currency })}</Label>
          <div className="flex gap-2">
            <Input id="repay-amount" inputMode="decimal" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} className="tabular-nums" aria-invalid={Boolean(errors.amount)} />
            <Button type="button" variant="outline" size="sm" className="h-9 shrink-0" onClick={() => setForm({ ...form, amount: String(Number(loan.open)) })}>
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
          <SelectBox id="repay-method" value={form.method} onValueChange={(v) => setForm({ ...form, method: v })} className={cn(nativeSelectClass, "w-44")}>
            {REPAYMENT_METHODS.map((m) => (
              <option key={m.value} value={m.value}>
                {t(m.label)}
              </option>
            ))}
          </SelectBox>
        </div>
        {moneyAccounts.length > 0 && form.method !== "salary_deduction" && (
          <div className="grid gap-1.5">
            <Label htmlFor="repay-into">{t("Into")}</Label>
            <SelectBox id="repay-into" value={form.moneyAccountId} onValueChange={(v) => setForm({ ...form, moneyAccountId: v })} className={cn(nativeSelectClass, "w-44")}>
              {moneyAccounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </SelectBox>
          </div>
        )}
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
