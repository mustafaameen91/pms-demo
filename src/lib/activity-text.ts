/** Plain-English description of an activity row, for the audit log (pure). */
const s = (v: unknown) => (typeof v === "string" ? v : v === null || v === undefined ? "" : String(v));

export const ACTIVITY_GROUPS = {
  tasks: "Tasks",
  projects: "Projects",
  money: "Money",
  members: "Members",
  billing: "Billing",
} as const;
export type ActivityGroup = keyof typeof ACTIVITY_GROUPS;

export function activityGroup(type: string): ActivityGroup {
  if (type.startsWith("task.") || type.startsWith("subtask.") || type.startsWith("comment.")) return "tasks";
  if (type.startsWith("expense.") || type.startsWith("resource.")) return "money";
  if (type.startsWith("member.")) return "members";
  if (type.startsWith("subscription.")) return "billing";
  return "projects";
}

/** Prefix filters per group, for querying. */
export const GROUP_PREFIXES: Record<ActivityGroup, string[]> = {
  tasks: ["task.", "subtask.", "comment."],
  projects: ["project.", "share."],
  money: ["expense.", "resource."],
  members: ["member."],
  billing: ["subscription."],
};

export function describeActivity(type: string, data: Record<string, unknown>, taskRef?: string | null) {
  const on = taskRef ? ` on ${taskRef}` : "";
  switch (type) {
    case "project.created": return `created the project “${s(data.name)}”`;
    case "project.updated": return `updated project details (${(Array.isArray(data.fields) ? data.fields : []).join(", ")})`;
    case "project.archived": return "archived the project";
    case "project.restored": return "restored the project";
    case "project.deleted": return `deleted the project “${s(data.name)}” (${s(data.key)})`;
    case "share.created": return `created a client link${data.showBudget ? " (with budget)" : ""}`;
    case "share.revoked": return "turned off the client link";
    case "task.created": return `created ${taskRef ?? "a task"}`;
    case "task.deleted": return `deleted task “${s(data.title)}”`;
    case "task.restored": return `restored ${taskRef ?? "a task"}`;
    case "task.renamed": return `renamed ${taskRef ?? "a task"} to “${s(data.to)}”`;
    case "task.status_changed": return `moved ${taskRef ?? "a task"} to ${s(data.toName)}`;
    case "task.progress_changed": return `set progress${on} to ${s(data.to)}%`;
    case "task.weight_changed": return data.to !== null ? `set weight${on} to ${Number(data.to)}%` : `removed the weight${on}`;
    case "task.budget_changed": return data.to !== null ? `set budget${on} to ${s(data.to)}` : `removed the budget${on}`;
    case "task.assignee_changed": return data.to ? `changed the assignee${on}` : `removed the assignee${on}`;
    case "task.priority_changed": return `set priority${on} to ${s(data.to)}`;
    case "task.start_date_changed": return `changed the start date${on}`;
    case "task.due_date_changed": return `changed the end date${on}`;
    case "task.description_changed": return `edited the description${on}`;
    case "subtask.created": return `added sub-task “${s(data.title)}”${on}`;
    case "subtask.deleted": return `deleted sub-task “${s(data.title)}”${on}`;
    case "subtask.restored": return `restored sub-task “${s(data.title)}”${on}`;
    case "comment.added": return `commented${on}`;
    case "resource.added": return `added resource “${s(data.name)}”`;
    case "resource.removed": return `removed resource “${s(data.name)}”`;
    case "expense.added": return `added expense “${s(data.description)}” (${s(data.amount)})`;
    case "expense.updated": return `edited expense “${s(data.description)}” (${s(data.amount)})`;
    case "expense.deleted": return `deleted expense “${s(data.description)}” (${s(data.amount)})`;
    case "expense.approved": return `approved expense “${s(data.description)}” (${s(data.amount)})`;
    case "expense.rejected": return `rejected expense “${s(data.description)}” (${s(data.amount)})${data.note ? ` — ${s(data.note)}` : ""}`;
    case "project.approval_threshold_changed": return data.to ? `set expenses above ${s(data.to)} to need approval` : "turned off expense approvals";
    case "task.made_milestone": return `made ${taskRef ?? "a task"} a milestone`;
    case "task.unmade_milestone": return `turned ${taskRef ?? "a task"} back into a normal task`;
    case "task.dependency_added": return `made ${taskRef ?? "a task"} wait on “${s(data.title)}”`;
    case "task.dependency_removed": return `removed a dependency${on}`;
    case "member.invited": return `invited ${s(data.email)} as ${s(data.role)}`;
    case "member.invitation_cancelled": return "cancelled an invitation";
    case "member.role_changed": return `changed ${s(data.email)} from ${s(data.from)} to ${s(data.to)}`;
    case "member.removed": return `removed ${s(data.email)} from the workspace`;
    case "subscription.payment_recorded": return `recorded a payment of ${s(data.amount)} ${s(data.currency)} (${s(data.method)}), active until ${s(data.coversUntil)}`;
    case "subscription.complimentary": return "gave the workspace free access";
    case "subscription.cancel": return "cancelled the subscription";
    case "subscription.pending": return "set the subscription to awaiting payment";
    default: return type;
  }
}
