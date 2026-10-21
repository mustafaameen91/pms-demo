/** Description of an activity row for the audit log, in the viewer's language (pure). */
import { createT, type T } from "@/i18n/translate";
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
  if (type.startsWith("expense.") || type.startsWith("resource.") || type.startsWith("loan.")) return "money";
  if (type.startsWith("member.")) return "members";
  if (type.startsWith("subscription.")) return "billing";
  return "projects";
}

/** Prefix filters per group, for querying. */
export const GROUP_PREFIXES: Record<ActivityGroup, string[]> = {
  tasks: ["task.", "subtask.", "comment."],
  projects: ["project.", "share.", "risk.", "time.", "sitelog.", "company.", "document.", "document_form.", "file.", "portfolio."],
  money: ["expense.", "resource.", "loan."],
  members: ["member."],
  billing: ["subscription."],
};

const EN = createT("en", {});

/** Generated text stored in both languages (e.g. an automation rule) — pick the viewer's. */
const localized = (data: Record<string, unknown>, key: string, t: T) => s(data[`${key}_${t.locale}`] ?? data[key]);

/**
 * Sentence after the actor's name, e.g. "moved PS-3 to Done". Pass the
 * viewer's translator; English by default. "with ref" variants name the task.
 */
export function describeActivity(type: string, data: Record<string, unknown>, taskRef?: string | null, t: T = EN) {
  const ref = taskRef ?? t("a task");
  // Two phrasings: with the task named ("… on PS-3") and without.
  const on = (withRef: string, without: string, vars: Record<string, string | number> = {}) =>
    taskRef ? t(withRef, { ref: taskRef, ...vars }) : t(without, vars);
  switch (type) {
    case "project.created": return t("created the project “{name}”", { name: s(data.name) });
    case "project.updated": return t("updated project details ({fields})", { fields: (Array.isArray(data.fields) ? data.fields : []).map((f) => t(String(f))).join(t(", ")) });
    case "project.member_added": return t("added {name} to the project team", { name: s(data.name) });
    case "project.member_removed": return t("removed {name} from the project team", { name: s(data.name) });
    case "project.archived": return t("archived the project");
    case "project.restored": return t("restored the project");
    case "project.deleted": return t("deleted the project “{name}” ({key})", { name: s(data.name), key: s(data.key) });
    case "share.created": return data.showBudget ? t("created a client link (with budget)") : t("created a client link");
    case "share.revoked": return t("turned off the client link");
    case "task.created": return t("created {ref}", { ref });
    case "task.created_from_form":
      return data.requester
        ? t("request {ref} came in through “{form}” from {requester}", { ref: taskRef ?? "", form: s(data.form), requester: s(data.requester) })
        : t("request {ref} came in through “{form}”", { ref: taskRef ?? "", form: s(data.form) });
    case "form.created": return t("created the request form “{title}”", { title: s(data.title) });
    case "automation.created": return t("added an automation: {rule}", { rule: localized(data, "rule", t) });
    case "automation.updated": return t("changed an automation to: {rule}", { rule: localized(data, "rule", t) });
    case "automation.enabled": return t("turned on an automation: {rule}", { rule: localized(data, "rule", t) });
    case "automation.disabled": return t("turned off an automation: {rule}", { rule: localized(data, "rule", t) });
    case "automation.deleted": return t("deleted an automation: {rule}", { rule: localized(data, "rule", t) });
    case "task.deleted": return t("deleted task “{title}”", { title: s(data.title) });
    case "task.restored": return t("restored {ref}", { ref });
    case "task.renamed": return t("renamed {ref} to “{to}”", { ref, to: s(data.to) });
    case "task.status_changed": return t("moved {ref} to {status}", { ref, status: s(data.toName) });
    case "task.progress_changed": return on("set progress on {ref} to {to}%", "set progress to {to}%", { to: s(data.to) });
    case "task.weight_changed":
      return data.to !== null
        ? on("set weight on {ref} to {to}%", "set weight to {to}%", { to: Number(data.to) })
        : on("removed the weight on {ref}", "removed the weight");
    case "task.budget_changed":
      return data.to !== null ? on("set budget on {ref} to {to}", "set budget to {to}", { to: s(data.to) }) : on("removed the budget on {ref}", "removed the budget");
    case "task.assignee_changed": return data.to ? on("changed the assignee on {ref}", "changed the assignee") : on("removed the assignee on {ref}", "removed the assignee");
    case "task.priority_changed": return on("set priority on {ref} to {to}", "set priority to {to}", { to: t(s(data.to)) });
    case "task.start_date_changed": return on("changed the start date on {ref}", "changed the start date");
    case "task.due_date_changed": return on("changed the end date on {ref}", "changed the end date");
    case "task.description_changed": return on("edited the description on {ref}", "edited the description");
    case "subtask.created": return on("added sub-task “{title}” on {ref}", "added sub-task “{title}”", { title: s(data.title) });
    case "subtask.deleted": return on("deleted sub-task “{title}” on {ref}", "deleted sub-task “{title}”", { title: s(data.title) });
    case "subtask.restored": return on("restored sub-task “{title}” on {ref}", "restored sub-task “{title}”", { title: s(data.title) });
    case "comment.added": return on("commented on {ref}", "commented");
    case "time.logged": return t("logged {quantity} h for {date}", { quantity: s(data.quantity), date: s(data.date) });
    case "time.updated": return t("changed their hours for {date} to {quantity} h", { quantity: s(data.quantity), date: s(data.date) });
    case "time.attendance": return t("recorded attendance for {date}: {names}", { date: s(data.date), names: s(data.names) });
    case "time.approved": return t("approved {quantity} {unit} for {date}", { quantity: s(data.quantity), unit: s(data.unit), date: s(data.date) });
    case "time.rejected": return t("rejected {quantity} {unit} for {date} — {note}", { quantity: s(data.quantity), unit: s(data.unit), date: s(data.date), note: s(data.note) });
    case "time.deleted": return t("removed {quantity} {unit} of time for {date}", { quantity: s(data.quantity), unit: s(data.unit), date: s(data.date) });
    case "sitelog.saved": return t("wrote the site log for {date}", { date: s(data.date) });
    case "document.created": return t("created {kind} {number}", { kind: localized(data, "kind", t), number: s(data.number) });
    case "document.issued": return t("issued {kind} {number}", { kind: localized(data, "kind", t), number: s(data.number) });
    case "document.signed": return t("marked {kind} {number} as signed", { kind: localized(data, "kind", t), number: s(data.number) });
    case "document.cancelled": return t("cancelled {kind} {number}", { kind: localized(data, "kind", t), number: s(data.number) });
    case "document.deleted": return t("deleted draft {kind} {number}", { kind: localized(data, "kind", t), number: s(data.number) });
    case "document_form.updated": return t("changed the {kind} form", { kind: localized(data, "kind", t) });
    case "document_form.enabled": return t("turned on {kind}", { kind: localized(data, "kind", t) });
    case "document_form.disabled": return t("turned off {kind}", { kind: localized(data, "kind", t) });
    case "document_form.reset": return t("reset the {kind} form to built-in", { kind: localized(data, "kind", t) });
    case "file.uploaded": return t("uploaded the file “{name}”", { name: s(data.name) });
    case "file.version": return t("uploaded version {version} of “{name}”", { name: s(data.name), version: s(data.version) });
    case "file.deleted": return t("deleted the file “{name}”", { name: s(data.name) });
    case "portfolio.created": return t("created the portfolio “{name}”", { name: s(data.name) });
    case "portfolio.deleted": return t("deleted the portfolio “{name}”", { name: s(data.name) });
    case "portfolio.projects_changed": return t("set the projects of “{name}” ({count})", { name: s(data.name), count: s(data.count) });
    case "company.updated": return t("updated the company profile");
    case "risk.created": return t("raised risk R-{number} “{title}” (score {score})", { number: s(data.number), title: s(data.title), score: s(data.score) });
    case "risk.updated": return t("updated risk R-{number} “{title}” (score {score})", { number: s(data.number), title: s(data.title), score: s(data.score) });
    case "risk.closed": return t("closed risk R-{number} “{title}”", { number: s(data.number), title: s(data.title) });
    case "risk.reopened": return t("reopened risk R-{number} “{title}”", { number: s(data.number), title: s(data.title) });
    case "risk.deleted": return t("deleted risk R-{number} “{title}”", { number: s(data.number), title: s(data.title) });
    case "loan.created":
      return data.project
        ? t("gave {name} an advance of {amount} {currency} from {project}'s budget", { amount: s(data.amount), currency: s(data.currency), name: s(data.borrower), project: s(data.project) })
        : t("lent {amount} {currency} to {name}", { amount: s(data.amount), currency: s(data.currency), name: s(data.borrower) });
    case "loan.repayment_recorded": return t("recorded a repayment of {amount} {currency} from {name} (remaining {balance})", { amount: s(data.amount), currency: s(data.currency), name: s(data.borrower), balance: s(data.balance) });
    case "loan.repayment_deleted": return t("removed a repayment of {amount} {currency} from {name}", { amount: s(data.amount), currency: s(data.currency), name: s(data.borrower) });
    case "loan.deleted": return t("deleted a loan of {amount} {currency} to {name}", { amount: s(data.amount), currency: s(data.currency), name: s(data.borrower) });
    case "loan.requested": return t("asked for a loan of {amount} {currency}", { amount: s(data.amount), currency: s(data.currency) });
    case "loan.request_approved": return t("approved {name}'s loan request ({amount} {currency})", { name: s(data.borrower), amount: s(data.amount), currency: s(data.currency) });
    case "loan.request_rejected": return t("rejected {name}'s loan request ({amount} {currency}) — {note}", { name: s(data.borrower), amount: s(data.amount), currency: s(data.currency), note: s(data.note) });
    case "resource.added": return t("added resource “{name}”", { name: s(data.name) });
    case "resource.removed": return t("removed resource “{name}”", { name: s(data.name) });
    case "expense.added": return t("added expense “{description}” ({amount})", { description: s(data.description), amount: s(data.amount) });
    case "expense.updated": return t("edited expense “{description}” ({amount})", { description: s(data.description), amount: s(data.amount) });
    case "expense.deleted": return t("deleted expense “{description}” ({amount})", { description: s(data.description), amount: s(data.amount) });
    case "expense.approved": return t("approved expense “{description}” ({amount})", { description: s(data.description), amount: s(data.amount) });
    case "expense.rejected":
      return data.note
        ? t("rejected expense “{description}” ({amount}) — {note}", { description: s(data.description), amount: s(data.amount), note: s(data.note) })
        : t("rejected expense “{description}” ({amount})", { description: s(data.description), amount: s(data.amount) });
    case "project.approval_threshold_changed":
      return data.to ? t("set expenses above {amount} to need approval", { amount: s(data.to) }) : t("turned off expense approvals");
    case "task.recurred":
      return s(data.number) ? t("finished a repeating task; created #{number}", { number: s(data.number) }) : t("finished a repeating task; created the next one");
    case "task.recurrence_changed":
      return data.to ? t("set {ref} to repeat {rule}", { ref, rule: t(s(data.to)) }) : t("stopped {ref} repeating", { ref });
    case "task.made_milestone": return t("made {ref} a milestone", { ref });
    case "task.unmade_milestone": return t("turned {ref} back into a normal task", { ref });
    case "task.dependency_added": return t("made {ref} wait on “{title}”", { ref, title: s(data.title) });
    case "task.dependency_removed": return on("removed a dependency on {ref}", "removed a dependency");
    case "member.invited": return t("invited {email} as {role}", { email: s(data.email), role: t(s(data.role)) });
    case "member.invitation_cancelled": return t("cancelled an invitation");
    case "member.role_changed": return t("changed {email} from {from} to {to}", { email: s(data.email), from: t(s(data.from)), to: t(s(data.to)) });
    case "member.removed": return t("removed {email} from the workspace", { email: s(data.email) });
    case "subscription.payment_recorded":
      return t("recorded a payment of {amount} {currency} ({method}), active until {until}", {
        amount: s(data.amount),
        currency: s(data.currency),
        method: t(s(data.method)),
        until: s(data.coversUntil),
      });
    case "subscription.complimentary": return t("gave the workspace free access");
    case "subscription.cancel": return t("cancelled the subscription");
    case "subscription.pending": return t("set the subscription to awaiting payment");
    default: return type;
  }
}
