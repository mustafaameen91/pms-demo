"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { CalendarCheck, FileSignature, Loader2, Package, Paperclip, Plane, Plus, Printer, Trash2, Undo2, Wallet } from "lucide-react";
import { toast } from "sonner";
import { deleteContract, saveContract } from "@/lib/actions/hr-ops";
import { EMPLOYMENT_TYPES, labelOf } from "@/lib/hr";
import { assetCode, type LeaveBalance, type MonthSummary } from "@/lib/hr-rules";
import { cn, formatDate, formatMoney } from "@/lib/utils";
import { useT } from "@/i18n/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SelectBox } from "@/components/ui/select-box";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { FieldError } from "@/components/projects/project-fields";
import { Panel } from "@/components/page/kit";
import { BalanceBar, RecordLeaveButton } from "./leave-view";
import { TakeBackDialog } from "./assets-view";

type LeaveType = { id: string; name: string; paid: boolean; color: string; hasBalance: boolean; archived: boolean };

export function EmployeeLeavePanel({
  slug,
  today,
  employee,
  types,
  balances,
  requests,
}: {
  slug: string;
  today: string;
  employee: { id: string; name: string; code: string; hasPhoto: boolean };
  types: LeaveType[];
  balances: Record<string, LeaveBalance | null>;
  requests: { id: string; typeId: string; startDate: string; endDate: string; days: number; status: string }[];
}) {
  const t = useT();
  const typeOf = new Map(types.map((x) => [x.id, x]));
  const withBalance = types.filter((x) => x.hasBalance && !x.archived);
  return (
    <Panel
      id="emp-leave"
      title={t("Leave")}
      icon={Plane}
      action={<RecordLeaveButton slug={slug} people={[{ ...employee, linked: false }]} types={types.filter((x) => !x.archived)} today={today} employeeId={employee.id} variant="outline" />}
    >
      <div className="grid gap-4 px-5 pb-5">
        {withBalance.length > 0 && (
          <div className="grid gap-4 sm:grid-cols-2">
            {withBalance.map((ty) => (
              <div key={ty.id} className="grid gap-1">
                <p className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                  <span aria-hidden className="size-2 rounded-full" style={{ backgroundColor: ty.color }} />
                  {t(ty.name)}
                </p>
                {balances[ty.id] ? <BalanceBar v={balances[ty.id]!} color={ty.color} /> : "—"}
              </div>
            ))}
          </div>
        )}
        {requests.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("No leave recorded yet.")}</p>
        ) : (
          <ul className="grid gap-2 border-t pt-3">
            {requests.slice(0, 6).map((r) => {
              const ty = typeOf.get(r.typeId);
              return (
                <li key={r.id} className="flex flex-wrap items-center gap-2 text-sm">
                  <span aria-hidden className="size-2 rounded-full" style={{ backgroundColor: ty?.color }} />
                  <span className="font-medium">{ty ? t(ty.name) : ""}</span>
                  <span className="text-muted-foreground">
                    {r.startDate === r.endDate ? formatDate(r.startDate, t.intl) : `${formatDate(r.startDate, t.intl)} – ${formatDate(r.endDate, t.intl)}`} · {t.plural(r.days, "{count} day", "{count} days")}
                  </span>
                  <span
                    className={cn(
                      "ms-auto rounded-full px-2 py-0.5 text-xs",
                      r.status === "approved" ? "bg-green-600/10 text-green-700 dark:text-green-400" : r.status === "pending" ? "bg-amber-500/15 text-amber-800 dark:text-amber-300" : "bg-muted text-muted-foreground",
                    )}
                  >
                    {t({ approved: "Approved", pending: "Waiting", rejected: "Not approved", cancelled: "Cancelled" }[r.status] ?? r.status)}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
        <Link href={`/w/${slug}/hr/leave`} className="text-sm text-primary hover:underline">
          {t("All leave")}
        </Link>
      </div>
    </Panel>
  );
}

export function EmployeeAttendancePanel({ slug, month, summary }: { slug: string; month: string; summary: MonthSummary | null }) {
  const t = useT();
  const [y, m] = month.split("-").map(Number);
  const title = new Date(y, m - 1, 1).toLocaleDateString(t.intl, { month: "long" });
  const items: [string, number, string?][] = summary
    ? [
        [t("Worked"), summary.workedDays],
        [t("Absent"), summary.absentDays, summary.absentDays ? "text-destructive" : undefined],
        [t("Late"), summary.lateDays, summary.lateDays ? "text-amber-700 dark:text-amber-400" : undefined],
        [t("On leave"), summary.paidLeaveDays + summary.unpaidLeaveDays],
        [t("Overtime h"), summary.overtimeHours],
      ]
    : [];
  return (
    <Panel id="emp-attendance" title={t("Attendance in {month}", { month: title })} icon={CalendarCheck}>
      {summary ? (
        <div className="grid gap-3 px-5 pb-5">
          <dl className="grid grid-cols-5 gap-2 text-center">
            {items.map(([label, value, tone]) => (
              <div key={label} className="rounded-xl bg-muted/50 px-1 py-2">
                <dd className={cn("text-lg font-bold tabular-nums", tone)}>{value.toLocaleString(t.intl)}</dd>
                <dt className="text-[11px] text-muted-foreground">{label}</dt>
              </div>
            ))}
          </dl>
          {summary.notRecorded > 0 && <p className="text-xs text-muted-foreground">{t.plural(summary.notRecorded, "{count} working day not recorded (counted as worked).", "{count} working days not recorded (counted as worked).")}</p>}
          <Link href={`/w/${slug}/hr/attendance?view=month&month=${month}`} className="text-sm text-primary hover:underline">
            {t("Open the month")}
          </Link>
        </div>
      ) : (
        <p className="px-5 pb-5 text-sm text-muted-foreground">{t("Not employed this month.")}</p>
      )}
    </Panel>
  );
}

export function EmployeeAssetsPanel({
  slug,
  today,
  items,
}: {
  slug: string;
  today: string;
  items: { assignmentId: string; assetId: string; name: string; number: number; condition: string; assignedOn: string; returnedOn: string | null; conditionIn: string | null; holderName: string }[];
}) {
  const t = useT();
  const [taking, setTaking] = useState<(typeof items)[number] | null>(null);
  const held = items.filter((i) => !i.returnedOn);
  const past = items.filter((i) => i.returnedOn);
  return (
    <Panel
      id="emp-assets"
      title={t("Company assets they hold")}
      icon={Package}
      count={held.length}
      action={
        <Button variant="ghost" size="sm" asChild>
          <Link href={`/w/${slug}/hr/assets`}>{t("Hand over")}</Link>
        </Button>
      }
    >
      {items.length === 0 ? (
        <p className="px-5 pb-5 text-sm text-muted-foreground">{t("Nothing handed to them.")}</p>
      ) : (
        <ul className="grid gap-1 px-3 pb-3">
          {held.map((i) => (
            <li key={i.assignmentId} className="flex flex-wrap items-center gap-2 rounded-lg px-2 py-2 hover:bg-muted/50">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium" dir="auto">
                  {i.name}
                </p>
                <p className="text-xs text-muted-foreground">
                  <span dir="ltr">{assetCode(i.number)}</span> · {t("since {date}", { date: formatDate(i.assignedOn, t.intl) })}
                </p>
              </div>
              <Button variant="ghost" size="icon" className="size-8" asChild>
                <a href={`/print/${slug}/hr/handover/${i.assignmentId}`} target="_blank" rel="noopener" aria-label={t("Print handover receipt")}>
                  <Printer className="size-4" />
                </a>
              </Button>
              <Button variant="outline" size="sm" onClick={() => setTaking(i)}>
                <Undo2 className="size-4" />
                {t("Take back")}
              </Button>
            </li>
          ))}
          {past.length > 0 && (
            <li className="px-2 pt-2 text-xs text-muted-foreground">
              {t("Returned before: {list}", { list: past.map((p) => `${p.name} (${formatDate(p.returnedOn, t.intl)})`).join(t(", ")) })}
            </li>
          )}
        </ul>
      )}
      <TakeBackDialog asset={taking ? { name: taking.name, condition: taking.condition, holder: { assignmentId: taking.assignmentId, name: taking.holderName } } : null} today={today} onClose={() => setTaking(null)} />
    </Panel>
  );
}

type Contract = { id: string; startDate: string; endDate: string | null; employmentType: string; jobTitle: string | null; basicPay: string | null; currency: string; note: string | null; fileName: string | null; hasFile: boolean };

export function EmployeeContractsPanel({ employeeId, today, contracts, defaults }: { employeeId: string; today: string; contracts: Contract[]; defaults: { employmentType: string; jobTitle: string | null; basicPay: string | null; startDate: string } }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [pending, start] = useTransition();
  return (
    <Panel
      id="emp-contracts"
      title={t("Contracts")}
      icon={FileSignature}
      count={contracts.length}
      action={
        <Button variant="outline" size="sm" onClick={() => (setErrors({}), setOpen(true))}>
          <Plus className="size-4" />
          {contracts.length ? t("Renew / new contract") : t("Add contract")}
        </Button>
      }
    >
      {contracts.length === 0 ? (
        <p className="px-5 pb-5 text-sm text-muted-foreground">{t("Keep each contract and renewal here, with the signed scan.")}</p>
      ) : (
        <ol className="divide-y border-t">
          {contracts.map((c, i) => {
            const current = i === 0 && (!c.endDate || c.endDate >= today) && c.startDate <= today;
            return (
              <li key={c.id} className="flex flex-wrap items-center gap-3 px-5 py-3">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">
                    {formatDate(c.startDate, t.intl)} → {c.endDate ? formatDate(c.endDate, t.intl) : t("open-ended")}
                    {current && <span className="ms-2 rounded-full bg-green-600/10 px-2 py-0.5 text-xs text-green-700 dark:text-green-400">{t("Current")}</span>}
                  </p>
                  <p className="truncate text-xs text-muted-foreground" dir="auto">
                    {[t(labelOf(EMPLOYMENT_TYPES, c.employmentType)), c.jobTitle, c.basicPay ? formatMoney(c.basicPay, c.currency, t.intl) : null, c.note].filter(Boolean).join(" · ")}
                  </p>
                </div>
                {c.hasFile && (
                  <Button variant="ghost" size="icon" className="size-8" asChild>
                    <a href={`/api/files/hr/contract/${c.id}`} target="_blank" rel="noopener" aria-label={t("Open file {name}", { name: c.fileName ?? "" })}>
                      <Paperclip className="size-4" />
                    </a>
                  </Button>
                )}
                <Button variant="ghost" size="icon" className="size-8 text-muted-foreground hover:text-destructive" aria-label={t("Delete")} onClick={() => confirm(t("Delete this contract record and its file?")) && start(async () => void (await deleteContract(c.id)))}>
                  <Trash2 className="size-4" />
                </Button>
              </li>
            );
          })}
        </ol>
      )}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-lg">
          <form
            className="grid gap-4"
            onSubmit={(e) => {
              e.preventDefault();
              const fd = new FormData(e.currentTarget);
              start(async () => {
                const res = await saveContract(employeeId, fd);
                if (!res.ok) return setErrors(res.fieldErrors ?? { form: res.error });
                toast.success(t("Contract saved"));
                setOpen(false);
              });
            }}
          >
            <DialogHeader>
              <DialogTitle>{contracts.length ? t("Renew / new contract") : t("Add contract")}</DialogTitle>
              <DialogDescription>{t("Leave the end date empty for an open-ended contract.")}</DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-1.5">
                <Label htmlFor="ct-start">{t("Starts")}</Label>
                <Input id="ct-start" name="startDate" type="date" defaultValue={contracts[0]?.endDate ?? defaults.startDate} required aria-invalid={Boolean(errors.startDate)} />
                <FieldError message={errors.startDate} />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="ct-end">{t("Ends")}</Label>
                <Input id="ct-end" name="endDate" type="date" aria-invalid={Boolean(errors.endDate)} />
                <FieldError message={errors.endDate} />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="ct-type">{t("Employment type")}</Label>
                <SelectBox id="ct-type" name="employmentType" className="h-9 w-full" defaultValue={defaults.employmentType}>
                  {EMPLOYMENT_TYPES.map((o) => (
                    <option key={o.value} value={o.value}>
                      {t(o.label)}
                    </option>
                  ))}
                </SelectBox>
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="ct-pay">{t("Basic pay")}</Label>
                <Input id="ct-pay" name="basicPay" dir="ltr" inputMode="decimal" defaultValue={defaults.basicPay ?? ""} aria-invalid={Boolean(errors.basicPay)} />
                <FieldError message={errors.basicPay} />
              </div>
              <div className="grid gap-1.5 sm:col-span-2">
                <Label htmlFor="ct-title">{t("Job title")}</Label>
                <Input id="ct-title" name="jobTitle" dir="auto" defaultValue={defaults.jobTitle ?? ""} maxLength={120} />
              </div>
              <div className="grid gap-1.5 sm:col-span-2">
                <Label htmlFor="ct-file">{t("Signed contract (scan)")}</Label>
                <Input id="ct-file" name="file" type="file" accept="application/pdf,image/jpeg,image/png,image/webp" aria-invalid={Boolean(errors.file)} />
                <FieldError message={errors.file} />
              </div>
              <div className="grid gap-1.5 sm:col-span-2">
                <Label htmlFor="ct-note">
                  {t("Note")} <span className="font-normal text-muted-foreground">{t("(optional)")}</span>
                </Label>
                <Input id="ct-note" name="note" dir="auto" maxLength={500} />
              </div>
            </div>
            <label className="flex cursor-pointer items-center gap-2 text-sm">
              <input type="checkbox" name="applyToFile" value="1" defaultChecked className="size-4 accent-primary" />
              {t("Update their file to match (contract end, type, job title, pay)")}
            </label>
            <FieldError message={errors.form} />
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
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
    </Panel>
  );
}

export function EmployeePayslipsPanel({ slug, employeeId, slips }: { slug: string; employeeId: string; slips: { id: string; month: string; status: string; net: string; currency: string }[] }) {
  const t = useT();
  return (
    <Panel id="emp-payslips" title={t("Payslips")} icon={Wallet} count={slips.length}>
      {slips.length === 0 ? (
        <p className="px-5 pb-5 text-sm text-muted-foreground">{t("No payroll has included them yet.")}</p>
      ) : (
        <ul className="divide-y border-t">
          {slips.slice(0, 12).map((s) => (
            <li key={s.id} className="flex items-center gap-3 px-5 py-2.5 text-sm">
              <Link href={`/w/${slug}/hr/payroll/${s.month}`} className="flex-1 font-medium hover:text-primary">
                {new Date(Number(s.month.slice(0, 4)), Number(s.month.slice(5)) - 1, 1).toLocaleDateString(t.intl, { month: "long", year: "numeric" })}
              </Link>
              <span className="text-xs text-muted-foreground">{t({ draft: "Draft", approved: "Approved", paid: "Paid|payroll" }[s.status] ?? s.status)}</span>
              <span className="font-semibold tabular-nums">{formatMoney(s.net, s.currency, t.intl)}</span>
              <a href={`/print/${slug}/hr/payslips/${s.month}?employee=${employeeId}`} target="_blank" rel="noopener" className="text-muted-foreground hover:text-primary" aria-label={t("Print payslip")}>
                <Printer className="size-4" />
              </a>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

