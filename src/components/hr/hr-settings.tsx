"use client";

import { useState, useTransition } from "react";
import { Archive, ArchiveRestore, CalendarDays, Check, Clock, Landmark, Loader2, Pencil, Plane, Plus, Scale, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { archiveLeaveType, deleteHoliday, deleteShift, saveHoliday, saveHrSettings, saveLeaveType, saveShift, type HrSettingsInput } from "@/lib/actions/hr-ops";
import { WEEKDAYS, shiftHours, type HrRules } from "@/lib/hr-rules";
import { BRAND_SWATCHES } from "@/lib/branding";
import { cn, formatDate } from "@/lib/utils";
import { useT } from "@/i18n/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SelectBox } from "@/components/ui/select-box";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { FieldError } from "@/components/projects/project-fields";
import { Panel } from "@/components/page/kit";

type Num = number | string;
/** The rules as typed in the form (numbers may be half-typed strings; the server checks them). */
type RulesForm = Omit<HrRules, "graceMinutes" | "overtimeRate" | "ssEmployee" | "ssEmployer" | "endOfService"> & {
  graceMinutes: Num;
  overtimeRate: Num;
  ssEmployee: Num;
  ssEmployer: Num;
  endOfService: Omit<HrRules["endOfService"], "firstYears" | "daysFirst" | "daysAfter" | "minYears" | "resignation"> & {
    firstYears: Num;
    daysFirst: Num;
    daysAfter: Num;
    minYears: Num;
    resignation: { years: Num; percent: Num }[];
  };
};

type Shift = { id: string; name: string; workStart: string; workEnd: string; weekend: number[]; people: number };
type Holiday = { id: string; date: string; name: string };
type LeaveType = { id: string; name: string; paid: boolean; daysPerYear: string | null; carryOver: string; color: string; archived: boolean };

export function HrSettingsView({ slug, rules, shifts, holidays, leaveTypes }: { slug: string; rules: HrRules; shifts: Shift[]; holidays: Holiday[]; leaveTypes: LeaveType[] }) {
  return (
    <div className="grid items-start gap-6 xl:grid-cols-2">
      <RulesForm slug={slug} rules={rules} />
      <div className="grid gap-6">
        <LeaveTypesPanel slug={slug} types={leaveTypes} />
        <ShiftsPanel slug={slug} shifts={shifts} />
        <HolidaysPanel slug={slug} holidays={holidays} />
      </div>
    </div>
  );
}

/** Day chips: tick the days off. */
function WeekendPicker({ value, onChange, id }: { value: number[]; onChange: (v: number[]) => void; id: string }) {
  const t = useT();
  return (
    <div role="group" aria-labelledby={id} className="flex flex-wrap gap-1.5">
      {WEEKDAYS.map((d) => {
        const on = value.includes(d.value);
        return (
          <button
            key={d.value}
            type="button"
            aria-pressed={on}
            onClick={() => onChange(on ? value.filter((x) => x !== d.value) : [...value, d.value])}
            className={cn(
              "h-9 cursor-pointer rounded-lg border px-3 text-sm transition-colors focus-visible:outline-2 focus-visible:outline-ring",
              on ? "border-primary/40 bg-primary/10 font-medium text-primary" : "text-muted-foreground hover:bg-muted",
            )}
          >
            {t(d.label)}
          </button>
        );
      })}
    </div>
  );
}

function RulesForm({ slug, rules }: { slug: string; rules: HrRules }) {
  const t = useT();
  const initial = (): RulesForm => ({ ...rules, endOfService: { ...rules.endOfService, resignation: [...rules.endOfService.resignation] } });
  const [f, setF] = useState<RulesForm>(initial);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [pending, start] = useTransition();
  const eos = f.endOfService;
  const setEos = (patch: Partial<typeof eos>) => setF({ ...f, endOfService: { ...eos, ...patch } });
  const hours = shiftHours(f.workStart, f.workEnd);
  const numField = (id: string, label: string, value: number | string, on: (v: string) => void, suffix?: string, hint?: string) => (
    <div className="grid gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      <div className="flex items-center gap-2">
        <Input id={id} inputMode="decimal" dir="ltr" className="w-28" value={value} onChange={(e) => on(e.target.value)} aria-invalid={Boolean(errors[id])} />
        {suffix && <span className="text-sm text-muted-foreground">{suffix}</span>}
      </div>
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      <FieldError message={errors[id]} />
    </div>
  );
  return (
    <form
      className="grid gap-6"
      onSubmit={(e) => {
        e.preventDefault();
        setErrors({});
        start(async () => {
          const res = await saveHrSettings(slug, f as HrSettingsInput);
          if (!res.ok) {
            setErrors(res.fieldErrors ?? {});
            return void toast.error(res.error);
          }
          toast.success(t("HR settings saved"));
        });
      }}
    >
      <Panel id="hr-week" title={t("Work week and hours")} icon={Clock}>
        <div className="grid gap-5 px-5 pb-5">
          <div className="grid gap-2">
            <span id="weekend-label" className="text-sm font-medium">
              {t("Days off each week")}
            </span>
            <WeekendPicker id="weekend-label" value={f.weekend} onChange={(weekend) => setF({ ...f, weekend })} />
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="grid gap-1.5">
              <Label htmlFor="workStart">{t("Work starts")}</Label>
              <Input id="workStart" type="time" value={f.workStart} onChange={(e) => setF({ ...f, workStart: e.target.value })} />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="workEnd">{t("Work ends")}</Label>
              <Input id="workEnd" type="time" value={f.workEnd} onChange={(e) => setF({ ...f, workEnd: e.target.value })} aria-invalid={Boolean(errors.workEnd)} />
              <FieldError message={errors.workEnd} />
            </div>
            {numField("graceMinutes", t("Late after"), f.graceMinutes, (v) => setF({ ...f, graceMinutes: v }), t("minutes"))}
          </div>
          <p className="text-sm text-muted-foreground">{t("A working day is {hours} hours. Shifts below can set other hours for some people.", { hours: hours.toLocaleString(t.intl) })}</p>
        </div>
      </Panel>

      <Panel id="hr-pay" title={t("Pay and overtime")} icon={Scale}>
        <div className="grid gap-5 px-5 pb-5 sm:grid-cols-2">
          {numField("overtimeRate", t("Overtime pays"), f.overtimeRate, (v) => setF({ ...f, overtimeRate: v }), t("× the hourly rate"))}
          <div className="grid gap-1.5">
            <Label htmlFor="dayBasis">{t("A day's pay for monthly staff")}</Label>
            <SelectBox id="dayBasis" className="h-9 w-full" value={f.dayBasis} onValueChange={(v) => setF({ ...f, dayBasis: v as "30" | "working" })}>
              <option value="30">{t("Monthly pay ÷ 30")}</option>
              <option value="working">{t("Monthly pay ÷ working days in the month")}</option>
            </SelectBox>
            <p className="text-xs text-muted-foreground">{t("Used to deduct absences and unpaid leave, and to pay part months.")}</p>
          </div>
        </div>
      </Panel>

      <Panel id="hr-ss" title={t("Social security / pension")} icon={Landmark}>
        <div className="grid gap-5 px-5 pb-5 sm:grid-cols-3">
          {numField("ssEmployee", t("Employee pays"), f.ssEmployee, (v) => setF({ ...f, ssEmployee: v }), "%")}
          {numField("ssEmployer", t("Company pays"), f.ssEmployer, (v) => setF({ ...f, ssEmployer: v }), "%")}
          <div className="grid gap-1.5">
            <Label htmlFor="ssBase">{t("Of")}</Label>
            <SelectBox id="ssBase" className="h-9 w-full" value={f.ssBase} onValueChange={(v) => setF({ ...f, ssBase: v as "basic" | "gross" })}>
              <option value="basic">{t("Basic pay")}</option>
              <option value="gross">{t("Basic + allowances")}</option>
            </SelectBox>
          </div>
          <p className="text-xs text-muted-foreground sm:col-span-3">{t("Leave both at 0 if your company doesn't pay social security.")}</p>
        </div>
      </Panel>

      <Panel id="hr-eos" title={t("End of service")} icon={Landmark}>
        <div className="grid gap-5 px-5 pb-5">
          <div className="grid gap-4 sm:grid-cols-3">
            {numField("eos-first", t("For the first"), eos.firstYears, (v) => setEos({ firstYears: v }), t("years"))}
            {numField("eos-daysFirst", t("Pay"), eos.daysFirst, (v) => setEos({ daysFirst: v }), t("days per year"))}
            {numField("eos-daysAfter", t("After that"), eos.daysAfter, (v) => setEos({ daysAfter: v }), t("days per year"))}
            {numField("eos-min", t("Nothing under"), eos.minYears, (v) => setEos({ minYears: v }), t("years of service"))}
            <div className="grid gap-1.5 sm:col-span-2">
              <Label htmlFor="eos-basis">{t("A day's pay is worked out from")}</Label>
              <SelectBox id="eos-basis" className="h-9 w-full" value={eos.basis} onValueChange={(v) => setEos({ basis: v as "basic" | "gross" })}>
                <option value="basic">{t("Basic pay ÷ 30")}</option>
                <option value="gross">{t("Basic + allowances ÷ 30")}</option>
              </SelectBox>
            </div>
          </div>
          <fieldset className="grid gap-2 rounded-xl border p-3">
            <legend className="px-1 text-sm font-medium">{t("If they resign")}</legend>
            {eos.resignation.length === 0 && <p className="text-sm text-muted-foreground">{t("They get the full amount. Add steps if resigning early pays less.")}</p>}
            {eos.resignation.map((r, i) => (
              <div key={i} className="flex flex-wrap items-center gap-2 text-sm">
                <span>{t("After")}</span>
                <Input
                  inputMode="decimal"
                  dir="ltr"
                  className="w-20"
                  aria-label={t("Years of service")}
                  value={r.years}
                  onChange={(e) => setEos({ resignation: eos.resignation.map((x, j) => (j === i ? { ...x, years: e.target.value } : x)) })}
                />
                <span>{t("years, pay")}</span>
                <Input
                  inputMode="decimal"
                  dir="ltr"
                  className="w-20"
                  aria-label={t("Percent paid")}
                  value={r.percent}
                  onChange={(e) => setEos({ resignation: eos.resignation.map((x, j) => (j === i ? { ...x, percent: e.target.value } : x)) })}
                />
                <span>%</span>
                <Button type="button" variant="ghost" size="icon" className="size-8" aria-label={t("Remove")} onClick={() => setEos({ resignation: eos.resignation.filter((_, j) => j !== i) })}>
                  <X className="size-4" />
                </Button>
              </div>
            ))}
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="justify-self-start"
              disabled={eos.resignation.length >= 6}
              onClick={() => setEos({ resignation: [...eos.resignation, { years: (Number(eos.resignation.at(-1)?.years ?? 0) || 0) + 2, percent: 100 }] })}
            >
              <Plus className="size-4" />
              {t("Add a step")}
            </Button>
          </fieldset>
        </div>
      </Panel>

      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" onClick={() => setF(initial())}>
          {t("Undo changes")}
        </Button>
        <Button type="submit" disabled={pending}>
          {pending && <Loader2 className="size-4 animate-spin" />}
          {t("Save HR settings")}
        </Button>
      </div>
    </form>
  );
}

function LeaveTypesPanel({ slug, types }: { slug: string; types: LeaveType[] }) {
  const t = useT();
  const [editing, setEditing] = useState<(Omit<LeaveType, "archived" | "id"> & { id: string | null }) | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [pending, start] = useTransition();
  return (
    <Panel
      id="hr-leave-types"
      title={t("Leave types")}
      icon={Plane}
      action={
        <Button variant="outline" size="sm" onClick={() => (setErrors({}), setEditing({ id: null, name: "", paid: true, daysPerYear: "", carryOver: "0", color: BRAND_SWATCHES[types.length % BRAND_SWATCHES.length] }))}>
          <Plus className="size-4" />
          {t("Add")}
        </Button>
      }
    >
      <ul className="divide-y border-t">
        {types.map((lt) => (
          <li key={lt.id} className={cn("flex items-center gap-3 px-5 py-3", lt.archived && "opacity-60")}>
            <span aria-hidden className="size-3 shrink-0 rounded-full" style={{ backgroundColor: lt.color }} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium" dir="auto">
                {t(lt.name)}
                {lt.archived && <span className="ms-2 text-xs font-normal text-muted-foreground">{t("Hidden")}</span>}
              </p>
              <p className="text-xs text-muted-foreground">
                {[lt.paid ? t("Paid|leave") : t("Unpaid"), lt.daysPerYear ? t("{days} days a year", { days: Number(lt.daysPerYear) }) : t("No yearly balance"), Number(lt.carryOver) > 0 ? t("up to {days} carried over", { days: Number(lt.carryOver) }) : null]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
            </div>
            <Button variant="ghost" size="icon" className="size-8" aria-label={t("Edit {name}", { name: t(lt.name) })} onClick={() => (setErrors({}), setEditing({ ...lt, name: lt.name, daysPerYear: lt.daysPerYear ?? "" }))}>
              <Pencil className="size-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="size-8"
              aria-label={lt.archived ? t("Show {name} again", { name: t(lt.name) }) : t("Hide {name}", { name: t(lt.name) })}
              title={lt.archived ? t("Show again") : t("Hide from new requests")}
              onClick={() => start(async () => void (await archiveLeaveType(slug, lt.id, !lt.archived)))}
            >
              {lt.archived ? <ArchiveRestore className="size-4" /> : <Archive className="size-4" />}
            </Button>
          </li>
        ))}
      </ul>
      <Dialog open={editing !== null} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="sm:max-w-md">
          {editing && (
            <form
              className="grid gap-4"
              onSubmit={(e) => {
                e.preventDefault();
                start(async () => {
                  const res = await saveLeaveType(slug, editing.id, editing);
                  if (!res.ok) return setErrors(res.fieldErrors ?? { form: res.error });
                  toast.success(t("Saved"));
                  setEditing(null);
                });
              }}
            >
              <DialogHeader>
                <DialogTitle>{editing.id ? t("Edit leave type") : t("New leave type")}</DialogTitle>
                <DialogDescription>{t("Days are earned month by month through the year.")}</DialogDescription>
              </DialogHeader>
              <div className="grid gap-1.5">
                <Label htmlFor="lt-name">{t("Name")}</Label>
                <Input id="lt-name" dir="auto" value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} maxLength={60} aria-invalid={Boolean(errors.name)} placeholder={t("Maternity leave")} />
                <FieldError message={errors.name} />
              </div>
              <label className="flex cursor-pointer items-center gap-2 text-sm">
                <input type="checkbox" className="size-4 accent-primary" checked={editing.paid} onChange={(e) => setEditing({ ...editing, paid: e.target.checked })} />
                {t("Paid leave (no deduction from pay)")}
              </label>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="grid gap-1.5">
                  <Label htmlFor="lt-days">{t("Days per year")}</Label>
                  <Input id="lt-days" inputMode="decimal" dir="ltr" value={editing.daysPerYear ?? ""} onChange={(e) => setEditing({ ...editing, daysPerYear: e.target.value })} placeholder={t("Empty = no limit")} aria-invalid={Boolean(errors.daysPerYear)} />
                  <FieldError message={errors.daysPerYear} />
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="lt-carry">{t("Carry over to next year (max)")}</Label>
                  <Input id="lt-carry" inputMode="decimal" dir="ltr" value={editing.carryOver} onChange={(e) => setEditing({ ...editing, carryOver: e.target.value })} aria-invalid={Boolean(errors.carryOver)} />
                  <FieldError message={errors.carryOver} />
                </div>
              </div>
              <div className="flex flex-wrap gap-2" role="radiogroup" aria-label={t("Colour")}>
                {BRAND_SWATCHES.map((c) => (
                  <button
                    key={c}
                    type="button"
                    role="radio"
                    aria-checked={editing.color === c}
                    aria-label={c}
                    onClick={() => setEditing({ ...editing, color: c })}
                    className="flex size-7 cursor-pointer items-center justify-center rounded-full ring-offset-2 ring-offset-background focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none aria-checked:ring-2 aria-checked:ring-foreground"
                    style={{ backgroundColor: c }}
                  >
                    {editing.color === c && <Check className="size-3.5 text-white" aria-hidden />}
                  </button>
                ))}
              </div>
              <FieldError message={errors.form} />
              <DialogFooter>
                <Button type="button" variant="ghost" onClick={() => setEditing(null)}>
                  {t("Cancel")}
                </Button>
                <Button type="submit" disabled={pending}>
                  {pending && <Loader2 className="size-4 animate-spin" />}
                  {t("Save")}
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </Panel>
  );
}

function ShiftsPanel({ slug, shifts }: { slug: string; shifts: Shift[] }) {
  const t = useT();
  const [editing, setEditing] = useState<{ id: string | null; name: string; workStart: string; workEnd: string; weekend: number[] } | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [pending, start] = useTransition();
  const dayNames = (w: number[]) =>
    WEEKDAYS.filter((d) => w.includes(d.value))
      .map((d) => t(d.label))
      .join(t(", "));
  return (
    <Panel
      id="hr-shifts"
      title={t("Shifts")}
      icon={Clock}
      action={
        <Button variant="outline" size="sm" onClick={() => (setErrors({}), setEditing({ id: null, name: "", workStart: "20:00", workEnd: "04:00", weekend: [5] }))}>
          <Plus className="size-4" />
          {t("Add")}
        </Button>
      }
    >
      {shifts.length === 0 ? (
        <p className="px-5 pb-5 text-sm text-muted-foreground">{t("Everyone works the company's hours. Add a shift for people with other hours or days off (night shift, site crew…), then choose it on their file.")}</p>
      ) : (
        <ul className="divide-y border-t">
          {shifts.map((s) => (
            <li key={s.id} className="flex items-center gap-3 px-5 py-3">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium" dir="auto">
                  {s.name}
                </p>
                <p className="text-xs text-muted-foreground">
                  <span dir="ltr">
                    {s.workStart}–{s.workEnd}
                  </span>{" "}
                  · {t("off: {days}", { days: dayNames(s.weekend) || t("none|days") })} · {t.plural(s.people, "{count} person", "{count} people")}
                </p>
              </div>
              <Button variant="ghost" size="icon" className="size-8" aria-label={t("Edit {name}", { name: s.name })} onClick={() => (setErrors({}), setEditing(s))}>
                <Pencil className="size-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="size-8 text-muted-foreground hover:text-destructive"
                aria-label={t("Delete {name}", { name: s.name })}
                onClick={() => confirm(t("Delete “{name}”? Its people go back to the company's hours.", { name: s.name })) && start(async () => void (await deleteShift(slug, s.id)))}
              >
                <Trash2 className="size-4" />
              </Button>
            </li>
          ))}
        </ul>
      )}
      <Dialog open={editing !== null} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="sm:max-w-md">
          {editing && (
            <form
              className="grid gap-4"
              onSubmit={(e) => {
                e.preventDefault();
                start(async () => {
                  const res = await saveShift(slug, editing.id, editing);
                  if (!res.ok) return setErrors(res.fieldErrors ?? { form: res.error });
                  setEditing(null);
                });
              }}
            >
              <DialogHeader>
                <DialogTitle>{editing.id ? t("Edit shift") : t("New shift")}</DialogTitle>
              </DialogHeader>
              <div className="grid gap-1.5">
                <Label htmlFor="sh-name">{t("Name")}</Label>
                <Input id="sh-name" dir="auto" value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} placeholder={t("Night shift")} aria-invalid={Boolean(errors.name)} />
                <FieldError message={errors.name} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="grid gap-1.5">
                  <Label htmlFor="sh-start">{t("Starts")}</Label>
                  <Input id="sh-start" type="time" value={editing.workStart} onChange={(e) => setEditing({ ...editing, workStart: e.target.value })} />
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="sh-end">{t("Ends")}</Label>
                  <Input id="sh-end" type="time" value={editing.workEnd} onChange={(e) => setEditing({ ...editing, workEnd: e.target.value })} />
                </div>
              </div>
              <div className="grid gap-2">
                <span id="sh-weekend" className="text-sm font-medium">
                  {t("Days off")}
                </span>
                <WeekendPicker id="sh-weekend" value={editing.weekend} onChange={(weekend) => setEditing({ ...editing, weekend })} />
              </div>
              <FieldError message={errors.form} />
              <DialogFooter>
                <Button type="button" variant="ghost" onClick={() => setEditing(null)}>
                  {t("Cancel")}
                </Button>
                <Button type="submit" disabled={pending}>
                  {pending && <Loader2 className="size-4 animate-spin" />}
                  {t("Save")}
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </Panel>
  );
}

function HolidaysPanel({ slug, holidays }: { slug: string; holidays: Holiday[] }) {
  const t = useT();
  const thisYear = new Date().getFullYear();
  const years = [...new Set([thisYear, thisYear + 1, ...holidays.map((h) => Number(h.date.slice(0, 4)))])].sort();
  const [year, setYear] = useState(thisYear);
  const [form, setForm] = useState({ date: "", name: "" });
  const [error, setError] = useState<string>();
  const [pending, start] = useTransition();
  const list = holidays.filter((h) => h.date.startsWith(String(year)));
  return (
    <Panel
      id="hr-holidays"
      title={t("Public holidays")}
      icon={CalendarDays}
      count={list.length}
      action={
        <SelectBox size="sm" value={String(year)} onValueChange={(v) => setYear(Number(v))} aria-label={t("Year")}>
          {years.map((y) => (
            <option key={y} value={String(y)}>
              {y}
            </option>
          ))}
        </SelectBox>
      }
    >
      <form
        className="flex flex-wrap items-start gap-2 border-t px-5 py-3"
        onSubmit={(e) => {
          e.preventDefault();
          start(async () => {
            const res = await saveHoliday(slug, form);
            if (!res.ok) return setError(res.error);
            setError(undefined);
            setForm({ date: "", name: "" });
          });
        }}
      >
        <Input type="date" aria-label={t("Date")} className="w-40" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} required />
        <Input dir="auto" aria-label={t("Holiday name")} placeholder={t("Holiday name")} className="min-w-40 flex-1" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} maxLength={80} required />
        <Button type="submit" variant="outline" disabled={pending}>
          <Plus className="size-4" />
          {t("Add")}
        </Button>
        <FieldError message={error} />
      </form>
      {list.length === 0 ? (
        <p className="px-5 pb-5 text-sm text-muted-foreground">{t("No holidays for {year} yet. Holidays aren't counted as working days, absences or leave.", { year })}</p>
      ) : (
        <ul className="divide-y border-t">
          {list.map((h) => (
            <li key={h.id} className="flex items-center gap-3 px-5 py-2.5 text-sm">
              <span className="w-32 shrink-0 text-muted-foreground tabular-nums">{formatDate(h.date, t.intl)}</span>
              <span className="min-w-0 flex-1 truncate" dir="auto">
                {h.name}
              </span>
              <Button variant="ghost" size="icon" className="size-8 text-muted-foreground hover:text-destructive" aria-label={t("Delete {name}", { name: h.name })} onClick={() => start(async () => void (await deleteHoliday(slug, h.id)))}>
                <Trash2 className="size-4" />
              </Button>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}
