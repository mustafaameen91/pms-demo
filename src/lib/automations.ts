/** Automation rules ("when … then …"): shapes, validation and matching (pure). */
import { z } from "zod";
import { PRIORITIES, type Priority } from "@/lib/constants";

const PRIORITY_VALUES = PRIORITIES.map((p) => p.value) as [Priority, ...Priority[]];

export const triggerSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("task.created") }),
  // statusId null = any column.
  z.object({ type: z.literal("task.status_changed"), statusId: z.string().min(1).nullable() }),
  z.object({ type: z.literal("task.late") }),
  // minAmount null = any amount.
  z.object({
    type: z.literal("expense.added"),
    minAmount: z
      .string()
      .trim()
      .regex(/^\d+(\.\d{1,2})?$/, "Enter an amount like 500 or 99.50")
      .nullable(),
  }),
]);
export type Trigger = z.infer<typeof triggerSchema>;

export const NOTIFY_TARGETS = ["manager", "assignee", "admins", "user"] as const;

export const actionSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("notify"),
    to: z.enum(NOTIFY_TARGETS),
    userId: z.string().min(1).nullable(),
    message: z.string().trim().max(300).nullable(),
    email: z.boolean(),
  }),
  z.object({ type: z.literal("set_status"), statusId: z.string().min(1, "Choose a column") }),
  z.object({ type: z.literal("assign"), userId: z.string().min(1, "Choose a person") }),
  z.object({ type: z.literal("set_priority"), priority: z.enum(PRIORITY_VALUES) }),
]);
export type Action = z.infer<typeof actionSchema>;

/** Task actions need a task; an expense rule can only notify. */
export const ruleSchema = z
  .object({ trigger: triggerSchema, action: actionSchema })
  .superRefine(({ trigger, action }, ctx) => {
    if (trigger.type === "expense.added" && action.type !== "notify") {
      ctx.addIssue({ code: "custom", path: ["action"], message: "When an expense is added, the only action is to notify someone." });
    }
    if (action.type === "notify" && action.to === "user" && !action.userId) {
      ctx.addIssue({ code: "custom", path: ["action"], message: "Choose who to notify." });
    }
    if (action.type === "notify" && action.to === "assignee" && trigger.type === "expense.added") {
      ctx.addIssue({ code: "custom", path: ["action"], message: "Expenses have no assignee — notify the manager, admins or a person." });
    }
    if (trigger.type === "task.status_changed" && action.type === "set_status" && trigger.statusId === null) {
      // "Moves to any column → move to X" would fire on every move.
      ctx.addIssue({ code: "custom", path: ["action"], message: "Pick a specific column in “When”, or a different action." });
    }
    if (
      trigger.type === "task.status_changed" &&
      action.type === "set_status" &&
      trigger.statusId === action.statusId
    ) {
      ctx.addIssue({ code: "custom", path: ["action"], message: "The task is already in that column." });
    }
  });
export type RuleInput = z.input<typeof ruleSchema>;

export type AutomationEvent =
  | { type: "task.created"; projectId: string; taskId: string }
  | { type: "task.status_changed"; projectId: string; taskId: string; statusId: string }
  | { type: "task.late"; projectId: string; taskId: string; dueDate: string }
  | { type: "expense.added"; projectId: string; expenseId: string; amount: string; description: string };

/** Does this rule's "when" fire for the event? */
export function matchesTrigger(trigger: Trigger, event: AutomationEvent): boolean {
  if (trigger.type !== event.type) return false;
  switch (trigger.type) {
    case "task.status_changed":
      return trigger.statusId === null || (event.type === "task.status_changed" && trigger.statusId === event.statusId);
    case "expense.added":
      return trigger.minAmount === null || (event.type === "expense.added" && Number(event.amount) > Number(trigger.minAmount));
    default:
      return true;
  }
}

/** Names the rule refers to, so it can be described in words. */
export type RuleNames = {
  statuses: Record<string, string>;
  people: Record<string, string>;
  money: (amount: string) => string;
};

const priorityLabel = (p: Priority) => PRIORITIES.find((x) => x.value === p)?.label ?? p;

const column = (names: RuleNames, id: string) => (names.statuses[id] ? `“${names.statuses[id]}”` : "a deleted column");
const person = (names: RuleNames, id: string | null) => (id && names.people[id]) || "a former member";

export function describeTrigger(t: Trigger, names: RuleNames) {
  switch (t.type) {
    case "task.created": return "a task is created";
    case "task.status_changed": return t.statusId ? `a task moves to ${column(names, t.statusId)}` : "a task moves to another column";
    case "task.late": return "a task becomes late";
    case "expense.added": return t.minAmount ? `an expense above ${names.money(t.minAmount)} is added` : "an expense is added";
  }
}

export function describeAction(a: Action, names: RuleNames) {
  switch (a.type) {
    case "notify": {
      const who = { manager: "the project manager", assignee: "the assignee", admins: "workspace admins", user: person(names, a.userId) }[a.to];
      return `notify ${who}${a.email ? " (in app + email)" : ""}`;
    }
    case "set_status": return `move it to ${column(names, a.statusId)}`;
    case "assign": return `assign it to ${person(names, a.userId)}`;
    case "set_priority": return `set priority to ${priorityLabel(a.priority)}`;
  }
}

/** "When a task moves to “Done”, notify the project manager." */
export function describeRule(rule: { trigger: Trigger; action: Action }, names: RuleNames) {
  return `When ${describeTrigger(rule.trigger, names)}, ${describeAction(rule.action, names)}.`;
}

/** A rule that points at a deleted column or a person who left can't run. */
export function brokenReason(rule: { trigger: Trigger; action: Action }, names: RuleNames): string | null {
  if (rule.trigger.type === "task.status_changed" && rule.trigger.statusId && !names.statuses[rule.trigger.statusId]) {
    return "Its column was deleted.";
  }
  const a = rule.action;
  if (a.type === "set_status" && !names.statuses[a.statusId]) return "Its target column was deleted.";
  if ((a.type === "assign" || (a.type === "notify" && a.to === "user")) && a.userId && !names.people[a.userId]) {
    return "The person it names is no longer a member.";
  }
  return null;
}
