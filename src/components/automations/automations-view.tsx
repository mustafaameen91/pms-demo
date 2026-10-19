"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  CheckCircle2,
  CircleSlash,
  Loader2,
  Pencil,
  Plus,
  Trash2,
  Workflow,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";
import { createAutomation, deleteAutomation, setAutomationEnabled, updateAutomation } from "@/lib/actions/automations";
import {
  brokenReason,
  describeAction,
  describeTrigger,
  type Action,
  type RuleNames,
  type Trigger,
} from "@/lib/automations";
import { PRIORITIES, type Priority } from "@/lib/constants";
import { cn, formatMoney } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FieldError } from "@/components/projects/project-fields";
import { nativeSelectClass } from "@/components/resources/resource-fields";

type Option = { id: string; name: string };
type Rule = { id: string; trigger: Trigger; action: Action; enabled: boolean; runs: number; lastRunAt: Date | null };
type Run = { id: string; ruleId: string; status: "done" | "skipped" | "failed"; message: string; createdAt: Date; taskNumber: number | null };

type Props = {
  projectId: string;
  projectKey: string;
  basePath: string;
  currency: string;
  canManage: boolean;
  statuses: Option[];
  members: Option[];
  rules: Rule[];
  runs: Run[];
};

const TRIGGERS: { value: Trigger["type"]; label: string }[] = [
  { value: "task.status_changed", label: "a task moves to a column" },
  { value: "task.created", label: "a task is created" },
  { value: "task.late", label: "a task becomes late" },
  { value: "expense.added", label: "an expense is added" },
];
const ACTIONS: { value: Action["type"]; label: string }[] = [
  { value: "notify", label: "notify someone" },
  { value: "set_status", label: "move the task to a column" },
  { value: "assign", label: "assign the task to" },
  { value: "set_priority", label: "set the task's priority" },
];
const TARGETS = [
  { value: "manager", label: "the project manager" },
  { value: "assignee", label: "the assignee" },
  { value: "admins", label: "workspace admins" },
  { value: "user", label: "a person…" },
] as const;

/** Flat form state; turned into a trigger + action on save. */
type Draft = {
  trigger: Trigger["type"];
  whenStatusId: string; // "" = any column
  minAmount: string;
  action: Action["type"];
  to: (typeof TARGETS)[number]["value"];
  userId: string;
  message: string;
  email: boolean;
  statusId: string;
  priority: Priority;
};

const emptyDraft = (statuses: Option[]): Draft => ({
  trigger: "task.status_changed",
  whenStatusId: statuses.at(-1)?.id ?? "",
  minAmount: "",
  action: "notify",
  to: "manager",
  userId: "",
  message: "",
  email: false,
  statusId: statuses[0]?.id ?? "",
  priority: "high",
});

function toDraft(rule: Rule, statuses: Option[]): Draft {
  const d = emptyDraft(statuses);
  d.trigger = rule.trigger.type;
  if (rule.trigger.type === "task.status_changed") d.whenStatusId = rule.trigger.statusId ?? "";
  if (rule.trigger.type === "expense.added") d.minAmount = rule.trigger.minAmount ?? "";
  const a = rule.action;
  d.action = a.type;
  if (a.type === "notify") Object.assign(d, { to: a.to, userId: a.userId ?? "", message: a.message ?? "", email: a.email });
  if (a.type === "set_status") d.statusId = a.statusId;
  if (a.type === "assign") d.userId = a.userId;
  if (a.type === "set_priority") d.priority = a.priority;
  return d;
}

function fromDraft(d: Draft): { trigger: Trigger; action: Action } {
  const trigger: Trigger =
    d.trigger === "task.status_changed"
      ? { type: d.trigger, statusId: d.whenStatusId || null }
      : d.trigger === "expense.added"
        ? { type: d.trigger, minAmount: d.minAmount.replace(/,/g, "").trim() || null }
        : { type: d.trigger };
  const action: Action =
    d.action === "notify"
      ? { type: "notify", to: d.to, userId: d.to === "user" ? d.userId || null : null, message: d.message.trim() || null, email: d.email }
      : d.action === "set_status"
        ? { type: "set_status", statusId: d.statusId }
        : d.action === "assign"
          ? { type: "assign", userId: d.userId }
          : { type: "set_priority", priority: d.priority };
  return { trigger, action };
}

export function AutomationsView(props: Props) {
  const { statuses, members, rules, runs, canManage, currency } = props;
  const names: RuleNames = {
    statuses: Object.fromEntries(statuses.map((s) => [s.id, s.name])),
    people: Object.fromEntries(members.map((m) => [m.id, m.name])),
    money: (a) => formatMoney(a, currency),
  };
  // null = closed, "new" = creating, otherwise the id of the rule being edited.
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft>(() => emptyDraft(statuses));
  const [confirm, setConfirm] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const open = (id: string, d: Draft) => {
    setDraft(d);
    setEditing(id);
  };

  const presets: { label: string; draft: Partial<Draft> }[] = [
    { label: "When a task moves to the last column, notify the project manager", draft: {} },
    { label: "When a task becomes late, set its priority to Urgent", draft: { trigger: "task.late", action: "set_priority", priority: "urgent" } },
    { label: "When a task is created, assign it to someone", draft: { trigger: "task.created", action: "assign", userId: members[0]?.id ?? "" } },
  ];

  return (
    <div className="grid grid-cols-1 gap-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="flex items-center gap-2 text-lg font-semibold">
            <Workflow className="size-5 text-primary" aria-hidden />
            Automations
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            Let the project do routine work for you: “when this happens, do that”. Changes made by an automation don&apos;t
            start other automations, so rules can never loop.
          </p>
        </div>
        {canManage && editing === null && rules.length > 0 && (
          <Button onClick={() => open("new", emptyDraft(statuses))}>
            <Plus className="size-4" />
            New automation
          </Button>
        )}
      </header>

      {!canManage && (
        <p className="rounded-lg border bg-muted/40 px-4 py-3 text-sm text-muted-foreground">
          Only workspace admins and the project manager can add or change automations.
        </p>
      )}

      {editing !== null && (
        <RuleBuilder
          draft={draft}
          setDraft={setDraft}
          statuses={statuses}
          members={members}
          currency={currency}
          isNew={editing === "new"}
          pending={pending}
          onCancel={() => setEditing(null)}
          onSave={(rule, setError) =>
            startTransition(async () => {
              const r = editing === "new" ? await createAutomation(props.projectId, rule) : await updateAutomation(editing, rule);
              if (!r.ok) return setError(r.error);
              toast.success(editing === "new" ? "Automation added" : "Automation saved");
              setEditing(null);
            })
          }
        />
      )}

      {rules.length === 0 && editing === null ? (
        <section aria-label="No automations yet" className="rounded-xl border border-dashed p-6 text-center sm:p-8">
          <Workflow className="mx-auto size-8 text-muted-foreground" aria-hidden />
          <p className="mt-3 font-medium">No automations yet</p>
          <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
            {canManage ? "Start from an idea below or build your own." : "When the project manager adds one, it will show here."}
          </p>
          {canManage && (
            <div className="mx-auto mt-5 grid max-w-lg gap-2 text-start">
              {presets.map((p) => (
                <button
                  key={p.label}
                  type="button"
                  onClick={() => open("new", { ...emptyDraft(statuses), ...p.draft })}
                  className="flex cursor-pointer items-center gap-3 rounded-lg border bg-card px-4 py-3 text-sm transition-colors hover:border-primary/50 hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                >
                  <Plus className="size-4 shrink-0 text-primary" aria-hidden />
                  {p.label}
                </button>
              ))}
              <Button variant="outline" className="mt-1" onClick={() => open("new", emptyDraft(statuses))}>
                Build your own
              </Button>
            </div>
          )}
        </section>
      ) : (
        rules.length > 0 && (
          <section aria-labelledby="rules-heading">
            <h2 id="rules-heading" className="sr-only">
              Rules
            </h2>
            <ul className="grid gap-3">
              {rules.map((rule) => {
                const broken = brokenReason(rule, names);
                const label = `When ${describeTrigger(rule.trigger, names)}, ${describeAction(rule.action, names)}`;
                return (
                  <li
                    key={rule.id}
                    aria-label={label}
                    className={cn("rounded-xl border bg-card p-4 transition-opacity", !rule.enabled && "opacity-70")}
                  >
                    <div className="flex flex-wrap items-start gap-3">
                      <RuleSwitch
                        checked={rule.enabled}
                        disabled={!canManage || pending}
                        label={`${rule.enabled ? "Turn off" : "Turn on"}: ${label}`}
                        onChange={(on) =>
                          startTransition(async () => {
                            const r = await setAutomationEnabled(rule.id, on);
                            if (!r.ok) return void toast.error(r.error);
                            toast.success(on ? "Automation turned on" : "Automation turned off");
                          })
                        }
                      />
                      <div className="min-w-0 flex-1 text-sm">
                        <p className="leading-6">
                          <span className="font-semibold text-primary">When</span> {describeTrigger(rule.trigger, names)},{" "}
                          <span className="font-semibold">then</span> {describeAction(rule.action, names)}
                        </p>
                        {rule.action.type === "notify" && rule.action.message && (
                          <p className="mt-0.5 text-muted-foreground">Message: “{rule.action.message}”</p>
                        )}
                        <p className="mt-1 text-xs text-muted-foreground">
                          {rule.enabled ? "On" : "Off"} · {rule.runs === 0 ? "Hasn't run yet" : `Ran ${rule.runs} ${rule.runs === 1 ? "time" : "times"}`}
                          {rule.lastRunAt && (
                            <>
                              {" "}· last{" "}
                              <time dateTime={new Date(rule.lastRunAt).toISOString()} suppressHydrationWarning>
                                {new Date(rule.lastRunAt).toLocaleString()}
                              </time>
                            </>
                          )}
                        </p>
                        {broken && (
                          <p className="mt-1.5 flex items-center gap-1.5 text-xs font-medium text-destructive">
                            <AlertTriangle className="size-3.5" aria-hidden />
                            {broken} Edit it to fix.
                          </p>
                        )}
                      </div>
                      {canManage && (
                        // Own row on phones so the rule text keeps its width.
                        <div className="-ms-2 flex w-full gap-1 ps-12 sm:ms-0 sm:w-auto sm:ps-0">
                          <Button size="sm" variant="ghost" onClick={() => open(rule.id, toDraft(rule, statuses))} aria-label={`Edit: ${label}`}>
                            <Pencil className="size-4" />
                            Edit
                          </Button>
                          <Button
                            size="sm"
                            variant={confirm === rule.id ? "destructive" : "ghost"}
                            disabled={pending}
                            aria-label={confirm === rule.id ? `Confirm deleting: ${label}` : `Delete: ${label}`}
                            onBlur={() => setConfirm((c) => (c === rule.id ? null : c))}
                            onClick={() => {
                              if (confirm !== rule.id) return setConfirm(rule.id);
                              setConfirm(null);
                              startTransition(async () => {
                                const r = await deleteAutomation(rule.id);
                                if (!r.ok) return void toast.error(r.error);
                                toast.success("Automation deleted");
                              });
                            }}
                          >
                            <Trash2 className="size-4" />
                            {confirm === rule.id ? "Delete it" : "Delete"}
                          </Button>
                        </div>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>
        )
      )}

      {rules.length > 0 && <RunHistory runs={runs} rules={rules} names={names} projectKey={props.projectKey} basePath={props.basePath} />}
    </div>
  );
}

function RuleSwitch({ checked, disabled, label, onChange }: { checked: boolean; disabled: boolean; label: string; onChange: (on: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      // 44px-tall hit area around a compact track.
      className="group -my-2 flex h-11 cursor-pointer items-center rounded-full focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50"
    >
      <span
        className={cn(
          "relative inline-flex h-6 w-10 shrink-0 items-center rounded-full border-2 border-transparent transition-colors group-focus-visible:ring-2 group-focus-visible:ring-ring group-focus-visible:ring-offset-2 group-focus-visible:ring-offset-background",
          checked ? "bg-primary" : "bg-input",
        )}
      >
        <span
          className={cn(
            "size-5 rounded-full bg-background shadow-sm transition-transform duration-200 motion-reduce:transition-none",
            checked ? "translate-x-4" : "translate-x-0",
          )}
        />
      </span>
    </button>
  );
}

function RuleBuilder({
  draft,
  setDraft,
  statuses,
  members,
  currency,
  isNew,
  pending,
  onCancel,
  onSave,
}: {
  draft: Draft;
  setDraft: (d: Draft) => void;
  statuses: Option[];
  members: Option[];
  currency: string;
  isNew: boolean;
  pending: boolean;
  onCancel: () => void;
  onSave: (rule: { trigger: Trigger; action: Action }, setError: (e: string) => void) => void;
}) {
  const [error, setError] = useState<string>();
  const set = (patch: Partial<Draft>) => {
    setError(undefined);
    setDraft({ ...draft, ...patch });
  };
  const isExpense = draft.trigger === "expense.added";
  const actions = isExpense ? ACTIONS.filter((a) => a.value === "notify") : ACTIONS;
  const targets = isExpense ? TARGETS.filter((t) => t.value !== "assignee") : TARGETS;

  return (
    <form
      aria-labelledby="builder-heading"
      className="rounded-xl border-2 border-primary/40 bg-card p-5 sm:p-6"
      onSubmit={(e) => {
        e.preventDefault();
        onSave(fromDraft(draft), setError);
      }}
    >
      <h2 id="builder-heading" className="font-semibold">
        {isNew ? "New automation" : "Edit automation"}
      </h2>

      <fieldset className="mt-4 grid gap-3 rounded-lg border-s-4 border-primary bg-muted/40 p-4">
        <legend className="sr-only">When</legend>
        <p aria-hidden className="text-xs font-semibold tracking-wide text-primary uppercase">When</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="grid gap-1.5">
            <Label htmlFor="rb-trigger">This happens</Label>
            <select
              id="rb-trigger"
              value={draft.trigger}
              className={nativeSelectClass}
              onChange={(e) => {
                const trigger = e.target.value as Draft["trigger"];
                set({
                  trigger,
                  ...(trigger === "expense.added" && { action: "notify", to: draft.to === "assignee" ? "manager" : draft.to }),
                });
              }}
            >
              {TRIGGERS.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
          </div>
          {draft.trigger === "task.status_changed" && (
            <div className="grid gap-1.5">
              <Label htmlFor="rb-when-status">Column</Label>
              <select id="rb-when-status" value={draft.whenStatusId} onChange={(e) => set({ whenStatusId: e.target.value })} className={nativeSelectClass}>
                <option value="">Any column</option>
                {statuses.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>
          )}
          {isExpense && (
            <div className="grid gap-1.5">
              <Label htmlFor="rb-min">Only above ({currency})</Label>
              <Input
                id="rb-min"
                inputMode="decimal"
                value={draft.minAmount}
                onChange={(e) => set({ minAmount: e.target.value })}
                placeholder="Any amount"
                className="tabular-nums"
              />
            </div>
          )}
        </div>
        {draft.trigger === "task.late" && (
          <p className="text-xs text-muted-foreground">
            Runs once per task when its end date has passed and it isn&apos;t finished. Checked whenever someone opens the app.
          </p>
        )}
        {draft.trigger !== "expense.added" && (
          <p className="text-xs text-muted-foreground">Applies to main tasks, not sub-tasks.</p>
        )}
      </fieldset>

      <fieldset className="mt-3 grid gap-3 rounded-lg border-s-4 border-brand-accent bg-muted/40 p-4">
        <legend className="sr-only">Then</legend>
        <p aria-hidden className="text-xs font-semibold tracking-wide uppercase">Then</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="grid gap-1.5">
            <Label htmlFor="rb-action">Do this</Label>
            <select id="rb-action" value={draft.action} onChange={(e) => set({ action: e.target.value as Draft["action"] })} className={nativeSelectClass}>
              {actions.map((a) => (
                <option key={a.value} value={a.value}>
                  {a.label}
                </option>
              ))}
            </select>
          </div>
          {draft.action === "notify" && (
            <div className="grid gap-1.5">
              <Label htmlFor="rb-to">Who</Label>
              <select id="rb-to" value={draft.to} onChange={(e) => set({ to: e.target.value as Draft["to"] })} className={nativeSelectClass}>
                {targets.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </select>
            </div>
          )}
          {((draft.action === "notify" && draft.to === "user") || draft.action === "assign") && (
            <div className="grid gap-1.5">
              <Label htmlFor="rb-user">Person</Label>
              <select id="rb-user" value={draft.userId} onChange={(e) => set({ userId: e.target.value })} className={nativeSelectClass}>
                <option value="">Choose…</option>
                {members.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </select>
            </div>
          )}
          {draft.action === "set_status" && (
            <div className="grid gap-1.5">
              <Label htmlFor="rb-status">Column</Label>
              <select id="rb-status" value={draft.statusId} onChange={(e) => set({ statusId: e.target.value })} className={nativeSelectClass}>
                {statuses.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>
          )}
          {draft.action === "set_priority" && (
            <div className="grid gap-1.5">
              <Label htmlFor="rb-priority">Priority</Label>
              <select id="rb-priority" value={draft.priority} onChange={(e) => set({ priority: e.target.value as Priority })} className={nativeSelectClass}>
                {PRIORITIES.map((p) => (
                  <option key={p.value} value={p.value}>
                    {p.label}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>
        {draft.action === "notify" && (
          <>
            <div className="grid gap-1.5">
              <Label htmlFor="rb-message">Message (optional)</Label>
              <Input
                id="rb-message"
                value={draft.message}
                maxLength={300}
                onChange={(e) => set({ message: e.target.value })}
                placeholder="e.g. Please check the work and close the task"
              />
            </div>
            <label className="flex cursor-pointer items-center gap-2 text-sm">
              <input type="checkbox" checked={draft.email} onChange={(e) => set({ email: e.target.checked })} className="size-4 accent-primary" />
              Also send an email
            </label>
            <p className="text-xs text-muted-foreground">The person who made the change isn&apos;t notified about their own change.</p>
          </>
        )}
      </fieldset>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <Button type="submit" disabled={pending}>
          {pending && <Loader2 className="size-4 animate-spin" />}
          {isNew ? "Add automation" : "Save automation"}
        </Button>
        <Button type="button" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
        <FieldError message={error} />
      </div>
    </form>
  );
}

const RUN_STATUS = {
  done: { label: "Done", icon: CheckCircle2, className: "text-primary" },
  skipped: { label: "Skipped", icon: CircleSlash, className: "text-muted-foreground" },
  failed: { label: "Failed", icon: XCircle, className: "text-destructive" },
} as const;

function RunHistory({ runs, rules, names, projectKey, basePath }: { runs: Run[]; rules: Rule[]; names: RuleNames; projectKey: string; basePath: string }) {
  const ruleText = (id: string) => {
    const r = rules.find((x) => x.id === id);
    return r ? `When ${describeTrigger(r.trigger, names)}` : "Deleted rule";
  };
  return (
    <section aria-labelledby="runs-heading" className="rounded-xl border bg-card">
      <h2 id="runs-heading" className="border-b px-4 py-3 font-semibold">
        Run history
      </h2>
      {runs.length === 0 ? (
        <p className="px-4 py-6 text-center text-sm text-muted-foreground">Nothing has run yet. Runs show here as they happen.</p>
      ) : (
        <div className="relative overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-start text-xs text-muted-foreground">
              <tr className="border-b">
                <th scope="col" className="px-4 py-2 font-medium">Result</th>
                <th scope="col" className="px-4 py-2 font-medium">What happened</th>
                <th scope="col" className="hidden px-4 py-2 font-medium sm:table-cell">Rule</th>
                <th scope="col" className="px-4 py-2 text-end font-medium">When</th>
              </tr>
            </thead>
            <tbody>
              {runs.map((run) => {
                const s = RUN_STATUS[run.status];
                const at = new Date(run.createdAt);
                return (
                  <tr key={run.id} className="border-b last:border-0">
                    <td className={cn("px-4 py-2 whitespace-nowrap", s.className)}>
                      <span className="flex items-center gap-1.5 font-medium">
                        <s.icon className="size-4" aria-hidden />
                        {s.label}
                      </span>
                    </td>
                    <td className="px-4 py-2">
                      {run.message}
                      {run.taskNumber !== null && (
                        <Link href={`${basePath}?task=${projectKey}-${run.taskNumber}`} className="ms-1.5 text-xs text-primary underline-offset-2 hover:underline">
                          Open {projectKey}-{run.taskNumber}
                        </Link>
                      )}
                    </td>
                    <td className="hidden px-4 py-2 text-muted-foreground sm:table-cell">{ruleText(run.ruleId)}</td>
                    <td className="px-4 py-2 text-end text-xs whitespace-nowrap text-muted-foreground tabular-nums">
                      <time dateTime={at.toISOString()} title={at.toLocaleString()} suppressHydrationWarning>
                        {at.toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                      </time>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
