"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Check, ChevronRight, HandCoins, Loader2, Plus, X } from "lucide-react";
import { toast } from "sonner";
import { cancelLoanRequest, createLoan, decideLoanRequest, requestLoan } from "@/lib/actions/loans";
import { CURRENCIES } from "@/lib/constants";
import { cn, formatDate, formatMoney } from "@/lib/utils";
import { useT } from "@/i18n/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { FieldError } from "@/components/projects/project-fields";
import { nativeSelectClass } from "@/components/resources/resource-fields";

export type LoanItem = {
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
  lastPaidOn: string | null;
  /** Set for a cash advance from a project's budget. */
  project: { name: string; key: string } | null;
};
export type LoanRequestItem = {
  id: string;
  requesterName: string;
  amount: string;
  currency: string;
  reason: string;
  status: "pending" | "approved" | "rejected";
  decisionNote: string | null;
  deciderName: string | null;
  createdAt: Date;
};
type Totals = { currency: string; lent: string; outstanding: string; active: number }[];

type Props = {
  slug: string;
  isAdmin: boolean;
  defaultCurrency: string;
  today: string;
  loans: LoanItem[];
  requests: LoanRequestItem[];
  totals: Totals;
  borrowers: { people: { id: string; name: string }[]; workers: { id: string; name: string; role: string | null }[] };
  filter: "active" | "paid" | "all";
  projects: { id: string; name: string; key: string; currency: string }[];
};

export function LoansView(props: Props) {
  const t = useT();
  const { isAdmin, loans, requests, filter } = props;
  const [newOpen, setNewOpen] = useState(false);
  const [requestOpen, setRequestOpen] = useState(false);
  const pending = requests.filter((r) => r.status === "pending");
  const shown = loans.filter((l) => (filter === "all" ? true : filter === "paid" ? l.paidOff : !l.paidOff));
  const money = (v: string, c: string) => formatMoney(v, c, t.intl);

  return (
    <div className="grid grid-cols-1 gap-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="flex items-center gap-2 text-xl font-semibold tracking-tight">
            <HandCoins className="size-5 text-primary" aria-hidden />
            {isAdmin ? t("Loans") : t("My loans")}
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            {isAdmin
              ? t("Money the company lends to members and workers, or advances from a project's budget. Record repayments of any amount until the balance is zero.")
              : t("Loans the company gave you and what's left to repay. You can also ask for a new loan.")}
          </p>
        </div>
        {isAdmin ? (
          <Button onClick={() => setNewOpen(true)}>
            <Plus className="size-4" />
            {t("New loan")}
          </Button>
        ) : (
          <Button onClick={() => setRequestOpen(true)}>
            <Plus className="size-4" />
            {t("Request a loan")}
          </Button>
        )}
      </header>

      {props.totals.length > 0 && (
        <section aria-label={t("Totals")} className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {props.totals.map((tot) => (
            <div key={tot.currency} className="rounded-xl border bg-card p-4">
              <p className="text-xs text-muted-foreground">{isAdmin ? t("Still owed to the company") : t("You still owe")}</p>
              <p className="mt-1 text-2xl font-semibold tabular-nums">{money(tot.outstanding, tot.currency)}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                {t.plural(tot.active, "{count} open loan", "{count} open loans")} · {t("{amount} lent in total", { amount: money(tot.lent, tot.currency) })}
              </p>
            </div>
          ))}
        </section>
      )}

      {isAdmin && pending.length > 0 && (
        <section aria-labelledby="requests-heading" className="rounded-xl border border-amber-500/40 bg-amber-500/5">
          <h2 id="requests-heading" className="border-b border-amber-500/30 px-4 py-3 font-semibold">
            {t("Loan requests waiting")} <span className="text-muted-foreground tabular-nums">{pending.length}</span>
          </h2>
          <ul className="divide-y">
            {pending.map((r) => (
              <RequestDecision key={r.id} request={r} />
            ))}
          </ul>
        </section>
      )}

      <section aria-labelledby="loans-heading" className="rounded-xl border bg-card">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3">
          <h2 id="loans-heading" className="font-semibold">
            {isAdmin ? t("All loans") : t("Your loans")}
          </h2>
          <nav aria-label={t("Show")} className="flex rounded-lg bg-muted p-0.5 text-sm">
            {(["active", "paid", "all"] as const).map((f) => (
              <Link
                key={f}
                href={`?show=${f}`}
                aria-current={filter === f ? "page" : undefined}
                className={cn("rounded-md px-3 py-1 text-muted-foreground hover:text-foreground", filter === f && "bg-background font-medium text-foreground shadow-sm")}
              >
                {{ active: t("Open|loans"), paid: t("Paid off"), all: t("All") }[f]}
              </Link>
            ))}
          </nav>
        </div>
        {shown.length === 0 ? (
          <p className="px-4 py-10 text-center text-sm text-muted-foreground">
            {loans.length === 0 ? (isAdmin ? t("No loans yet.") : t("You have no loans.")) : t("Nothing here.")}
          </p>
        ) : (
          <div className="relative overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead className="text-start text-xs text-muted-foreground">
                <tr className="border-b">
                  {isAdmin && <th scope="col" className="px-4 py-2 text-start font-medium">{t("Borrower")}</th>}
                  <th scope="col" className="px-4 py-2 text-start font-medium">{t("Given on")}</th>
                  <th scope="col" className="px-4 py-2 text-end font-medium">{t("Amount")}</th>
                  <th scope="col" className="px-4 py-2 text-end font-medium">{t("Repaid")}</th>
                  <th scope="col" className="px-4 py-2 text-end font-medium">{t("Balance")}</th>
                  <th scope="col" className="w-40 px-4 py-2 text-start font-medium">{t("Progress")}</th>
                  <th scope="col" className="w-8 px-2 py-2"><span className="sr-only">{t("Open")}</span></th>
                </tr>
              </thead>
              <tbody>
                {shown.map((l) => (
                  <tr key={l.id} className="group relative border-b last:border-0 hover:bg-accent/40">
                    {isAdmin && (
                      <td className="px-4 py-2.5">
                        <Link href={`loans/${l.id}`} className="font-medium after:absolute after:inset-0 hover:underline">
                          {l.borrowerName}
                        </Link>
                        <span className="ms-2 rounded-full border px-1.5 py-0.5 text-xs text-muted-foreground">
                          {l.borrowerKind === "member" ? t("Member") : t("Worker")}
                        </span>
                        {l.project && <AdvanceTag project={l.project} />}
                      </td>
                    )}
                    <td className="px-4 py-2.5 whitespace-nowrap">
                      {isAdmin ? formatDate(l.issuedOn, t.intl) : (
                        <>
                          <Link href={`loans/${l.id}`} className="after:absolute after:inset-0 hover:underline">{formatDate(l.issuedOn, t.intl)}</Link>
                          {l.project && <AdvanceTag project={l.project} />}
                        </>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-end whitespace-nowrap tabular-nums">{money(l.amount, l.currency)}</td>
                    <td className="px-4 py-2.5 text-end whitespace-nowrap tabular-nums">{money(l.paid, l.currency)}</td>
                    <td className={cn("px-4 py-2.5 text-end font-medium whitespace-nowrap tabular-nums", l.paidOff && "text-muted-foreground")}>
                      {l.paidOff ? t("Paid off") : money(l.balance, l.currency)}
                    </td>
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-2">
                        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted" aria-hidden>
                          <div className="h-full rounded-full bg-primary" style={{ width: `${l.paidPct}%` }} />
                        </div>
                        <span className="w-9 text-end text-xs text-muted-foreground tabular-nums">{l.paidPct}%</span>
                      </div>
                    </td>
                    <td className="px-2 py-2.5 text-muted-foreground">
                      <ChevronRight className="size-4 rtl:-scale-x-100" aria-hidden />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {!isAdmin && requests.length > 0 && (
        <section aria-labelledby="my-requests-heading" className="rounded-xl border bg-card">
          <h2 id="my-requests-heading" className="border-b px-4 py-3 font-semibold">
            {t("Your requests")}
          </h2>
          <ul className="divide-y">
            {requests.map((r) => (
              <MyRequest key={r.id} request={r} />
            ))}
          </ul>
        </section>
      )}

      {isAdmin && (
        <NewLoanDialog open={newOpen} onOpenChange={setNewOpen} slug={props.slug} borrowers={props.borrowers} projects={props.projects} defaultCurrency={props.defaultCurrency} today={props.today} />
      )}
      {!isAdmin && <RequestDialog open={requestOpen} onOpenChange={setRequestOpen} slug={props.slug} defaultCurrency={props.defaultCurrency} />}
    </div>
  );
}

function AdvanceTag({ project }: { project: { name: string; key: string } }) {
  const t = useT();
  return (
    <span className="ms-2 inline-flex items-center gap-1 rounded-full bg-amber-500/10 px-1.5 py-0.5 text-xs text-amber-900 dark:text-amber-200">
      {t("Advance · {project}", { project: project.name })}
    </span>
  );
}

function RequestDecision({ request: r }: { request: LoanRequestItem }) {
  const t = useT();
  const [mode, setMode] = useState<"idle" | "reject">("idle");
  const [amount, setAmount] = useState(String(Number(r.amount)));
  const [note, setNote] = useState("");
  const [pending, startTransition] = useTransition();
  const decide = (decision: "approved" | "rejected") =>
    startTransition(async () => {
      const res = await decideLoanRequest(r.id, { decision, note, amount: decision === "approved" ? amount : undefined });
      if (!res.ok) return void toast.error(res.error);
      toast.success(decision === "approved" ? t("Loan given to {name}", { name: r.requesterName }) : t("Request rejected"));
    });
  return (
    <li className="grid gap-3 px-4 py-3 text-sm lg:grid-cols-[1fr_auto] lg:items-end">
      <div className="min-w-0">
        <p>
          <span className="font-medium">{r.requesterName}</span>{" "}
          {t("asks for {amount}", { amount: formatMoney(r.amount, r.currency, t.intl) })}
          <span className="text-muted-foreground"> · {formatDate(new Date(r.createdAt).toISOString().slice(0, 10), t.intl)}</span>
        </p>
        <p className="mt-0.5 text-muted-foreground">“{r.reason}”</p>
      </div>
      {mode === "idle" ? (
        <div className="flex flex-wrap items-end gap-2">
          <div className="grid gap-1">
            <Label htmlFor={`amt-${r.id}`} className="text-xs">{t("Amount to lend ({currency})", { currency: r.currency })}</Label>
            <Input id={`amt-${r.id}`} inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} className="h-8 w-40 tabular-nums" />
          </div>
          <Button size="sm" onClick={() => decide("approved")} disabled={pending} aria-label={t("Approve loan for {name}", { name: r.requesterName })}>
            {pending ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
            {t("Approve")}
          </Button>
          <Button size="sm" variant="outline" onClick={() => setMode("reject")} disabled={pending} aria-label={t("Reject loan for {name}", { name: r.requesterName })}>
            <X className="size-4" />
            {t("Reject")}
          </Button>
        </div>
      ) : (
        <form
          className="flex flex-wrap items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            decide("rejected");
          }}
        >
          <div className="grid gap-1">
            <Label htmlFor={`note-${r.id}`} className="text-xs">{t("Reason for rejecting")}</Label>
            <Input id={`note-${r.id}`} value={note} onChange={(e) => setNote(e.target.value)} className="h-8 w-64" autoFocus />
          </div>
          <Button size="sm" variant="destructive" type="submit" disabled={pending || !note.trim()}>
            {t("Reject")}
          </Button>
          <Button size="sm" variant="ghost" type="button" onClick={() => setMode("idle")}>
            {t("Cancel")}
          </Button>
        </form>
      )}
    </li>
  );
}

function MyRequest({ request: r }: { request: LoanRequestItem }) {
  const t = useT();
  const [pending, startTransition] = useTransition();
  const label = { pending: t("Waiting for approval"), approved: t("Approved"), rejected: t("Rejected") }[r.status];
  return (
    <li className="flex flex-wrap items-center gap-3 px-4 py-3 text-sm">
      <div className="min-w-0 flex-1">
        <p>
          <span className="font-medium tabular-nums">{formatMoney(r.amount, r.currency, t.intl)}</span>
          <span className="text-muted-foreground"> · “{r.reason}”</span>
        </p>
        {r.status === "rejected" && r.decisionNote && (
          <p className="mt-0.5 text-destructive">{t("Rejected by {name}: “{note}”", { name: r.deciderName ?? "", note: r.decisionNote })}</p>
        )}
      </div>
      <span
        className={cn(
          "rounded-full border px-2 py-0.5 text-xs",
          r.status === "pending" && "border-amber-500/50 text-amber-800 dark:text-amber-300",
          r.status === "approved" && "border-primary/40 text-primary",
          r.status === "rejected" && "border-destructive/40 text-destructive",
        )}
      >
        {label}
      </span>
      {r.status === "pending" && (
        <Button
          size="sm"
          variant="ghost"
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              const res = await cancelLoanRequest(r.id);
              if (!res.ok) return void toast.error(res.error);
              toast.success(t("Request withdrawn"));
            })
          }
        >
          {t("Withdraw")}
        </Button>
      )}
    </li>
  );
}

function CurrencySelect({ id, value, onChange, disabled }: { id: string; value: string; onChange: (v: string) => void; disabled?: boolean }) {
  return (
    <select id={id} value={value} onChange={(e) => onChange(e.target.value)} disabled={disabled} className={cn(nativeSelectClass, "w-28 disabled:opacity-70")}>
      {CURRENCIES.map((c) => (
        <option key={c} value={c}>
          {c}
        </option>
      ))}
    </select>
  );
}

function NewLoanDialog({
  open,
  onOpenChange,
  slug,
  borrowers,
  projects,
  defaultCurrency,
  today,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  slug: string;
  borrowers: Props["borrowers"];
  projects: Props["projects"];
  defaultCurrency: string;
  today: string;
}) {
  const t = useT();
  const empty = { borrower: "", amount: "", currency: defaultCurrency, issuedOn: today, reason: "", projectId: "" };
  const [form, setForm] = useState(empty);
  const project = projects.find((p) => p.id === form.projectId);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [pending, startTransition] = useTransition();
  const set = (patch: Partial<typeof form>) => setForm((f) => ({ ...f, ...patch }));
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <form
          className="grid gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            setErrors({});
            startTransition(async () => {
              const res = await createLoan(slug, form);
              if (!res.ok) {
                setErrors(res.fieldErrors ?? { form: res.error });
                return;
              }
              toast.success(project ? t("Advance recorded") : t("Loan recorded"));
              setForm(empty);
              onOpenChange(false);
            });
          }}
        >
          <DialogHeader>
            <DialogTitle>{t("New loan")}</DialogTitle>
            <DialogDescription>{t("Record money the company lends. Repayments are recorded later, in any amounts.")}</DialogDescription>
          </DialogHeader>
          <div className="grid gap-1.5">
            <Label htmlFor="loan-borrower">{t("Borrower")}</Label>
            <select id="loan-borrower" value={form.borrower} onChange={(e) => set({ borrower: e.target.value })} className={nativeSelectClass} aria-invalid={Boolean(errors.borrower)}>
              <option value="">{t("Choose…")}</option>
              <optgroup label={t("Members")}>
                {borrowers.people.map((p) => (
                  <option key={p.id} value={`user:${p.id}`}>
                    {p.name}
                  </option>
                ))}
              </optgroup>
              {borrowers.workers.length > 0 && (
                <optgroup label={t("Workers")}>
                  {borrowers.workers.map((w) => (
                    <option key={w.id} value={`worker:${w.id}`}>
                      {w.name}
                      {w.role ? ` · ${w.role}` : ""}
                    </option>
                  ))}
                </optgroup>
              )}
            </select>
            <FieldError message={errors.borrower} />
          </div>
          {projects.length > 0 && (
            <div className="grid gap-1.5">
              <Label htmlFor="loan-project">{t("From a project's budget?")}</Label>
              <select
                id="loan-project"
                value={form.projectId}
                onChange={(e) => {
                  const p = projects.find((x) => x.id === e.target.value);
                  set({ projectId: e.target.value, currency: p?.currency ?? form.currency });
                }}
                className={nativeSelectClass}
                aria-describedby="loan-project-help"
              >
                <option value="">{t("No — a personal loan")}</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} ({p.key})
                  </option>
                ))}
              </select>
              <p id="loan-project-help" className={cn("text-xs", project ? "text-foreground" : "text-muted-foreground")}>
                {project
                  ? t("A cash advance to buy things for {project}. It counts as spent from the project's budget right away. Receipts are added as the project's expenses, and cash brought back returns to the budget.", { project: project.name })
                  : t("Choose a project for a cash advance (e.g. to buy equipment), settled with receipts and the cash brought back.")}
              </p>
              <FieldError message={errors.projectId} />
            </div>
          )}
          <div className="grid gap-3 sm:grid-cols-[1fr_auto_auto]">
            <div className="grid gap-1.5">
              <Label htmlFor="loan-amount">{t("Amount")}</Label>
              <Input id="loan-amount" inputMode="decimal" value={form.amount} onChange={(e) => set({ amount: e.target.value })} className="tabular-nums" aria-invalid={Boolean(errors.amount)} />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="loan-currency">{t("Currency")}</Label>
              <CurrencySelect id="loan-currency" value={form.currency} onChange={(currency) => set({ currency })} disabled={Boolean(project)} />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="loan-date">{t("Given on")}</Label>
              <Input id="loan-date" type="date" value={form.issuedOn} onChange={(e) => set({ issuedOn: e.target.value })} className="w-40" />
            </div>
          </div>
          <FieldError message={errors.amount ?? errors.issuedOn} />
          <div className="grid gap-1.5">
            <Label htmlFor="loan-reason">
              {t("What it's for")} <span className="font-normal text-muted-foreground">{t("(optional)")}</span>
            </Label>
            <Textarea id="loan-reason" rows={2} value={form.reason} onChange={(e) => set({ reason: e.target.value })} maxLength={500} />
          </div>
          <FieldError message={errors.form} />
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              {t("Cancel")}
            </Button>
            <Button type="submit" disabled={pending}>
              {pending && <Loader2 className="size-4 animate-spin" />}
              {t("Record loan")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function RequestDialog({ open, onOpenChange, slug, defaultCurrency }: { open: boolean; onOpenChange: (o: boolean) => void; slug: string; defaultCurrency: string }) {
  const t = useT();
  const [form, setForm] = useState({ amount: "", currency: defaultCurrency, reason: "" });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [pending, startTransition] = useTransition();
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <form
          className="grid gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            setErrors({});
            startTransition(async () => {
              const res = await requestLoan(slug, form);
              if (!res.ok) return setErrors(res.fieldErrors ?? { form: res.error });
              toast.success(t("Request sent"));
              setForm({ amount: "", currency: defaultCurrency, reason: "" });
              onOpenChange(false);
            });
          }}
        >
          <DialogHeader>
            <DialogTitle>{t("Request a loan")}</DialogTitle>
            <DialogDescription>{t("Your request goes to the workspace owners and admins to approve.")}</DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
            <div className="grid gap-1.5">
              <Label htmlFor="req-amount">{t("Amount")}</Label>
              <Input id="req-amount" inputMode="decimal" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} className="tabular-nums" aria-invalid={Boolean(errors.amount)} />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="req-currency">{t("Currency")}</Label>
              <CurrencySelect id="req-currency" value={form.currency} onChange={(currency) => setForm({ ...form, currency })} />
            </div>
          </div>
          <FieldError message={errors.amount} />
          <div className="grid gap-1.5">
            <Label htmlFor="req-reason">{t("What it's for")}</Label>
            <Textarea id="req-reason" rows={3} value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} maxLength={500} aria-invalid={Boolean(errors.reason)} />
            <FieldError message={errors.reason} />
          </div>
          <FieldError message={errors.form} />
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              {t("Cancel")}
            </Button>
            <Button type="submit" disabled={pending}>
              {pending && <Loader2 className="size-4 animate-spin" />}
              {t("Send request")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
