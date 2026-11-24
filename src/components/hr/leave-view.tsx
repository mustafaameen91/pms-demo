"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { BadgeCheck, CalendarDays, Check, ChevronLeft, ChevronRight, Loader2, Plane, Plus, Scale, X, XCircle } from "lucide-react";
import { toast } from "sonner";
import { cancelLeave, decideLeave, saveLeaveRequest, type LeaveInput } from "@/lib/actions/hr-ops";
import { addDays, monthDays, shiftMonth, weekday, type LeaveBalance } from "@/lib/hr-rules";
import { cn, formatDate } from "@/lib/utils";
import { useT } from "@/i18n/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { SelectBox } from "@/components/ui/select-box";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { FieldError } from "@/components/projects/project-fields";
import { Panel, SummaryChip } from "@/components/page/kit";
import { PersonAvatar } from "./hr-ui";

type Person = { id: string; name: string; code: string; hasPhoto: boolean; linked: boolean };
type LeaveType = { id: string; name: string; paid: boolean; color: string; hasBalance: boolean; archived: boolean };
type Request = {
  id: string;
  employeeId: string;
  name: string;
  hasPhoto: boolean;
  typeId: string;
  startDate: string;
  endDate: string;
  days: number;
  reason: string | null;
  status: string;
  decidedBy: string | null;
  decisionNote: string | null;
};

const STATUS_STYLE: Record<string, string> = {
  pending: "bg-amber-500/15 text-amber-800 dark:text-amber-300",
  approved: "bg-green-600/10 text-green-700 dark:text-green-400",
  rejected: "bg-destructive/10 text-destructive",
  cancelled: "bg-muted text-muted-foreground",
};
const STATUS_LABEL: Record<string, string> = { pending: "Waiting", approved: "Approved", rejected: "Not approved", cancelled: "Cancelled" };

export function LeaveView({
  slug,
  today,
  month,
  holidays,
  people,
  types,
  requests,
  balances,
}: {
  slug: string;
  today: string;
  month: string;
  holidays: { date: string; name: string }[];
  people: Person[];
  types: LeaveType[];
  requests: Request[];
  balances: { employeeId: string; values: Record<string, LeaveBalance | null> }[];
}) {
  const t = useT();
  const typeOf = new Map(types.map((x) => [x.id, x]));
  const pending = requests.filter((r) => r.status === "pending");
  const approved = requests.filter((r) => r.status === "approved");
  const offToday = approved.filter((r) => r.startDate <= today && today <= r.endDate);
  const weekEnd = addDays(today, 6);
  const offWeek = approved.filter((r) => r.startDate <= weekEnd && r.endDate >= today);
  const upcoming = approved.filter((r) => r.endDate >= today).sort((a, b) => a.startDate.localeCompare(b.startDate));
  const [filter, setFilter] = useState("all");
  const history = requests.filter((r) => filter === "all" || r.status === filter);
  const balanceTypes = types.filter((x) => x.hasBalance && !x.archived);

  return (
    <div className="grid grid-cols-1 gap-6">
      <div className="flex flex-wrap items-center gap-2">
        <SummaryChip icon={BadgeCheck} label={t("waiting for a decision")} value={pending.length} tone={pending.length ? "bad" : "default"} />
        <SummaryChip icon={Plane} label={t("off today")} value={offToday.length} />
        <SummaryChip icon={CalendarDays} label={t("off in the next 7 days")} value={offWeek.length} />
        <div className="ms-auto">
          <RecordLeaveButton slug={slug} people={people} types={types.filter((x) => !x.archived)} today={today} />
        </div>
      </div>

      {pending.length > 0 && (
        <Panel id="leave-pending" title={t("Waiting for a decision")} icon={BadgeCheck} count={pending.length}>
          <ul className="divide-y border-t">
            {pending.map((r) => (
              <RequestRow key={r.id} slug={slug} r={r} type={typeOf.get(r.typeId)} actions />
            ))}
          </ul>
        </Panel>
      )}

      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_24rem]">
        <LeaveCalendar slug={slug} month={month} today={today} holidays={holidays} requests={approved.concat(pending)} typeOf={typeOf} />
        <Panel id="leave-upcoming" title={t("Off now and coming up")} icon={Plane} count={upcoming.length}>
          {upcoming.length === 0 ? (
            <p className="px-5 pb-5 text-sm text-muted-foreground">{t("No one has approved leave coming up.")}</p>
          ) : (
            <ul className="divide-y border-t">
              {upcoming.slice(0, 12).map((r) => (
                <RequestRow key={r.id} slug={slug} r={r} type={typeOf.get(r.typeId)} compact />
              ))}
            </ul>
          )}
        </Panel>
      </div>

      {balanceTypes.length > 0 && (
        <Panel id="leave-balances" title={t("Balances this year")} icon={Scale}>
          <div className="relative overflow-x-auto border-t">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-xs text-muted-foreground">
                  <th scope="col" className="px-5 py-2 text-start font-medium">
                    {t("Person")}
                  </th>
                  {balanceTypes.map((ty) => (
                    <th key={ty.id} scope="col" className="px-3 py-2 text-start font-medium">
                      <span className="inline-flex items-center gap-1.5">
                        <span aria-hidden className="size-2 rounded-full" style={{ backgroundColor: ty.color }} />
                        {t(ty.name)}
                      </span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {balances.map((b) => {
                  const p = people.find((x) => x.id === b.employeeId);
                  if (!p) return null;
                  return (
                    <tr key={b.employeeId} className="border-b last:border-0">
                      <th scope="row" className="px-5 py-2 text-start font-normal">
                        <Link href={`/w/${slug}/hr/${p.id}`} className="flex items-center gap-2 hover:text-primary">
                          <PersonAvatar id={p.id} name={p.name} hasPhoto={p.hasPhoto} size="sm" className="size-7 text-[10px]" />
                          <span className="truncate" dir="auto">
                            {p.name}
                          </span>
                        </Link>
                      </th>
                      {balanceTypes.map((ty) => {
                        const v = b.values[ty.id];
                        return (
                          <td key={ty.id} className="px-3 py-2">
                            {v ? <BalanceBar v={v} color={ty.color} /> : "—"}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="px-5 py-3 text-xs text-muted-foreground">{t("Available = earned so far this year + carried over − taken. Days are earned month by month.")}</p>
        </Panel>
      )}

      <Panel
        id="leave-history"
        title={t("All requests")}
        icon={CalendarDays}
        count={history.length}
        action={
          <SelectBox size="sm" value={filter} onValueChange={setFilter} aria-label={t("Status")}>
            <option value="all">{t("All")}</option>
            {Object.entries(STATUS_LABEL).map(([k, v]) => (
              <option key={k} value={k}>
                {t(v)}
              </option>
            ))}
          </SelectBox>
        }
      >
        {history.length === 0 ? (
          <p className="px-5 pb-5 text-sm text-muted-foreground">{t("No leave recorded yet.")}</p>
        ) : (
          <ul className="divide-y border-t">
            {history.slice(0, 100).map((r) => (
              <RequestRow key={r.id} slug={slug} r={r} type={typeOf.get(r.typeId)} actions={r.status === "pending"} cancellable={r.status === "approved" && r.endDate >= today} />
            ))}
          </ul>
        )}
      </Panel>
    </div>
  );
}

/** "12 of 21 left" with a bar. */
export function BalanceBar({ v, color }: { v: LeaveBalance; color: string }) {
  const t = useT();
  const total = Math.max(v.entitlement + v.carried, 0.1);
  return (
    <div className="grid min-w-32 gap-1" title={t("Earned {accrued}, carried {carried}, taken {used}, waiting {pending}", { accrued: v.accrued, carried: v.carried, used: v.used, pending: v.pending })}>
      <span className="text-xs">
        <span className={cn("font-semibold tabular-nums", v.available < 0 && "text-destructive")}>{v.available.toLocaleString(t.intl)}</span>
        <span className="text-muted-foreground"> {t("days left of {total}", { total: (v.entitlement + v.carried).toLocaleString(t.intl) })}</span>
      </span>
      <div className="h-1.5 overflow-hidden rounded-full bg-muted" aria-hidden>
        <div className="h-full rounded-full" style={{ width: `${Math.min(100, Math.max(0, (v.used / total) * 100))}%`, backgroundColor: color }} />
      </div>
    </div>
  );
}

function RequestRow({ slug, r, type, actions, compact, cancellable }: { slug: string; r: Request; type?: LeaveType; actions?: boolean; compact?: boolean; cancellable?: boolean }) {
  const t = useT();
  const [pending, start] = useTransition();
  const [rejecting, setRejecting] = useState(false);
  const [note, setNote] = useState("");
  const range = r.startDate === r.endDate ? formatDate(r.startDate, t.intl) : `${formatDate(r.startDate, t.intl)} – ${formatDate(r.endDate, t.intl)}`;
  return (
    <li className="flex flex-wrap items-center gap-3 px-5 py-3">
      <PersonAvatar id={r.employeeId} name={r.name} hasPhoto={r.hasPhoto} size="sm" />
      <div className="min-w-0 flex-1">
        <p className="flex flex-wrap items-center gap-x-2 text-sm">
          <Link href={`/w/${slug}/hr/${r.employeeId}`} className="font-medium hover:text-primary" dir="auto">
            {r.name}
          </Link>
          {type && (
            <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
              <span aria-hidden className="size-2 rounded-full" style={{ backgroundColor: type.color }} />
              {t(type.name)}
            </span>
          )}
        </p>
        <p className="text-xs text-muted-foreground">
          {range} · {t.plural(r.days, "{count} day", "{count} days")}
          {r.reason && !compact && (
            <>
              {" · "}
              <span dir="auto">{r.reason}</span>
            </>
          )}
          {r.decisionNote && !compact && (
            <>
              {" · "}
              <span dir="auto">{r.decisionNote}</span>
            </>
          )}
        </p>
      </div>
      {!compact && !actions && <span className={cn("rounded-full px-2 py-0.5 text-xs font-medium", STATUS_STYLE[r.status])}>{t(STATUS_LABEL[r.status] ?? r.status)}</span>}
      {compact && r.status === "approved" && <span className="text-xs text-muted-foreground">{t.plural(r.days, "{count} day", "{count} days")}</span>}
      {actions && (
        <div className="flex items-center gap-2">
          {rejecting ? (
            <>
              <Input dir="auto" className="h-8 w-48" placeholder={t("Reason (optional)")} value={note} onChange={(e) => setNote(e.target.value)} aria-label={t("Reason")} />
              <Button size="sm" variant="destructive" disabled={pending} onClick={() => start(async () => void ((await decideLeave(r.id, "rejected", note)).ok && toast.success(t("Not approved"))))}>
                {t("Reject")}
              </Button>
              <Button size="icon" variant="ghost" className="size-8" onClick={() => setRejecting(false)} aria-label={t("Cancel")}>
                <X className="size-4" />
              </Button>
            </>
          ) : (
            <>
              <Button size="sm" variant="outline" onClick={() => setRejecting(true)}>
                <XCircle className="size-4" />
                {t("Reject")}
              </Button>
              <Button size="sm" disabled={pending} onClick={() => start(async () => void ((await decideLeave(r.id, "approved")).ok && toast.success(t("Approved"))))}>
                {pending ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
                {t("Approve")}
              </Button>
            </>
          )}
        </div>
      )}
      {cancellable && (
        <Button size="sm" variant="ghost" className="text-muted-foreground" disabled={pending} onClick={() => confirm(t("Cancel this leave? The days go back to their balance.")) && start(async () => void (await cancelLeave(r.id)))}>
          {t("Cancel leave")}
        </Button>
      )}
    </li>
  );
}

/** Month calendar: who is off each day. */
function LeaveCalendar({
  slug,
  month,
  today,
  holidays,
  requests,
  typeOf,
}: {
  slug: string;
  month: string;
  today: string;
  holidays: { date: string; name: string }[];
  requests: Request[];
  typeOf: Map<string, LeaveType>;
}) {
  const t = useT();
  const days = monthDays(month);
  const [y, m] = month.split("-").map(Number);
  const title = new Date(y, m - 1, 1).toLocaleDateString(t.intl, { month: "long", year: "numeric" });
  // Weeks start on Saturday (common where the work week starts then); empty cells before day 1.
  const order = [6, 0, 1, 2, 3, 4, 5];
  const lead = order.indexOf(weekday(days[0]));
  // Jan 1, 2023 was a Sunday (weekday 0).
  const names = order.map((d) => new Date(2023, 0, 1 + d).toLocaleDateString(t.intl, { weekday: "short" }));
  const hol = new Map(holidays.map((h) => [h.date, h.name]));
  const base = `/w/${slug}/hr/leave`;
  return (
    <Panel
      id="leave-calendar"
      title={title}
      icon={CalendarDays}
      action={
        <div className="flex items-center">
          <Button variant="ghost" size="icon" className="size-8" asChild aria-label={t("Previous month")}>
            <Link href={`${base}?month=${shiftMonth(month, -1)}`}>
              <ChevronLeft className="size-4 rtl:rotate-180" />
            </Link>
          </Button>
          <Button variant="ghost" size="icon" className="size-8" asChild aria-label={t("Next month")}>
            <Link href={`${base}?month=${shiftMonth(month, 1)}`}>
              <ChevronRight className="size-4 rtl:rotate-180" />
            </Link>
          </Button>
        </div>
      }
    >
      <div className="grid grid-cols-7 border-t text-xs">
        {names.map((n, i) => (
          <div key={i} className="border-b px-2 py-1.5 text-center font-medium text-muted-foreground">
            {n}
          </div>
        ))}
        {Array.from({ length: lead }, (_, i) => (
          <div key={`e${i}`} className="min-h-20 border-b border-e bg-muted/20" />
        ))}
        {days.map((d) => {
          const off = requests.filter((r) => r.startDate <= d && d <= r.endDate);
          return (
            <div key={d} className={cn("min-h-20 border-b border-e p-1", d === today && "bg-primary/5")}>
              <p className={cn("mb-0.5 text-[11px] font-semibold tabular-nums", d === today ? "text-primary" : "text-muted-foreground")}>{Number(d.slice(8))}</p>
              {hol.has(d) && (
                <p className="mb-0.5 truncate rounded bg-sky-500/10 px-1 text-[10px] text-sky-800 dark:text-sky-300" dir="auto" title={hol.get(d)}>
                  {hol.get(d)}
                </p>
              )}
              <ul className="grid gap-0.5">
                {off.slice(0, 3).map((r) => {
                  const ty = typeOf.get(r.typeId);
                  return (
                    <li
                      key={r.id}
                      className={cn("truncate rounded px-1 text-[10px] leading-4 text-white", r.status === "pending" && "opacity-60 outline-1 outline-dashed")}
                      style={{ backgroundColor: ty?.color ?? "#4F46E5" }}
                      dir="auto"
                      title={`${r.name} · ${ty ? t(ty.name) : ""}${r.status === "pending" ? ` · ${t("Waiting")}` : ""}`}
                    >
                      {r.name.split(" ")[0]}
                    </li>
                  );
                })}
                {off.length > 3 && <li className="text-[10px] text-muted-foreground">+{off.length - 3}</li>}
              </ul>
            </div>
          );
        })}
      </div>
    </Panel>
  );
}

/** Record leave for someone (approved at once, or left waiting). */
export function RecordLeaveButton({ slug, people, types, today, employeeId, variant = "default" }: { slug: string; people: Person[]; types: LeaveType[]; today: string; employeeId?: string; variant?: "default" | "outline" }) {
  const t = useT();
  const blank = (): LeaveInput => ({ employeeId: employeeId ?? "", typeId: types[0]?.id ?? "", startDate: today, endDate: today, halfDay: false, reason: "", approve: true });
  const [open, setOpen] = useState(false);
  const [f, setF] = useState<LeaveInput>(blank);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [over, setOver] = useState<{ available: number; days: number } | null>(null);
  const [pending, start] = useTransition();
  const submit = (force: boolean) =>
    start(async () => {
      setErrors({});
      const res = await saveLeaveRequest(slug, { ...f, force });
      if (!res.ok) return setErrors(res.fieldErrors ?? { form: res.error });
      if (res.data?.overBalance) return setOver(res.data.overBalance);
      toast.success(f.approve ? t("Leave recorded") : t("Leave request saved"));
      setOver(null);
      setOpen(false);
    });
  return (
    <>
      <Button variant={variant} onClick={() => (setF(blank()), setErrors({}), setOver(null), setOpen(true))}>
        <Plus className="size-4" />
        {t("Record leave")}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <form
            className="grid gap-4"
            onSubmit={(e) => {
              e.preventDefault();
              submit(false);
            }}
          >
            <DialogHeader>
              <DialogTitle>{t("Record leave")}</DialogTitle>
              <DialogDescription>{t("Weekends and holidays inside the dates aren't counted.")}</DialogDescription>
            </DialogHeader>
            {!employeeId && (
              <div className="grid gap-1.5">
                <Label htmlFor="lv-person">{t("Person")}</Label>
                <SelectBox id="lv-person" className="h-9 w-full" value={f.employeeId} onValueChange={(v) => setF({ ...f, employeeId: v })} placeholder={t("Choose a person")} aria-invalid={Boolean(errors.employeeId)}>
                  {people.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </SelectBox>
                <FieldError message={errors.employeeId} />
              </div>
            )}
            <div className="grid gap-1.5">
              <Label htmlFor="lv-type">{t("Type")}</Label>
              <SelectBox id="lv-type" className="h-9 w-full" value={f.typeId} onValueChange={(v) => setF({ ...f, typeId: v })}>
                {types.map((x) => (
                  <option key={x.id} value={x.id}>
                    {t(x.name)}
                    {x.paid ? "" : ` (${t("Unpaid")})`}
                  </option>
                ))}
              </SelectBox>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-1.5">
                <Label htmlFor="lv-from">{t("From")}</Label>
                <Input id="lv-from" type="date" value={f.startDate} onChange={(e) => setF({ ...f, startDate: e.target.value, endDate: f.endDate < e.target.value ? e.target.value : f.endDate })} aria-invalid={Boolean(errors.startDate)} />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="lv-to">{t("To")}</Label>
                <Input id="lv-to" type="date" value={f.endDate} min={f.startDate} onChange={(e) => setF({ ...f, endDate: e.target.value })} aria-invalid={Boolean(errors.endDate)} />
              </div>
            </div>
            <FieldError message={errors.startDate ?? errors.endDate} />
            {f.startDate === f.endDate && (
              <label className="flex cursor-pointer items-center gap-2 text-sm">
                <input type="checkbox" className="size-4 accent-primary" checked={Boolean(f.halfDay)} onChange={(e) => setF({ ...f, halfDay: e.target.checked })} />
                {t("Half day")}
              </label>
            )}
            <div className="grid gap-1.5">
              <Label htmlFor="lv-reason">
                {t("Reason")} <span className="font-normal text-muted-foreground">{t("(optional)")}</span>
              </Label>
              <Textarea id="lv-reason" dir="auto" rows={2} value={f.reason ?? ""} onChange={(e) => setF({ ...f, reason: e.target.value })} maxLength={500} />
            </div>
            <label className="flex cursor-pointer items-center gap-2 text-sm">
              <input type="checkbox" className="size-4 accent-primary" checked={Boolean(f.approve)} onChange={(e) => setF({ ...f, approve: e.target.checked })} />
              {t("Approve now")}
            </label>
            {over && (
              <div role="alert" className="grid gap-2 rounded-xl border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
                <p>{t("This uses {days} days but only {available} are available. Record it anyway?", { days: over.days, available: over.available })}</p>
                <Button type="button" size="sm" variant="outline" className="justify-self-start" onClick={() => submit(true)} disabled={pending}>
                  {t("Yes, record it")}
                </Button>
              </div>
            )}
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
    </>
  );
}
