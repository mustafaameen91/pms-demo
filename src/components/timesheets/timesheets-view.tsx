"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { CalendarRange, Check, ChevronLeft, ChevronRight, Clock, Download, HardHat, Hourglass, ListChecks, ListTodo, Loader2, Pencil, Plus, Trash2, Users, X } from "lucide-react";
import { toast } from "sonner";
import { decideTimeEntry, deleteTimeEntry, logHours, recordAttendance } from "@/lib/actions/timesheets";
import { addDays, buildWeek, defaultQuantity, totalsByTask, weekDays } from "@/lib/timesheets";
import { cn, formatDate, formatNumber } from "@/lib/utils";
import { useT } from "@/i18n/client";
import type { T } from "@/i18n/translate";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { FieldError } from "@/components/projects/project-fields";
import { nativeSelectClass } from "@/components/resources/resource-fields";
import { ApprovalBadge } from "@/components/expenses/approval";
import { SelectBox } from "@/components/ui/select-box";
import { EmptyState, GradientIcon, Panel, StatTile } from "@/components/page/kit";

export type EntryItem = {
  id: string;
  date: string;
  kind: "member" | "worker";
  personKey: string;
  personName: string;
  userId: string | null;
  taskId: string | null;
  taskNumber: number | null;
  taskTitle: string | null;
  quantity: string;
  unit: string;
  note: string | null;
  status: "approved" | "pending" | "rejected";
  decisionNote: string | null;
  deciderName: string | null;
};
type Worker = { id: string; name: string; role: string | null; unit: string; onProject: boolean };
type TaskOption = { id: string; number: number; title: string };

type Props = {
  projectId: string;
  projectKey: string;
  basePath: string;
  weekStart: string;
  today: string;
  entries: EntryItem[];
  pending: EntryItem[];
  workers: Worker[];
  tasks: TaskOption[];
  canManage: boolean;
  currentUserId: string;
};

/** "8 hours", "1.5 days" — in the viewer's language. */
export function qtyLabel(quantity: number | string, unit: string, t: T) {
  const q = Number(quantity);
  const vars = { count: formatNumber(q, t.intl) };
  switch (unit) {
    case "hour": return t.plural(q, "{count} hour", "{count} hours", vars);
    case "day": return t.plural(q, "{count} day", "{count} days", vars);
    case "week": return t.plural(q, "{count} week", "{count} weeks", vars);
    case "month": return t.plural(q, "{count} month", "{count} months", vars);
    default: return `${vars.count} ${t(unit)}`;
  }
}

export function TimesheetsView(props: Props) {
  const t = useT();
  const { entries, pending, canManage, weekStart, basePath } = props;
  const [hoursDialog, setHoursDialog] = useState<{ open: boolean; entry?: EntryItem }>({ open: false });
  const [attendanceOpen, setAttendanceOpen] = useState(false);
  const days = weekDays(weekStart);
  const rows = buildWeek(entries, weekStart);
  const byTask = [...totalsByTask(entries)];
  const dayHead = new Intl.DateTimeFormat(t.intl, { weekday: "short", day: "numeric", timeZone: "UTC" });
  const weekHref = (start: string) => `${basePath}/timesheets?week=${start}`;
  const taskLabel = (id: string | null) => {
    if (!id) return t("Whole project");
    const task = props.tasks.find((x) => x.id === id);
    return task ? `${props.projectKey}-${task.number} ${task.title}` : t("Deleted task");
  };
  const canEdit = (e: EntryItem) => e.kind === "member" && (canManage || (e.userId === props.currentUserId && e.status !== "approved"));
  const canDelete = (e: EntryItem) => canManage || (e.userId === props.currentUserId && e.status !== "approved");
  // The week's numbers (rejected time doesn't count).
  const counted = entries.filter((e) => e.status !== "rejected");
  const sumOf = (unit: string) => counted.filter((e) => e.unit === unit).reduce((sum, e) => sum + Number(e.quantity), 0);
  const weekHours = sumOf("hour");
  const weekDaysWorked = sumOf("day");
  const waiting = entries.filter((e) => e.status === "pending").length;

  return (
    <div className="grid grid-cols-1 gap-6">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex min-w-0 items-center gap-4">
          <GradientIcon icon={Clock} />
          <div className="min-w-0">
          <h2 className="text-xl font-bold tracking-tight">{t("Timesheets")}</h2>
          <p className="mt-0.5 max-w-2xl text-sm text-muted-foreground">
            {canManage
              ? t("Who worked on this project and for how long. Workers' attendance fills in their used days and cost on the Resources tab.")
              : t("Log the hours you worked on this project. The project manager approves them.")}
          </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {canManage && (
            <Button variant="outline" onClick={() => setAttendanceOpen(true)}>
              <HardHat className="size-4" />
              {t("Record attendance")}
            </Button>
          )}
          <Button onClick={() => setHoursDialog({ open: true })}>
            <Plus className="size-4" />
            {t("Log my hours")}
          </Button>
        </div>
      </header>

      <dl className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile label={t("Hours this week")} value={formatNumber(weekHours, t.intl)} icon={Clock} hint={t("Logged by the team, waiting ones included")} />
        <StatTile label={t("Worker days this week")} value={formatNumber(weekDaysWorked, t.intl)} icon={HardHat} hint={t("From attendance")} />
        <StatTile label={t("People")} value={rows.length} icon={Users} hint={t("Who logged time this week")} />
        <StatTile
          label={t("Waiting for approval")}
          value={waiting}
          icon={Hourglass}
          tone={waiting ? "bad" : "good"}
          hint={canManage ? t("Hours the project manager hasn't decided yet") : t("Your hours not decided yet")}
        />
      </dl>

      {canManage && pending.length > 0 && (
        <section aria-labelledby="time-approve-heading" className="overflow-hidden rounded-2xl border border-amber-500/40 bg-card">
          <h3 id="time-approve-heading" className="flex items-center gap-2 border-b bg-amber-500/10 px-5 py-3 font-semibold">
            <Hourglass className="size-4 text-amber-700 dark:text-amber-300" aria-hidden />
            {t("Waiting for your approval")}
            <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-xs font-semibold tabular-nums">{pending.length}</span>
          </h3>
          <ul className="divide-y">
            {pending.map((e) => (
              <PendingItem key={e.id} entry={e} taskLabel={taskLabel(e.taskId)} />
            ))}
          </ul>
        </section>
      )}

      <Panel
        id="week-heading"
        title={t("Week of {start} – {end}", { start: formatDate(days[0], t.intl), end: formatDate(days[6], t.intl) })}
        icon={CalendarRange}
        action={
          <nav aria-label={t("Choose week")} className="flex flex-wrap items-center gap-1">
            <Button asChild variant="ghost" size="sm">
              <Link href={weekHref(addDays(weekStart, -7))}>
                <ChevronLeft className="size-4 rtl:-scale-x-100" aria-hidden />
                {t("Previous week")}
              </Link>
            </Button>
            <Button asChild variant="ghost" size="sm">
              <Link href={`${basePath}/timesheets`}>{t("This week")}</Link>
            </Button>
            <Button asChild variant="ghost" size="sm">
              <Link href={weekHref(addDays(weekStart, 7))}>
                {t("Next week")}
                <ChevronRight className="size-4 rtl:-scale-x-100" aria-hidden />
              </Link>
            </Button>
            <Button asChild variant="outline" size="sm">
              <a href={`${basePath}/timesheets/export?from=${days[0]}&to=${days[6]}`} download>
                <Download className="size-4" aria-hidden />
                {t("CSV")}
              </a>
            </Button>
          </nav>
        }
      >
        {rows.length === 0 ? (
          <div className="border-t p-5">
            <EmptyState icon={Clock} title={t("No time logged this week.")} className="border-0 py-10" />
          </div>
        ) : (
          <div className="relative overflow-x-auto border-t">
            <table className="w-full min-w-[860px] text-sm">
              <thead className="text-xs text-muted-foreground">
                <tr className="border-b bg-muted/40">
                  <th scope="col" className="py-2.5 pe-3 ps-5 text-start font-medium">{t("Person")}</th>
                  {days.map((d) => (
                    <th key={d} scope="col" className={cn("px-2 py-2.5 text-center font-medium", d === props.today && "text-primary")}>
                      <span className={cn(d === props.today && "rounded-full bg-primary/10 px-2 py-0.5")}>{dayHead.format(new Date(`${d}T00:00:00Z`))}</span>
                    </th>
                  ))}
                  <th scope="col" className="py-2.5 pe-5 ps-2 text-end font-medium">{t("Total")}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.personKey} className="border-b transition-colors last:border-0 hover:bg-accent/60">
                    <th scope="row" className="py-3 pe-3 ps-5 text-start font-medium">
                      {r.personName}
                      <span className="ms-2 rounded-full border px-1.5 py-0.5 text-[11px] font-normal text-muted-foreground">
                        {r.kind === "member" ? t("Member") : t("Worker")}
                      </span>
                    </th>
                    {days.map((d) => (
                      <td key={d} className={cn("px-2 py-3 text-center tabular-nums", d === props.today && "bg-primary/[0.04]")}>
                        {(r.days[d] ?? []).map((c) => (
                          <span key={c.unit} className={cn("block whitespace-nowrap", c.pending && "text-amber-800 dark:text-amber-300")}>
                            {qtyLabel(c.quantity, c.unit, t)}
                            {c.pending && (
                              <>
                                <Clock className="ms-1 inline size-3" aria-hidden />
                                <span className="sr-only"> ({t("waiting for approval")})</span>
                              </>
                            )}
                          </span>
                        ))}
                      </td>
                    ))}
                    <td className="py-3 pe-5 ps-2 text-end font-semibold whitespace-nowrap tabular-nums">
                      {r.totals.map((x) => (
                        <span key={x.unit} className="block">
                          {qtyLabel(x.quantity, x.unit, t)}
                        </span>
                      ))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      {byTask.length > 0 && (
        <Panel id="by-task-heading" title={t("Time by task this week")} icon={ListTodo} count={byTask.length}>
          <ul className="divide-y border-t text-sm">
            {byTask.map(([taskId, totals]) => (
              <li key={taskId ?? "project"} className="flex flex-wrap items-center justify-between gap-2 px-5 py-3 transition-colors hover:bg-accent/60">
                <span className="min-w-0">{taskLabel(taskId)}</span>
                <span className="font-medium tabular-nums">{totals.map((x) => qtyLabel(x.quantity, x.unit, t)).join(" · ")}</span>
              </li>
            ))}
          </ul>
          <p className="border-t px-5 py-2.5 text-xs text-muted-foreground">{t("Approved time only.")}</p>
        </Panel>
      )}

      {entries.length > 0 && (
        <Panel id="entries-heading" title={t("Entries this week")} icon={ListChecks} count={entries.length}>
          <ul className="divide-y border-t text-sm">
            {[...entries].reverse().map((e) => (
              <li key={e.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-5 py-3 transition-colors hover:bg-accent/60">
                <span className="w-28 shrink-0 text-muted-foreground tabular-nums">{formatDate(e.date, t.intl)}</span>
                <span className="min-w-0 flex-1">
                  <span className="font-medium">{e.personName}</span> · {qtyLabel(e.quantity, e.unit, t)} · <span className="text-muted-foreground">{taskLabel(e.taskId)}</span>
                  {e.note && <span className="block text-xs text-muted-foreground">“{e.note}”</span>}
                  <ApprovalBadge status={e.status} decidedBy={e.deciderName} note={e.decisionNote} />
                </span>
                <span className="flex gap-1">
                  {canEdit(e) && (
                    <Button variant="ghost" size="sm" onClick={() => setHoursDialog({ open: true, entry: e })} aria-label={t("Edit {name}'s time on {date}", { name: e.personName, date: formatDate(e.date, t.intl) })}>
                      <Pencil className="size-4" />
                    </Button>
                  )}
                  {canDelete(e) && <DeleteEntry entry={e} />}
                </span>
              </li>
            ))}
          </ul>
        </Panel>
      )}

      <Dialog open={hoursDialog.open} onOpenChange={(open) => setHoursDialog((d) => ({ ...d, open }))}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{hoursDialog.entry ? t("Change hours") : t("Log my hours")}</DialogTitle>
            <DialogDescription>
              {canManage ? t("Your hours count right away.") : t("The project manager approves your hours.")}
            </DialogDescription>
          </DialogHeader>
          {hoursDialog.open && (
            <HoursForm
              key={hoursDialog.entry?.id ?? "new"}
              {...props}
              entry={hoursDialog.entry}
              onDone={() => setHoursDialog((d) => ({ ...d, open: false }))}
            />
          )}
        </DialogContent>
      </Dialog>

      {canManage && (
        <Dialog open={attendanceOpen} onOpenChange={setAttendanceOpen}>
          <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
            <DialogHeader>
              <DialogTitle>{t("Record attendance")}</DialogTitle>
              <DialogDescription>{t("Tick the workers who were on site and how long they worked. Their used quantity and cost update on the Resources tab.")}</DialogDescription>
            </DialogHeader>
            {attendanceOpen && <AttendanceForm {...props} onDone={() => setAttendanceOpen(false)} />}
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}

function PendingItem({ entry: e, taskLabel }: { entry: EntryItem; taskLabel: string }) {
  const t = useT();
  const [rejecting, setRejecting] = useState(false);
  const [note, setNote] = useState("");
  const [pending, startTransition] = useTransition();
  const decide = (decision: "approved" | "rejected") =>
    startTransition(async () => {
      const res = await decideTimeEntry(e.id, { decision, note });
      if (!res.ok) return void toast.error(res.error);
      toast.success(decision === "approved" ? t("Hours approved") : t("Hours rejected"));
    });
  const label = t("{name}, {qty} on {date}", { name: e.personName, qty: qtyLabel(e.quantity, e.unit, t), date: formatDate(e.date, t.intl) });
  return (
    <li className="flex flex-wrap items-center gap-3 px-4 py-3 text-sm">
      <div className="min-w-0 flex-1">
        <p className="font-medium">{label}</p>
        <p className="text-xs text-muted-foreground">
          {taskLabel}
          {e.note && ` · “${e.note}”`}
        </p>
      </div>
      {rejecting ? (
        <form
          className="flex flex-wrap items-end gap-2"
          onSubmit={(ev) => {
            ev.preventDefault();
            decide("rejected");
          }}
        >
          <div className="grid gap-1">
            <Label htmlFor={`reject-${e.id}`} className="text-xs">
              {t("Reason for rejecting")}
            </Label>
            <Input id={`reject-${e.id}`} value={note} onChange={(ev) => setNote(ev.target.value)} className="h-8 w-56" autoFocus />
          </div>
          <Button size="sm" variant="destructive" type="submit" disabled={pending || !note.trim()}>
            {t("Reject")}
          </Button>
          <Button size="sm" variant="ghost" type="button" onClick={() => setRejecting(false)}>
            {t("Cancel")}
          </Button>
        </form>
      ) : (
        <div className="flex gap-2">
          <Button size="sm" disabled={pending} onClick={() => decide("approved")} aria-label={t("Approve {label}", { label })}>
            {pending ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
            {t("Approve")}
          </Button>
          <Button size="sm" variant="outline" disabled={pending} onClick={() => setRejecting(true)} aria-label={t("Reject {label}", { label })}>
            <X className="size-4" />
            {t("Reject")}
          </Button>
        </div>
      )}
    </li>
  );
}

function DeleteEntry({ entry }: { entry: EntryItem }) {
  const t = useT();
  const [confirm, setConfirm] = useState(false);
  const [pending, startTransition] = useTransition();
  return (
    <Button
      variant={confirm ? "destructive" : "ghost"}
      size="sm"
      disabled={pending}
      onBlur={() => setConfirm(false)}
      aria-label={confirm ? t("Confirm removing this time") : t("Remove {name}'s time on {date}", { name: entry.personName, date: formatDate(entry.date, t.intl) })}
      onClick={() => {
        if (!confirm) return setConfirm(true);
        startTransition(async () => {
          const res = await deleteTimeEntry(entry.id);
          if (!res.ok) return void toast.error(res.error);
          toast.success(t("Time removed"));
        });
      }}
    >
      <Trash2 className="size-4" />
      {confirm && t("Remove")}
    </Button>
  );
}

function TaskSelect({ id, value, onChange, tasks }: { id: string; value: string; onChange: (v: string) => void; tasks: TaskOption[] }) {
  const t = useT();
  return (
    <SelectBox id={id} value={value} onValueChange={(v) => onChange(v)} className={nativeSelectClass}>
      <option value="">{t("Whole project")}</option>
      {tasks.map((task) => (
        <option key={task.id} value={task.id}>
          #{task.number} {task.title}
        </option>
      ))}
    </SelectBox>
  );
}

function HoursForm({ projectId, tasks, today, entry, onDone }: Props & { entry?: EntryItem; onDone: () => void }) {
  const t = useT();
  const [form, setForm] = useState({
    date: entry?.date ?? today,
    taskId: entry?.taskId ?? "",
    hours: entry ? String(Number(entry.quantity)) : "",
    note: entry?.note ?? "",
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [pending, startTransition] = useTransition();
  return (
    <form
      className="grid gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        setErrors({});
        startTransition(async () => {
          const res = await logHours(projectId, form, entry?.id ?? null);
          if (!res.ok) return setErrors(res.fieldErrors ?? { form: res.error });
          toast.success(entry ? t("Hours updated") : t("Hours logged"));
          onDone();
        });
      }}
    >
      <div className="grid items-start gap-4 sm:grid-cols-2">
        <div className="grid gap-1.5">
          <Label htmlFor="hours-date">{t("Date")}</Label>
          <Input id="hours-date" type="date" value={form.date} max={today} onChange={(e) => setForm({ ...form, date: e.target.value })} aria-invalid={Boolean(errors.date)} />
          <FieldError message={errors.date} />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="hours-amount">{t("Hours")}</Label>
          <Input id="hours-amount" inputMode="decimal" value={form.hours} onChange={(e) => setForm({ ...form, hours: e.target.value })} placeholder="8" className="tabular-nums" aria-invalid={Boolean(errors.hours)} />
          <FieldError message={errors.hours} />
        </div>
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="hours-task">{t("Task")}</Label>
        <TaskSelect id="hours-task" value={form.taskId} onChange={(taskId) => setForm({ ...form, taskId })} tasks={tasks} />
        <FieldError message={errors.taskId} />
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="hours-note">
          {t("Note")} <span className="font-normal text-muted-foreground">{t("(optional)")}</span>
        </Label>
        <Input id="hours-note" dir="auto" value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} maxLength={500} />
      </div>
      <FieldError message={errors.form} />
      <DialogFooter>
        <Button type="button" variant="ghost" onClick={onDone}>
          {t("Cancel")}
        </Button>
        <Button type="submit" disabled={pending}>
          {pending && <Loader2 className="size-4 animate-spin" />}
          {t("Save")}
        </Button>
      </DialogFooter>
    </form>
  );
}

function AttendanceForm({ projectId, tasks, today, workers, onDone }: Props & { onDone: () => void }) {
  const t = useT();
  const [date, setDate] = useState(today);
  const [taskId, setTaskId] = useState("");
  const [note, setNote] = useState("");
  const [picked, setPicked] = useState<Record<string, string>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [pending, startTransition] = useTransition();
  const chosen = Object.entries(picked);
  return (
    <form
      className="grid gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        setErrors({});
        startTransition(async () => {
          const res = await recordAttendance(projectId, {
            date,
            taskId,
            note,
            workers: chosen.map(([resourceId, quantity]) => ({ resourceId, quantity })),
          });
          if (!res.ok) return setErrors(res.fieldErrors ?? { form: res.error });
          toast.success(t.plural(chosen.length, "Attendance recorded for {count} worker", "Attendance recorded for {count} workers"));
          onDone();
        });
      }}
    >
      <div className="grid items-start gap-4 sm:grid-cols-2">
        <div className="grid gap-1.5">
          <Label htmlFor="att-date">{t("Date")}</Label>
          <Input id="att-date" type="date" value={date} max={today} onChange={(e) => setDate(e.target.value)} aria-invalid={Boolean(errors.date)} />
          <FieldError message={errors.date} />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="att-task">{t("Task")}</Label>
          <TaskSelect id="att-task" value={taskId} onChange={setTaskId} tasks={tasks} />
        </div>
      </div>
      {workers.length === 0 ? (
        <p className="rounded-lg border bg-muted/50 px-3 py-2 text-sm">
          {t("No workers in the resource library yet. Add workers on the Resources page first.")}
        </p>
      ) : (
        <fieldset className="grid gap-1">
          <legend className="mb-1 text-sm font-medium">{t("Who was on site")}</legend>
          {workers.map((w) => {
            const on = w.id in picked;
            return (
              <div key={w.id} className={cn("flex items-center gap-3 rounded-lg border px-3 py-2", on && "border-primary/40 bg-primary/5")}>
                <input
                  id={`att-${w.id}`}
                  type="checkbox"
                  checked={on}
                  onChange={(e) =>
                    setPicked((p) => {
                      const next = { ...p };
                      if (e.target.checked) next[w.id] = String(defaultQuantity(w.unit));
                      else delete next[w.id];
                      return next;
                    })
                  }
                  className="size-4 accent-primary"
                />
                <label htmlFor={`att-${w.id}`} className="min-w-0 flex-1 cursor-pointer text-sm">
                  <span className="font-medium">{w.name}</span>
                  {w.role && <span className="text-muted-foreground"> · {w.role}</span>}
                  {!w.onProject && <span className="block text-xs text-muted-foreground">{t("Not on this project yet — will be added")}</span>}
                </label>
                {on && (
                  <span className="flex items-center gap-1.5">
                    <Input
                      inputMode="decimal"
                      value={picked[w.id]}
                      onChange={(e) => setPicked((p) => ({ ...p, [w.id]: e.target.value }))}
                      className="h-8 w-16 text-center tabular-nums"
                      aria-label={t("How long {name} worked ({unit})", { name: w.name, unit: t(w.unit) })}
                    />
                    <span className="text-xs text-muted-foreground">{t(w.unit)}</span>
                  </span>
                )}
              </div>
            );
          })}
        </fieldset>
      )}
      <div className="grid gap-1.5">
        <Label htmlFor="att-note">
          {t("Note")} <span className="font-normal text-muted-foreground">{t("(optional)")}</span>
        </Label>
        <Input id="att-note" dir="auto" value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} />
      </div>
      <FieldError message={errors.workers ?? errors.form ?? errors.quantity} />
      <DialogFooter>
        <Button type="button" variant="ghost" onClick={onDone}>
          {t("Cancel")}
        </Button>
        <Button type="submit" disabled={pending || chosen.length === 0}>
          {pending && <Loader2 className="size-4 animate-spin" />}
          {t("Save attendance")}
        </Button>
      </DialogFooter>
    </form>
  );
}
