"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { BadgeCheck, Banknote, Calculator, Check, ChevronRight, Download, FolderKanban, Loader2, Lock, Plus, Printer, RotateCcw, Trash2, Wallet, X } from "lucide-react";
import { toast } from "sonner";
import type { payslips } from "@/lib/db/schema";
import { adjustPayslip, approvePayroll, createPayrollRun, deletePayroll, recalculatePayroll, reopenPayroll, setPayrollPaid } from "@/lib/actions/hr-ops";
import { PAY_BASES, labelOf } from "@/lib/hr";
import { cn, formatDate, formatMoney } from "@/lib/utils";
import { useT } from "@/i18n/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SelectBox } from "@/components/ui/select-box";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { FieldError } from "@/components/projects/project-fields";
import { EmptyState, Panel, StatTile } from "@/components/page/kit";
import { PersonAvatar } from "./hr-ui";

type Totals = { currency: string; gross: number; net: number; cost: number };
const STATUS: Record<string, { label: string; style: string }> = {
  draft: { label: "Draft", style: "bg-muted text-muted-foreground" },
  approved: { label: "Approved", style: "bg-primary/10 text-primary" },
  paid: { label: "Paid|payroll", style: "bg-green-600/10 text-green-700 dark:text-green-400" },
};
const monthTitle = (month: string, intl: string) => new Date(Number(month.slice(0, 4)), Number(month.slice(5)) - 1, 1).toLocaleDateString(intl, { month: "long", year: "numeric" });

export function PayrollRuns({ slug, thisMonth, runs }: { slug: string; thisMonth: string; runs: { id: string; month: string; status: string; people: number; totals: Totals[]; approvedAt: Date | null; paidAt: Date | null }[] }) {
  const t = useT();
  const router = useRouter();
  const [month, setMonth] = useState(thisMonth);
  const [pending, start] = useTransition();
  const run = () =>
    start(async () => {
      const res = await createPayrollRun(slug, month);
      if (!res.ok) return void toast.error(res.error);
      router.push(`/w/${slug}/hr/payroll/${month}`);
    });
  const picker = (
    <div className="flex flex-wrap items-end gap-2">
      <div className="grid gap-1.5">
        <Label htmlFor="pr-month">{t("Month")}</Label>
        <Input id="pr-month" type="month" className="w-44" value={month} onChange={(e) => setMonth(e.target.value)} />
      </div>
      <Button onClick={run} disabled={pending || !month}>
        {pending ? <Loader2 className="size-4 animate-spin" /> : <Calculator className="size-4" />}
        {runs.some((r) => r.month === month) ? t("Open payroll") : t("Work out payroll")}
      </Button>
    </div>
  );
  if (runs.length === 0)
    return (
      <EmptyState icon={Wallet} title={t("No payroll yet")} action={picker}>
        {t("Choose a month. Tamm works out everyone's pay from their pay, attendance, leave and loans; you check it, adjust bonuses or deductions, then approve.")}
      </EmptyState>
    );
  return (
    <div className="grid grid-cols-1 gap-6">
      <div className="rounded-2xl border bg-card p-5">{picker}</div>
      <ul className="grid gap-3">
        {runs.map((r) => (
          <li key={r.id}>
            <Link href={`/w/${slug}/hr/payroll/${r.month}`} className="group flex flex-wrap items-center gap-4 rounded-2xl border bg-card px-5 py-4 transition-colors hover:border-primary/40 focus-visible:outline-2 focus-visible:outline-ring">
              <span aria-hidden className="grid size-11 place-items-center rounded-xl bg-primary/10 text-primary">
                <Wallet className="size-5" />
              </span>
              <div className="min-w-40 flex-1">
                <p className="font-semibold group-hover:text-primary">{monthTitle(r.month, t.intl)}</p>
                <p className="text-xs text-muted-foreground">{t.plural(r.people, "{count} person", "{count} people")}</p>
              </div>
              <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm">
                {r.totals.map((x) => (
                  <span key={x.currency}>
                    <span className="text-muted-foreground">{t("Net")} </span>
                    <span className="font-semibold tabular-nums">{formatMoney(x.net, x.currency, t.intl)}</span>
                  </span>
                ))}
              </div>
              <span className={cn("rounded-full px-2.5 py-0.5 text-xs font-medium", STATUS[r.status]?.style)}>{t(STATUS[r.status]?.label ?? r.status)}</span>
              <ChevronRight className="size-4 text-muted-foreground rtl:rotate-180" aria-hidden />
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

type Slip = typeof payslips.$inferSelect & { owed: number; hasPhoto: boolean };

export function PayrollMonth({
  slug,
  run,
  slips,
  projects,
  moneyAccounts = [],
}: {
  slug: string;
  run: { id: string; month: string; status: string; approvedAt: Date | null; paidAt: Date | null };
  /** Finance's cash boxes and banks (empty until Finance is set up): where salaries were paid from. */
  moneyAccounts?: { id: string; name: string; isDefault: boolean }[];
  slips: Slip[];
  projects: { id: string; name: string; key: string; costs: { currency: string; amount: number }[] }[];
}) {
  const t = useT();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [editing, setEditing] = useState<Slip | null>(null);
  const [paidFrom, setPaidFrom] = useState(moneyAccounts.find((a) => a.isDefault)?.id ?? moneyAccounts[0]?.id ?? "");
  const draft = run.status === "draft";
  const totals = new Map<string, { gross: number; deductions: number; net: number; employer: number; count: number }>();
  for (const s of slips) {
    const x = totals.get(s.currency) ?? { gross: 0, deductions: 0, net: 0, employer: 0, count: 0 };
    x.gross += Number(s.gross);
    x.net += Number(s.net);
    x.deductions += Number(s.gross) - Number(s.net);
    x.employer += Number(s.ssEmployer);
    x.count++;
    totals.set(s.currency, x);
  }
  const act = (fn: () => Promise<{ ok: boolean; error?: string }>, done?: string) =>
    start(async () => {
      const res = await fn();
      if (!res.ok) return void toast.error(res.error);
      if (done) toast.success(done);
    });
  const base = `/w/${slug}/hr/payroll/${run.month}`;
  const steps = [
    { key: "draft", label: t("Check and adjust") },
    { key: "approved", label: t("Approved (locked)") },
    { key: "paid", label: t("Paid|payroll") },
  ];
  const at = steps.findIndex((s) => s.key === run.status);

  return (
    <div className="grid grid-cols-1 gap-6">
      <div className="flex flex-wrap items-center gap-3 rounded-2xl border bg-card p-4">
        <ol className="flex flex-wrap items-center gap-2 text-sm" aria-label={t("Payroll steps")}>
          {steps.map((s, i) => (
            <li key={s.key} className="flex items-center gap-2">
              <span
                className={cn(
                  "grid size-6 place-items-center rounded-full text-xs font-semibold",
                  i < at ? "bg-primary text-primary-foreground" : i === at ? "bg-primary/15 text-primary ring-2 ring-primary/40" : "bg-muted text-muted-foreground",
                )}
                aria-current={i === at ? "step" : undefined}
              >
                {i < at ? <Check className="size-3.5" /> : i + 1}
              </span>
              <span className={cn(i === at ? "font-semibold" : "text-muted-foreground")}>{s.label}</span>
              {i < steps.length - 1 && <span aria-hidden className="h-px w-6 bg-border" />}
            </li>
          ))}
        </ol>
        <div className="ms-auto flex flex-wrap gap-2">
          <Button variant="outline" asChild>
            <a href={`${base}/export`}>
              <Download className="size-4" />
              {t("Excel (with bank sheet)")}
            </a>
          </Button>
          <Button variant="outline" asChild>
            <a href={`/print/${slug}/hr/payslips/${run.month}`} target="_blank" rel="noopener">
              <Printer className="size-4" />
              {t("Print payslips")}
            </a>
          </Button>
          {draft ? (
            <>
              <Button variant="ghost" className="text-muted-foreground hover:text-destructive" disabled={pending} onClick={() => confirm(t("Delete this draft payroll?")) && act(async () => { const r = await deletePayroll(run.id); if (r.ok) router.push(`/w/${slug}/hr/payroll`); return r; })}>
                <Trash2 className="size-4" />
                {t("Delete draft")}
              </Button>
              <Button variant="outline" disabled={pending} onClick={() => act(() => recalculatePayroll(run.id), t("Recalculated from the latest attendance, leave and pay"))}>
                <RotateCcw className="size-4" />
                {t("Recalculate")}
              </Button>
              <Button disabled={pending || slips.length === 0} onClick={() => confirm(t("Approve and lock this payroll? Loan instalments will be recorded as repayments.")) && act(() => approvePayroll(run.id), t("Payroll approved"))}>
                {pending ? <Loader2 className="size-4 animate-spin" /> : <BadgeCheck className="size-4" />}
                {t("Approve")}
              </Button>
            </>
          ) : run.status === "approved" ? (
            <>
              <Button variant="outline" disabled={pending} onClick={() => confirm(t("Reopen this payroll? The loan repayments it recorded are removed.")) && act(() => reopenPayroll(run.id), t("Payroll reopened"))}>
                <RotateCcw className="size-4" />
                {t("Reopen")}
              </Button>
              {moneyAccounts.length > 0 && (
                <SelectBox className="h-9" value={paidFrom} onValueChange={setPaidFrom} aria-label={t("Paid from")}>
                  {moneyAccounts.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
                </SelectBox>
              )}
              <Button disabled={pending} onClick={() => act(() => setPayrollPaid(run.id, true, paidFrom || null), t("Marked as paid"))}>
                <Banknote className="size-4" />
                {t("Mark as paid")}
              </Button>
            </>
          ) : (
            <Button variant="outline" disabled={pending} onClick={() => act(() => setPayrollPaid(run.id, false))}>
              {t("Mark as not paid")}
            </Button>
          )}
        </div>
      </div>
      {!draft && (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Lock className="size-4" aria-hidden />
          {run.status === "paid" && run.paidAt ? t("Paid on {date}. Locked.", { date: formatDate(new Date(run.paidAt).toISOString().slice(0, 10), t.intl) }) : t("Approved and locked. Reopen it to make changes.")}
        </p>
      )}

      {[...totals].map(([currency, x]) => (
        <dl key={currency} className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatTile icon={Wallet} label={t("Gross pay ({currency})", { currency })} value={formatMoney(x.gross, currency, t.intl)} hint={t.plural(x.count, "{count} person", "{count} people")} />
          <StatTile icon={Calculator} label={t("Deductions")} value={formatMoney(x.deductions, currency, t.intl)} hint={t("Social security, loans and others")} />
          <StatTile icon={Banknote} tone="good" label={t("Net to pay")} value={formatMoney(x.net, currency, t.intl)} hint={t("What goes to their bank accounts")} />
          <StatTile icon={FolderKanban} label={t("Company cost")} value={formatMoney(x.gross + x.employer, currency, t.intl)} hint={t("Gross + company social security")} />
        </dl>
      ))}

      <section aria-label={t("Payslips")} className="overflow-hidden rounded-2xl border bg-card">
        {slips.length === 0 ? (
          <p className="px-5 py-10 text-center text-sm text-muted-foreground">{t("No one to pay in this month. People need a hire date before the month ends and pay set on their file.")}</p>
        ) : (
          <div className="relative overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-xs text-muted-foreground">
                  <th scope="col" className="px-4 py-2.5 text-start font-medium">
                    {t("Person")}
                  </th>
                  <th scope="col" className="px-3 py-2.5 text-end font-medium">
                    {t("Paid days")}
                  </th>
                  <th scope="col" className="px-3 py-2.5 text-end font-medium">
                    {t("Basic")}
                  </th>
                  <th scope="col" className="px-3 py-2.5 text-end font-medium">
                    {t("Allowances")}
                  </th>
                  <th scope="col" className="px-3 py-2.5 text-end font-medium">
                    {t("Overtime")}
                  </th>
                  <th scope="col" className="px-3 py-2.5 text-end font-medium">
                    {t("Additions")}
                  </th>
                  <th scope="col" className="px-3 py-2.5 text-end font-medium">
                    {t("Deductions")}
                  </th>
                  <th scope="col" className="px-4 py-2.5 text-end font-medium">
                    {t("Net")}
                  </th>
                  <th scope="col">
                    <span className="sr-only">{t("Actions")}</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {slips.map((s) => {
                  const m = (v: string | number) => formatMoney(v, s.currency, t.intl);
                  const allow = s.allowances.reduce((a, x) => a + Number(x.amount), 0);
                  const add = s.additions.reduce((a, x) => a + Number(x.amount), 0);
                  const ded = Number(s.ssEmployee) + Number(s.loanDeduction) + s.deductions.reduce((a, x) => a + Number(x.amount), 0);
                  return (
                    <tr key={s.id} className="border-b last:border-0 hover:bg-muted/30">
                      <th scope="row" className="px-4 py-2.5 text-start font-normal">
                        <Link href={`/w/${slug}/hr/${s.employeeId}`} className="flex items-center gap-2 hover:text-primary">
                          <PersonAvatar id={s.employeeId} name={s.name} hasPhoto={s.hasPhoto} size="sm" className="size-7 text-[10px]" />
                          <span className="min-w-0">
                            <span className="block truncate font-medium" dir="auto">
                              {s.name}
                            </span>
                            <span className="block text-xs text-muted-foreground">
                              {s.code} · {t(labelOf(PAY_BASES, s.payBasis))}
                            </span>
                          </span>
                        </Link>
                      </th>
                      <td className="px-3 text-end tabular-nums">
                        {Number(s.paidDays)}
                        {Number(s.absentDays) + Number(s.unpaidLeaveDays) > 0 && (
                          <span className="block text-xs text-destructive">{t("−{days} unpaid", { days: Number(s.absentDays) + Number(s.unpaidLeaveDays) })}</span>
                        )}
                      </td>
                      <td className="px-3 text-end tabular-nums">{m(s.basicEarned)}</td>
                      <td className="px-3 text-end tabular-nums">{allow ? m(allow) : "—"}</td>
                      <td className="px-3 text-end tabular-nums">
                        {Number(s.overtimePay) ? m(s.overtimePay) : "—"}
                        {Number(s.overtimeHours) > 0 && <span className="block text-xs text-muted-foreground">{t("{hours} h", { hours: Number(s.overtimeHours) })}</span>}
                      </td>
                      <td className="px-3 text-end tabular-nums text-green-700 dark:text-green-400">{add ? `+${m(add)}` : "—"}</td>
                      <td className="px-3 text-end tabular-nums text-destructive">{ded ? `−${m(ded)}` : "—"}</td>
                      <td className="px-4 text-end font-semibold tabular-nums">{m(s.net)}</td>
                      <td className="px-2 text-end whitespace-nowrap">
                        {draft && (
                          <Button variant="ghost" size="sm" onClick={() => setEditing(s)}>
                            {t("Adjust")}
                          </Button>
                        )}
                        <Button variant="ghost" size="icon" className="size-8" asChild>
                          <a href={`/print/${slug}/hr/payslips/${run.month}?employee=${s.employeeId}`} target="_blank" rel="noopener" aria-label={t("Print {name}'s payslip", { name: s.name })}>
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

      {projects.length > 0 && (
        <Panel id="payroll-projects" title={t("Labour cost by project")} icon={FolderKanban}>
          <ul className="divide-y border-t">
            {projects.map((p) => (
              <li key={p.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-2.5 text-sm">
                <Link href={`/w/${slug}/p/${p.key}/timesheets`} className="font-medium hover:text-primary" dir="auto">
                  {p.name} <span className="text-xs text-muted-foreground">{p.key}</span>
                </Link>
                <span className="tabular-nums">{p.costs.map((c) => formatMoney(c.amount, c.currency, t.intl)).join(" · ")}</span>
              </li>
            ))}
          </ul>
          <p className="px-5 py-3 text-xs text-muted-foreground">{t("Each linked person's cost (pay + company social security) split by their approved project time this month. For information; it isn't added to project spending.")}</p>
        </Panel>
      )}

      <AdjustDialog slip={editing} onClose={() => setEditing(null)} />
    </div>
  );
}

function LinesEditor({ label, value, onChange, error }: { label: string; value: { name: string; amount: string }[]; onChange: (v: { name: string; amount: string }[]) => void; error?: string }) {
  const t = useT();
  return (
    <fieldset className="grid gap-2">
      <legend className="mb-1 text-sm font-medium">{label}</legend>
      {value.map((l, i) => (
        <div key={i} className="flex items-center gap-2">
          <Input dir="auto" aria-label={t("Name")} placeholder={t("e.g. Bonus")} value={l.name} maxLength={80} onChange={(e) => onChange(value.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} />
          <Input dir="ltr" inputMode="decimal" aria-label={t("Amount")} className="w-32" placeholder="0" value={l.amount} onChange={(e) => onChange(value.map((x, j) => (j === i ? { ...x, amount: e.target.value } : x)))} />
          <Button type="button" variant="ghost" size="icon" aria-label={t("Remove")} onClick={() => onChange(value.filter((_, j) => j !== i))}>
            <X className="size-4" />
          </Button>
        </div>
      ))}
      <Button type="button" variant="outline" size="sm" className="justify-self-start" onClick={() => onChange([...value, { name: "", amount: "" }])} disabled={value.length >= 20}>
        <Plus className="size-4" />
        {t("Add a line")}
      </Button>
      <FieldError message={error} />
    </fieldset>
  );
}

function AdjustDialog({ slip, onClose }: { slip: Slip | null; onClose: () => void }) {
  const t = useT();
  const [f, setF] = useState({ additions: [] as { name: string; amount: string }[], deductions: [] as { name: string; amount: string }[], loanDeduction: "" });
  const [last, setLast] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [pending, start] = useTransition();
  if ((slip?.id ?? null) !== last) {
    setLast(slip?.id ?? null);
    if (slip) {
      setF({ additions: slip.additions, deductions: slip.deductions, loanDeduction: Number(slip.loanDeduction) ? slip.loanDeduction : "" });
      setErrors({});
    }
  }
  if (!slip) return null;
  const m = (v: string | number) => formatMoney(v, slip.currency, t.intl);
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
        <form
          className="grid gap-5"
          onSubmit={(e) => {
            e.preventDefault();
            start(async () => {
              const res = await adjustPayslip(slip.id, f);
              if (!res.ok) return setErrors(res.fieldErrors ?? { form: res.error });
              toast.success(t("Saved"));
              onClose();
            });
          }}
        >
          <DialogHeader>
            <DialogTitle>{t("Adjust {name}'s pay", { name: slip.name })}</DialogTitle>
            <DialogDescription>
              {t("Basic {basic} · allowances {allowances} · overtime {overtime}", {
                basic: m(slip.basicEarned),
                allowances: m(slip.allowances.reduce((a, x) => a + Number(x.amount), 0)),
                overtime: m(slip.overtimePay),
              })}
            </DialogDescription>
          </DialogHeader>
          <LinesEditor label={t("Additions (bonus, commission…)")} value={f.additions} onChange={(additions) => setF({ ...f, additions })} />
          <LinesEditor label={t("Other deductions (fine, advance…)")} value={f.deductions} onChange={(deductions) => setF({ ...f, deductions })} error={errors.deductions} />
          <div className="grid gap-1.5">
            <Label htmlFor="adj-loan">{t("Loan instalment")}</Label>
            <Input id="adj-loan" dir="ltr" inputMode="decimal" className="w-40" placeholder="0" value={f.loanDeduction} onChange={(e) => setF({ ...f, loanDeduction: e.target.value })} disabled={slip.owed === 0} aria-invalid={Boolean(errors.loanDeduction)} />
            <p className="text-xs text-muted-foreground">
              {slip.owed > 0 ? t("They owe {amount} in loans. On approval it's recorded as a repayment, oldest loan first.", { amount: m(slip.owed) }) : t("No open loans (linked by their login or worker).")}
            </p>
            <FieldError message={errors.loanDeduction} />
          </div>
          <FieldError message={errors.form} />
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose}>
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
