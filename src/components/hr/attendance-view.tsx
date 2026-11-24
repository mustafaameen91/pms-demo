"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CalendarDays, CheckCheck, ChevronLeft, ChevronRight, Clock, Loader2, Save, Search, Timer, UserCheck, UserX, Plane, CircleDashed } from "lucide-react";
import { toast } from "sonner";
import { fillAttendanceFromTimesheets, saveAttendance, type AttendanceRowInput } from "@/lib/actions/hr-ops";
import { ATTENDANCE_STATUSES, addDays, lateMinutes, shiftMonth, weekday, type DayKind, type DayRecord, type MonthSummary } from "@/lib/hr-rules";
import { cn, formatDate } from "@/lib/utils";
import { useT } from "@/i18n/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SummaryChip } from "@/components/page/kit";
import { PersonAvatar } from "./hr-ui";

type Person = { id: string; name: string; code: string; jobTitle: string | null; hasPhoto: boolean; department: string | null; linked: boolean };

/** Colour and short letter for each kind of day (letters keep it readable without colour). */
export const KIND_STYLE: Record<DayKind, { cell: string; letter: string; label: string }> = {
  present: { cell: "bg-green-600/15 text-green-800 dark:text-green-300", letter: "P", label: "Present" },
  late: { cell: "bg-amber-500/20 text-amber-900 dark:text-amber-200", letter: "L", label: "Late" },
  remote: { cell: "bg-cyan-500/15 text-cyan-800 dark:text-cyan-300", letter: "R", label: "Remote" },
  half_day: { cell: "bg-orange-500/15 text-orange-800 dark:text-orange-300", letter: "½", label: "Half day" },
  absent: { cell: "bg-destructive/15 text-destructive", letter: "A", label: "Absent" },
  leave: { cell: "bg-violet-500/15 text-violet-800 dark:text-violet-300", letter: "V", label: "On leave" },
  holiday: { cell: "bg-sky-500/10 text-sky-800 dark:text-sky-300", letter: "H", label: "Holiday" },
  weekend: { cell: "bg-muted/60 text-muted-foreground/60", letter: "·", label: "Day off" },
  not_recorded: { cell: "bg-transparent text-muted-foreground/40", letter: "–", label: "Not recorded" },
  not_employed: { cell: "bg-transparent text-transparent", letter: "", label: "Not employed" },
};

type Row = {
  person: Person;
  schedule: { start: string; end: string; shift: string | null };
  kind: DayKind;
  leaveType: string | null;
  holiday: string | null;
  record: DayRecord | null;
};
type Draft = { status: string; checkIn: string; checkOut: string; overtimeHours: string; note: string };

/** One day for everyone: tap a status, add times; lateness is worked out on save. */
export function AttendanceDay({ slug, date, today, rows, graceMinutes }: { slug: string; date: string; today: string; rows: Row[]; graceMinutes: number }) {
  const t = useT();
  const router = useRouter();
  const base = `/w/${slug}/hr/attendance`;
  const initial = useMemo(
    () =>
      Object.fromEntries(
        rows.map((r) => [
          r.person.id,
          {
            status: r.record?.status ?? "",
            checkIn: r.record?.checkIn ?? "",
            checkOut: r.record?.checkOut ?? "",
            overtimeHours: r.record?.overtimeHours ? String(r.record.overtimeHours) : "",
            note: "",
          } satisfies Draft,
        ]),
      ) as Record<string, Draft>,
    [rows],
  );
  const [draft, setDraft] = useState(initial);
  const [lastRows, setLastRows] = useState(rows);
  if (rows !== lastRows) {
    setLastRows(rows);
    setDraft(initial);
  }
  const [q, setQ] = useState("");
  const [pending, start] = useTransition();
  const dirty = rows.filter((r) => JSON.stringify(draft[r.person.id]) !== JSON.stringify(initial[r.person.id]));
  const set = (id: string, patch: Partial<Draft>) => setDraft((d) => ({ ...d, [id]: { ...d[id], ...patch } }));
  const locked = (r: Row) => r.kind === "leave" || ((r.kind === "holiday" || r.kind === "weekend") && !draft[r.person.id].status);
  const count = (k: string) => rows.filter((r) => (draft[r.person.id].status || r.kind) === k || (k === "present" && ["present", "remote"].includes(draft[r.person.id].status))).length;
  const notRecorded = rows.filter((r) => !draft[r.person.id].status && r.kind === "not_recorded").length;
  const shown = rows.filter((r) => !q.trim() || [r.person.name, r.person.code, r.person.department].some((v) => v?.toLowerCase().includes(q.trim().toLowerCase())));
  const off = rows.length > 0 && rows.every((r) => r.kind === "weekend" || r.kind === "holiday");

  const save = () =>
    start(async () => {
      const payload: AttendanceRowInput[] = dirty.map((r) => ({ employeeId: r.person.id, ...draft[r.person.id] }));
      const res = await saveAttendance(slug, date, payload);
      if (!res.ok) return void toast.error(res.error);
      toast.success(t.plural(res.data?.saved ?? 0, "Attendance saved for {count} person", "Attendance saved for {count} people"));
    });

  return (
    <div className="grid grid-cols-1 gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="inline-flex items-center rounded-lg border bg-card">
          <Button variant="ghost" size="icon" asChild aria-label={t("Previous day")}>
            <Link href={`${base}?date=${addDays(date, -1)}`}>
              <ChevronLeft className="size-4 rtl:rotate-180" />
            </Link>
          </Button>
          <Input type="date" className="h-9 w-40 border-0 shadow-none" value={date} max={today} onChange={(e) => e.target.value && router.push(`${base}?date=${e.target.value}`)} aria-label={t("Date")} />
          <Button variant="ghost" size="icon" asChild aria-label={t("Next day")} aria-disabled={date >= today} className={cn(date >= today && "pointer-events-none opacity-40")}>
            <Link href={`${base}?date=${addDays(date, 1)}`}>
              <ChevronRight className="size-4 rtl:rotate-180" />
            </Link>
          </Button>
        </div>
        {date !== today && (
          <Button variant="ghost" asChild>
            <Link href={base}>{t("Today")}</Link>
          </Button>
        )}
        <Button variant="outline" asChild>
          <Link href={`${base}?view=month&month=${date.slice(0, 7)}`}>
            <CalendarDays className="size-4" />
            {t("Month view")}
          </Link>
        </Button>
        <div className="ms-auto flex flex-wrap gap-2">
          <Button
            variant="outline"
            disabled={pending}
            onClick={() =>
              start(async () => {
                const res = await fillAttendanceFromTimesheets(slug, date);
                if (!res.ok) return void toast.error(res.error);
                toast.success(res.data?.filled ? t.plural(res.data.filled, "{count} person filled in from project timesheets", "{count} people filled in from project timesheets") : t("No approved project time for this day."));
              })
            }
            title={t("People linked to a member or worker who logged approved project time are marked present.")}
          >
            <Timer className="size-4" />
            {t("Fill from timesheets")}
          </Button>
          <Button
            variant="outline"
            onClick={() => setDraft((d) => Object.fromEntries(Object.entries(d).map(([id, v]) => [id, !v.status && rows.find((r) => r.person.id === id)?.kind === "not_recorded" ? { ...v, status: "present" } : v])))}
            disabled={notRecorded === 0}
          >
            <CheckCheck className="size-4" />
            {t("Everyone else present")}
          </Button>
          <Button onClick={save} disabled={pending || dirty.length === 0}>
            {pending ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
            {dirty.length ? t.plural(dirty.length, "Save {count} change", "Save {count} changes") : t("Saved")}
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap gap-2" aria-live="polite">
        <SummaryChip icon={UserCheck} label={t("in")} value={count("present") + count("late")} tone="good" />
        <SummaryChip icon={Clock} label={t("late")} value={count("late")} />
        <SummaryChip icon={UserX} label={t("absent")} value={count("absent")} tone="bad" />
        <SummaryChip icon={Plane} label={t("on leave")} value={rows.filter((r) => r.kind === "leave").length} />
        <SummaryChip icon={CircleDashed} label={t("not recorded")} value={notRecorded} />
      </div>

      {off && <p className="rounded-xl border bg-muted/40 px-4 py-3 text-sm text-muted-foreground">{t("{date} is a day off or holiday. Record someone only if they came in.", { date: formatDate(date, t.intl) })}</p>}

      <section aria-label={t("Attendance on {date}", { date: formatDate(date, t.intl) })} className="overflow-hidden rounded-2xl border bg-card">
        <div className="border-b px-4 py-3">
          <div className="relative max-w-sm">
            <Search className="pointer-events-none absolute top-1/2 size-4 -translate-y-1/2 text-muted-foreground inset-s-3" aria-hidden />
            <Input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("Find a person…")} aria-label={t("Search people")} className="h-9 ps-9" />
          </div>
        </div>
        {shown.length === 0 ? (
          <p className="px-4 py-10 text-center text-sm text-muted-foreground">{rows.length === 0 ? t("No one is employed on this day.") : t("No one matches.")}</p>
        ) : (
          <ul className="divide-y">
            {shown.map((r) => {
              const d = draft[r.person.id];
              const late = d.status && d.status !== "absent" ? lateMinutes(d.checkIn || null, r.schedule.start, graceMinutes) : 0;
              const isLocked = locked(r);
              return (
                <li key={r.person.id} className={cn("grid gap-3 px-4 py-3 lg:grid-cols-[minmax(0,14rem)_minmax(0,1fr)] lg:items-center", JSON.stringify(d) !== JSON.stringify(initial[r.person.id]) && "bg-primary/[0.03]")}>
                  <div className="flex min-w-0 items-center gap-3">
                    <PersonAvatar id={r.person.id} name={r.person.name} hasPhoto={r.person.hasPhoto} size="sm" />
                    <div className="min-w-0">
                      <Link href={`/w/${slug}/hr/${r.person.id}`} className="block truncate text-sm font-medium hover:text-primary" dir="auto">
                        {r.person.name}
                      </Link>
                      <p className="truncate text-xs text-muted-foreground">
                        <span dir="ltr">
                          {r.schedule.start}–{r.schedule.end}
                        </span>
                        {r.schedule.shift && ` · ${r.schedule.shift}`}
                      </p>
                    </div>
                  </div>
                  {isLocked ? (
                    <p className={cn("inline-flex w-fit items-center gap-2 rounded-lg px-3 py-1.5 text-sm", KIND_STYLE[r.kind].cell)}>
                      {r.kind === "leave" ? t("On leave: {type}", { type: t(r.leaveType ?? "") }) : r.kind === "holiday" ? t("Holiday: {name}", { name: r.holiday ?? "" }) : t("Day off")}
                      {r.kind !== "leave" && (
                        <button type="button" className="cursor-pointer text-xs underline underline-offset-2" onClick={() => set(r.person.id, { status: "present" })}>
                          {t("They came in")}
                        </button>
                      )}
                    </p>
                  ) : (
                    <div className="flex flex-wrap items-center gap-2">
                      <div role="radiogroup" aria-label={t("Status of {name}", { name: r.person.name })} className="inline-flex flex-wrap rounded-lg border p-0.5">
                        {ATTENDANCE_STATUSES.filter((s) => s.value !== "late").map((s) => {
                          const on = d.status === s.value || (s.value === "present" && d.status === "late");
                          return (
                            <button
                              key={s.value}
                              type="button"
                              role="radio"
                              aria-checked={on}
                              onClick={() => set(r.person.id, { status: on ? "" : s.value })}
                              className={cn(
                                "h-8 cursor-pointer rounded-md px-2.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring",
                                on && KIND_STYLE[s.value].cell,
                              )}
                            >
                              {t(s.label)}
                            </button>
                          );
                        })}
                      </div>
                      {d.status && d.status !== "absent" && (
                        <>
                          <label className="flex items-center gap-1 text-xs text-muted-foreground">
                            {t("In")}
                            <Input type="time" className="h-8 w-32" value={d.checkIn} onChange={(e) => set(r.person.id, { checkIn: e.target.value })} />
                          </label>
                          <label className="flex items-center gap-1 text-xs text-muted-foreground">
                            {t("Out")}
                            <Input type="time" className="h-8 w-32" value={d.checkOut} onChange={(e) => set(r.person.id, { checkOut: e.target.value })} />
                          </label>
                          <label className="flex items-center gap-1 text-xs text-muted-foreground">
                            {t("Overtime")}
                            <Input inputMode="decimal" dir="ltr" className="h-8 w-16" placeholder="0" value={d.overtimeHours} onChange={(e) => set(r.person.id, { overtimeHours: e.target.value })} aria-label={t("Overtime hours")} />
                            {t("h")}
                          </label>
                          {late > 0 && <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-xs font-medium text-amber-800 dark:text-amber-300">{t("{minutes} min late", { minutes: late })}</span>}
                        </>
                      )}
                      {!d.status && r.kind === "not_recorded" && <span className="text-xs text-muted-foreground">{t("Counts as worked if left empty")}</span>}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>
      <p className="text-xs text-muted-foreground">
        {t("Weekday: {day}", { day: t(["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"][weekday(date)]) })}
      </p>
    </div>
  );
}

/** Everyone × every day of the month, with each person's totals. */
export function AttendanceMonth({
  slug,
  month,
  today,
  rows,
}: {
  slug: string;
  month: string;
  today: string;
  rows: { person: Person; days: { date: string; kind: DayKind; leavePaid: boolean | null; overtime: number; late: number }[]; summary: MonthSummary }[];
}) {
  const t = useT();
  const base = `/w/${slug}/hr/attendance`;
  const days = rows[0]?.days.map((d) => d.date) ?? [];
  const [y, m] = month.split("-").map(Number);
  const title = new Date(y, m - 1, 1).toLocaleDateString(t.intl, { month: "long", year: "numeric" });
  const legend: DayKind[] = ["present", "late", "remote", "half_day", "absent", "leave", "holiday", "weekend", "not_recorded"];
  return (
    <div className="grid grid-cols-1 gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="inline-flex items-center rounded-lg border bg-card">
          <Button variant="ghost" size="icon" asChild aria-label={t("Previous month")}>
            <Link href={`${base}?view=month&month=${shiftMonth(month, -1)}`}>
              <ChevronLeft className="size-4 rtl:rotate-180" />
            </Link>
          </Button>
          <span className="min-w-36 px-2 text-center text-sm font-semibold">{title}</span>
          <Button variant="ghost" size="icon" asChild aria-label={t("Next month")}>
            <Link href={`${base}?view=month&month=${shiftMonth(month, 1)}`}>
              <ChevronRight className="size-4 rtl:rotate-180" />
            </Link>
          </Button>
        </div>
        <Button variant="outline" asChild>
          <Link href={base}>
            <CalendarDays className="size-4" />
            {t("Day view")}
          </Link>
        </Button>
        <ul className="ms-auto flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground" aria-label={t("Legend")}>
          {legend.map((k) => (
            <li key={k} className="inline-flex items-center gap-1">
              <span aria-hidden className={cn("grid size-5 place-items-center rounded text-[10px] font-bold", KIND_STYLE[k].cell)}>
                {KIND_STYLE[k].letter}
              </span>
              {t(KIND_STYLE[k].label)}
            </li>
          ))}
        </ul>
      </div>
      <div className="relative overflow-x-auto rounded-2xl border bg-card">
        <table className="w-full border-collapse text-xs">
          <thead>
            <tr className="border-b">
              <th scope="col" className="sticky z-10 bg-card px-3 py-2 text-start font-semibold inset-s-0">
                {t("Person")}
              </th>
              {days.map((d) => (
                <th key={d} scope="col" className={cn("w-7 min-w-7 px-0 py-2 text-center font-medium tabular-nums", d === today && "text-primary")}>
                  <Link href={`${base}?date=${d}`} className="block hover:text-primary" aria-label={formatDate(d, t.intl)}>
                    {Number(d.slice(8))}
                  </Link>
                </th>
              ))}
              <th scope="col" className="px-2 py-2 text-center font-semibold" title={t("Days worked")}>
                {t("Worked")}
              </th>
              <th scope="col" className="px-2 py-2 text-center font-semibold">
                {t("Absent")}
              </th>
              <th scope="col" className="px-2 py-2 text-center font-semibold">
                {t("Leave")}
              </th>
              <th scope="col" className="px-2 py-2 text-center font-semibold" title={t("Overtime hours")}>
                {t("OT h")}
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.person.id} className="border-b last:border-0 hover:bg-muted/30">
                <th scope="row" className="sticky z-10 bg-card px-3 py-1.5 text-start font-normal inset-s-0">
                  <Link href={`/w/${slug}/hr/${r.person.id}`} className="flex items-center gap-2 hover:text-primary">
                    <PersonAvatar id={r.person.id} name={r.person.name} hasPhoto={r.person.hasPhoto} size="sm" className="size-6 text-[9px]" />
                    <span className="max-w-36 truncate text-sm" dir="auto">
                      {r.person.name}
                    </span>
                  </Link>
                </th>
                {r.days.map((d) => {
                  const s = KIND_STYLE[d.kind];
                  return (
                    <td key={d.date} className="p-0.5 text-center">
                      <span
                        className={cn("grid h-6 place-items-center rounded font-bold", s.cell, d.date > today && d.kind === "not_recorded" && "opacity-0")}
                        title={`${formatDate(d.date, t.intl)} · ${t(s.label)}${d.overtime ? ` · ${t("{hours} h overtime", { hours: d.overtime })}` : ""}${d.late ? ` · ${t("{minutes} min late", { minutes: d.late })}` : ""}`}
                      >
                        {s.letter}
                      </span>
                    </td>
                  );
                })}
                <td className="px-2 text-center font-semibold tabular-nums">{r.summary.workedDays}</td>
                <td className={cn("px-2 text-center tabular-nums", r.summary.absentDays > 0 && "font-semibold text-destructive")}>{r.summary.absentDays}</td>
                <td className="px-2 text-center tabular-nums">{r.summary.paidLeaveDays + r.summary.unpaidLeaveDays}</td>
                <td className="px-2 text-center tabular-nums">{r.summary.overtimeHours}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 && <p className="px-4 py-10 text-center text-sm text-muted-foreground">{t("No one was employed this month.")}</p>}
      </div>
      <p className="text-xs text-muted-foreground">{t("Days not recorded count as worked. Future days are left blank.")}</p>
    </div>
  );
}
