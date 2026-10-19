/** Automation rules ("when … then …"): shapes, validation and matching (pure). */
import { z } from "zod";
import { PRIORITIES, type Priority } from "@/lib/constants";
import { createT, type T } from "@/i18n/translate";

const EN = createT("en", {});

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

const priorityLabel = (p: Priority, t: T) => t(PRIORITIES.find((x) => x.value === p)?.label ?? p);

const column = (names: RuleNames, id: string, t: T) =>
  names.statuses[id] ? `“${names.statuses[id]}”` : t("a deleted column");
const person = (names: RuleNames, id: string | null, t: T) => (id && names.people[id]) || t("a former member");

export function describeTrigger(tr: Trigger, names: RuleNames, t: T = EN) {
  switch (tr.type) {
    case "task.created": return t("a task is created");
    case "task.status_changed":
      return tr.statusId ? t("a task moves to {column}", { column: column(names, tr.statusId, t) }) : t("a task moves to another column");
    case "task.late": return t("a task becomes late");
    case "expense.added":
      return tr.minAmount ? t("an expense above {amount} is added", { amount: names.money(tr.minAmount) }) : t("an expense is added");
  }
}

export function describeAction(a: Action, names: RuleNames, t: T = EN) {
  switch (a.type) {
    case "notify": {
      const who = {
        manager: t("the project manager"),
        assignee: t("the assignee"),
        admins: t("workspace admins"),
        user: person(names, a.userId, t),
      }[a.to];
      return a.email ? t("notify {who} (in app + email)", { who }) : t("notify {who}", { who });
    }
    case "set_status": return t("move it to {column}", { column: column(names, a.statusId, t) });
    case "assign": return t("assign it to {person}", { person: person(names, a.userId, t) });
    case "set_priority": return t("set priority to {priority}", { priority: priorityLabel(a.priority, t) });
  }
}

/** "When a task moves to “Done”, notify the project manager." */
export function describeRule(rule: { trigger: Trigger; action: Action }, names: RuleNames, t: T = EN) {
  return t("When {trigger}, {action}.", { trigger: describeTrigger(rule.trigger, names, t), action: describeAction(rule.action, names, t) });
}

/** A rule that points at a deleted column or a person who left can't run. */
export function brokenReason(rule: { trigger: Trigger; action: Action }, names: RuleNames, t: T = EN): string | null {
  if (rule.trigger.type === "task.status_changed" && rule.trigger.statusId && !names.statuses[rule.trigger.statusId]) {
    return t("Its column was deleted.");
  }
  const a = rule.action;
  if (a.type === "set_status" && !names.statuses[a.statusId]) return t("Its target column was deleted.");
  if ((a.type === "assign" || (a.type === "notify" && a.to === "user")) && a.userId && !names.people[a.userId]) {
    return t("The person it names is no longer a member.");
  }
  return null;
}
