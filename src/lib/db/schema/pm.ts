import { relations, sql } from "drizzle-orm";
import {
  pgTable,
  pgEnum,
  text,
  integer,
  doublePrecision,
  timestamp,
  date,
  numeric,
  jsonb,
  primaryKey,
  index,
  uniqueIndex,
  foreignKey,
  boolean,
  check,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";
import { organization, user } from "./auth";
import type { Action, Trigger } from "@/lib/automations";

// "Workspace" in the product = Better Auth "organization" in the database.
const id = () =>
  text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID());

const workspaceId = () =>
  text("workspace_id")
    .notNull()
    .references(() => organization.id, { onDelete: "cascade" });

const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .$onUpdate(() => new Date())
    .notNull(),
};

export const statusCategory = pgEnum("status_category", [
  "backlog",
  "todo",
  "in_progress",
  "done",
  "canceled",
]);

export const taskPriority = pgEnum("task_priority", [
  "none",
  "low",
  "medium",
  "high",
  "urgent",
]);

export const projectStatus = pgEnum("project_status", [
  "planning",
  "active",
  "on_hold",
  "completed",
  "cancelled",
]);

export const projects = pgTable(
  "projects",
  {
    id: id(),
    workspaceId: workspaceId(),
    name: text("name").notNull(),
    // Short prefix for task keys, e.g. "WEB" -> WEB-42
    key: text("key").notNull(),
    description: text("description"),
    color: text("color").notNull().default("#6366f1"),
    status: projectStatus("status").notNull().default("planning"),
    client: text("client"),
    startDate: date("start_date"),
    endDate: date("end_date"),
    // Planned budget; money is stored as exact decimals (returned as strings).
    budget: numeric("budget", { precision: 14, scale: 2 }),
    currency: text("currency").notNull().default("USD"),
    // Expenses above this amount (project currency) need approval; null = no approval.
    approvalThreshold: numeric("approval_threshold", { precision: 14, scale: 2 }),
    // Project manager.
    leadId: text("lead_id").references(() => user.id, { onDelete: "set null" }),
    // Incremented atomically when a task is created, to hand out task numbers.
    taskCounter: integer("task_counter").notNull().default(0),
    // A group of projects (e.g. "Baghdad branch"); at most one per project.
    portfolioId: text("portfolio_id").references((): AnyPgColumn => portfolios.id, { onDelete: "set null" }),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    createdById: text("created_by_id").references(() => user.id, { onDelete: "set null" }),
    ...timestamps,
  },
  (t) => [
    index("projects_workspace_idx").on(t.workspaceId),
    uniqueIndex("projects_workspace_key_uidx").on(t.workspaceId, t.key),
  ],
);

// Each project defines its own workflow columns; `category` keeps reporting consistent.
export const taskStatuses = pgTable(
  "task_statuses",
  {
    id: id(),
    workspaceId: workspaceId(),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    category: statusCategory("category").notNull(),
    color: text("color").notNull().default("#94a3b8"),
    position: doublePrecision("position").notNull(),
  },
  (t) => [index("task_statuses_project_idx").on(t.projectId)],
);

export const recurrence = pgEnum("recurrence", ["daily", "weekly", "monthly", "yearly"]);

export const tasks = pgTable(
  "tasks",
  {
    id: id(),
    workspaceId: workspaceId(),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    number: integer("number").notNull(),
    parentId: text("parent_id"),
    statusId: text("status_id")
      .notNull()
      .references(() => taskStatuses.id, { onDelete: "restrict" }),
    title: text("title").notNull(),
    description: text("description"),
    priority: taskPriority("priority").notNull().default("none"),
    assigneeId: text("assignee_id").references(() => user.id, { onDelete: "set null" }),
    reporterId: text("reporter_id").references(() => user.id, { onDelete: "set null" }),
    startDate: date("start_date"),
    // Shown as "End date" in the UI.
    dueDate: date("due_date"),
    estimate: integer("estimate"),
    // Share of the whole project, in percent (top-level tasks). Drives accomplishment %.
    weight: numeric("weight", { precision: 5, scale: 2 }),
    // How much of this task is done, 0–100.
    progress: integer("progress").notNull().default(0),
    // Planned budget, in the project's currency.
    budget: numeric("budget", { precision: 14, scale: 2 }),
    // Fractional index for drag-and-drop ordering inside a column.
    position: doublePrecision("position").notNull(),
    // Values for workspace-defined custom fields, keyed by custom_fields.id.
    customFields: jsonb("custom_fields").$type<Record<string, unknown>>().notNull().default({}),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    // A key date (one date = dueDate, no weight); excluded from accomplishment %.
    isMilestone: boolean("is_milestone").notNull().default(false),
    // Repeat rule; finishing the task creates the next occurrence once.
    recurrence: recurrence("recurrence"),
    recurrenceNextId: text("recurrence_next_id"),
    // Soft delete, so "Undo" can restore a deleted task.
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [
    foreignKey({ columns: [t.parentId], foreignColumns: [t.id] }).onDelete("cascade"),
    uniqueIndex("tasks_project_number_uidx").on(t.projectId, t.number),
    index("tasks_workspace_idx").on(t.workspaceId),
    index("tasks_project_status_idx").on(t.projectId, t.statusId, t.position),
    index("tasks_assignee_idx").on(t.assigneeId),
    index("tasks_parent_idx").on(t.parentId),
    index("tasks_due_idx").on(t.workspaceId, t.dueDate),
    index("tasks_search_idx").using(
      "gin",
      sql`to_tsvector('simple', ${t.title} || ' ' || coalesce(${t.description}, ''))`,
    ),
  ],
);

export const labels = pgTable(
  "labels",
  {
    id: id(),
    workspaceId: workspaceId(),
    name: text("name").notNull(),
    color: text("color").notNull().default("#64748b"),
    ...timestamps,
  },
  (t) => [uniqueIndex("labels_workspace_name_uidx").on(t.workspaceId, t.name)],
);

export const taskLabels = pgTable(
  "task_labels",
  {
    taskId: text("task_id")
      .notNull()
      .references(() => tasks.id, { onDelete: "cascade" }),
    labelId: text("label_id")
      .notNull()
      .references(() => labels.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.taskId, t.labelId] })],
);

export const customFieldType = pgEnum("custom_field_type", [
  "text",
  "number",
  "date",
  "select",
  "multi_select",
  "checkbox",
  "url",
]);

export const customFields = pgTable(
  "custom_fields",
  {
    id: id(),
    workspaceId: workspaceId(),
    // null = available in every project of the workspace
    projectId: text("project_id").references(() => projects.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    type: customFieldType("type").notNull(),
    options: jsonb("options").$type<{ id: string; label: string; color?: string }[]>(),
    position: doublePrecision("position").notNull(),
    ...timestamps,
  },
  (t) => [index("custom_fields_workspace_idx").on(t.workspaceId)],
);

export const comments = pgTable(
  "comments",
  {
    id: id(),
    workspaceId: workspaceId(),
    taskId: text("task_id")
      .notNull()
      .references(() => tasks.id, { onDelete: "cascade" }),
    authorId: text("author_id").references(() => user.id, { onDelete: "set null" }),
    body: text("body").notNull(),
    // User ids @mentioned in the body (validated workspace members).
    mentions: jsonb("mentions").$type<string[]>().notNull().default([]),
    editedAt: timestamp("edited_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [index("comments_task_idx").on(t.taskId, t.createdAt)],
);

// Append-only history. Feeds task timelines, notifications, audit logs and automations.
export const activities = pgTable(
  "activities",
  {
    id: id(),
    workspaceId: workspaceId(),
    projectId: text("project_id").references(() => projects.id, { onDelete: "cascade" }),
    taskId: text("task_id").references(() => tasks.id, { onDelete: "cascade" }),
    actorId: text("actor_id").references(() => user.id, { onDelete: "set null" }),
    // e.g. "task.created", "task.status_changed", "comment.added"
    type: text("type").notNull(),
    data: jsonb("data").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index("activities_task_idx").on(t.taskId, t.createdAt),
    index("activities_workspace_idx").on(t.workspaceId, t.createdAt),
  ],
);

export const notifications = pgTable(
  "notifications",
  {
    id: id(),
    workspaceId: workspaceId(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    activityId: text("activity_id").references(() => activities.id, { onDelete: "cascade" }),
    // "task.assigned" | "comment.mentioned" | "comment.added" | "task.late" | "project.over_budget"
    type: text("type").notNull().default("activity"),
    title: text("title").notNull().default(""),
    body: text("body"),
    // Where clicking the notification goes (app-relative path).
    link: text("link"),
    actorId: text("actor_id").references(() => user.id, { onDelete: "set null" }),
    // Same key = same notification; prevents duplicates for repeated checks (late tasks, budget).
    dedupeKey: text("dedupe_key"),
    readAt: timestamp("read_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index("notifications_user_idx").on(t.userId, t.readAt, t.createdAt),
    uniqueIndex("notifications_dedupe_uidx").on(t.userId, t.dedupeKey),
  ],
);

// --- relations ---

export const projectsRelations = relations(projects, ({ one, many }) => ({
  workspace: one(organization, { fields: [projects.workspaceId], references: [organization.id] }),
  lead: one(user, { fields: [projects.leadId], references: [user.id] }),
  statuses: many(taskStatuses),
  tasks: many(tasks),
}));

export const taskStatusesRelations = relations(taskStatuses, ({ one, many }) => ({
  project: one(projects, { fields: [taskStatuses.projectId], references: [projects.id] }),
  tasks: many(tasks),
}));

export const tasksRelations = relations(tasks, ({ one, many }) => ({
  project: one(projects, { fields: [tasks.projectId], references: [projects.id] }),
  status: one(taskStatuses, { fields: [tasks.statusId], references: [taskStatuses.id] }),
  assignee: one(user, { fields: [tasks.assigneeId], references: [user.id], relationName: "assignee" }),
  reporter: one(user, { fields: [tasks.reporterId], references: [user.id], relationName: "reporter" }),
  parent: one(tasks, { fields: [tasks.parentId], references: [tasks.id], relationName: "subtasks" }),
  subtasks: many(tasks, { relationName: "subtasks" }),
  labels: many(taskLabels),
  comments: many(comments),
  activities: many(activities),
}));

export const labelsRelations = relations(labels, ({ many }) => ({
  tasks: many(taskLabels),
}));

export const taskLabelsRelations = relations(taskLabels, ({ one }) => ({
  task: one(tasks, { fields: [taskLabels.taskId], references: [tasks.id] }),
  label: one(labels, { fields: [taskLabels.labelId], references: [labels.id] }),
}));

export const commentsRelations = relations(comments, ({ one }) => ({
  task: one(tasks, { fields: [comments.taskId], references: [tasks.id] }),
  author: one(user, { fields: [comments.authorId], references: [user.id] }),
}));

export const activitiesRelations = relations(activities, ({ one }) => ({
  task: one(tasks, { fields: [activities.taskId], references: [tasks.id] }),
  actor: one(user, { fields: [activities.actorId], references: [user.id] }),
}));

export const notificationsRelations = relations(notifications, ({ one }) => ({
  user: one(user, { fields: [notifications.userId], references: [user.id] }),
  activity: one(activities, { fields: [notifications.activityId], references: [activities.id] }),
}));

// --- Resources (Phase 5) ---

export const resourceType = pgEnum("resource_type", ["material", "equipment", "labor", "supplier"]);

// Company-wide library: a resource and its default price are defined once.
export const resources = pgTable(
  "resources",
  {
    id: id(),
    workspaceId: workspaceId(),
    type: resourceType("type").notNull(),
    name: text("name").notNull(),
    // bag, m³, day, hour, contract…
    unit: text("unit").notNull(),
    unitCost: numeric("unit_cost", { precision: 14, scale: 2 }),
    currency: text("currency").notNull().default("USD"),
    // Workers: trade ("Electrician"). Suppliers: contact person.
    role: text("role"),
    phone: text("phone"),
    notes: text("notes"),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    createdById: text("created_by_id").references(() => user.id, { onDelete: "set null" }),
    ...timestamps,
  },
  (t) => [index("resources_workspace_idx").on(t.workspaceId, t.type)],
);

// A resource used by a project (optionally for one task), with its own quantities and price.
export const projectResources = pgTable(
  "project_resources",
  {
    id: id(),
    workspaceId: workspaceId(),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    resourceId: text("resource_id")
      .notNull()
      .references(() => resources.id, { onDelete: "restrict" }),
    taskId: text("task_id").references(() => tasks.id, { onDelete: "set null" }),
    plannedQty: numeric("planned_qty", { precision: 14, scale: 2 }).notNull().default("0"),
    usedQty: numeric("used_qty", { precision: 14, scale: 2 }).notNull().default("0"),
    // Price per unit in the project's currency (copied from the library, editable).
    unitCost: numeric("unit_cost", { precision: 14, scale: 2 }).notNull().default("0"),
    // Workers on timesheets: usedQty = usedQtyBase (entered by hand before) + approved time entries.
    fromTimesheets: boolean("from_timesheets").notNull().default(false),
    usedQtyBase: numeric("used_qty_base", { precision: 14, scale: 2 }).notNull().default("0"),
    notes: text("notes"),
    ...timestamps,
  },
  (t) => [
    index("project_resources_project_idx").on(t.projectId),
    index("project_resources_resource_idx").on(t.resourceId),
    index("project_resources_task_idx").on(t.taskId),
  ],
);

export const resourcesRelations = relations(resources, ({ many }) => ({
  usages: many(projectResources),
}));

export const projectResourcesRelations = relations(projectResources, ({ one }) => ({
  project: one(projects, { fields: [projectResources.projectId], references: [projects.id] }),
  resource: one(resources, { fields: [projectResources.resourceId], references: [resources.id] }),
  task: one(tasks, { fields: [projectResources.taskId], references: [tasks.id] }),
}));

// --- Expenses (Phase 6) ---

export const approvalStatus = pgEnum("approval_status", ["approved", "pending", "rejected"]);

export const expenseCategory = pgEnum("expense_category", [
  "materials",
  "equipment",
  "labor",
  "subcontractor",
  "transport",
  "permits_fees",
  "utilities",
  "other",
]);

/**
 * Money spent on a project. When `projectResourceId` is set, the expense is a
 * PAYMENT for that resource: its cost is already counted from the resource's
 * used quantity, so it is not added to actual spending again.
 */
export const expenses = pgTable(
  "expenses",
  {
    id: id(),
    workspaceId: workspaceId(),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    taskId: text("task_id").references(() => tasks.id, { onDelete: "set null" }),
    projectResourceId: text("project_resource_id").references(() => projectResources.id, {
      onDelete: "set null",
    }),
    date: date("date").notNull(),
    amount: numeric("amount", { precision: 14, scale: 2 }).notNull(),
    category: expenseCategory("category").notNull().default("other"),
    description: text("description").notNull(),
    // Who was paid (free text when not linked to a resource).
    payee: text("payee"),
    // Receipt stored on the server's disk (see lib/uploads.ts).
    receiptPath: text("receipt_path"),
    receiptName: text("receipt_name"),
    receiptType: text("receipt_type"),
    // Bought with a cash advance (a loan with a project): counts toward settling it.
    loanId: text("loan_id").references((): AnyPgColumn => loans.id, { onDelete: "set null" }),
    // Only approved expenses count as spent (see lib/budget.ts).
    approvalStatus: approvalStatus("approval_status").notNull().default("approved"),
    decidedById: text("decided_by_id").references(() => user.id, { onDelete: "set null" }),
    decidedAt: timestamp("decided_at", { withTimezone: true }),
    decisionNote: text("decision_note"),
    createdById: text("created_by_id").references(() => user.id, { onDelete: "set null" }),
    ...timestamps,
  },
  (t) => [
    index("expenses_project_idx").on(t.projectId, t.date),
    index("expenses_task_idx").on(t.taskId),
    index("expenses_resource_idx").on(t.projectResourceId),
    index("expenses_loan_idx").on(t.loanId),
  ],
);

export const expensesRelations = relations(expenses, ({ one }) => ({
  project: one(projects, { fields: [expenses.projectId], references: [projects.id] }),
  task: one(tasks, { fields: [expenses.taskId], references: [tasks.id] }),
  projectResource: one(projectResources, {
    fields: [expenses.projectResourceId],
    references: [projectResources.id],
  }),
}));

// --- SaaS: subscriptions & manual payments (Phase 9) ---

export const subscriptionStatus = pgEnum("subscription_status", ["trial", "pending", "active", "cancelled"]);

/**
 * One per workspace. Access is allowed while status is trial/active and
 * paidUntil (if set) hasn't passed. paidUntil = null on an active workspace
 * means complimentary (no expiry).
 */
export const subscriptions = pgTable("subscriptions", {
  workspaceId: text("workspace_id")
    .primaryKey()
    .references(() => organization.id, { onDelete: "cascade" }),
  status: subscriptionStatus("status").notNull().default("pending"),
  paidUntil: date("paid_until"),
  note: text("note"),
  ...timestamps,
});

// Payments you receive outside the app (cash, bank transfer, ZainCash…), recorded by a platform admin.
export const payments = pgTable(
  "payments",
  {
    id: id(),
    workspaceId: workspaceId(),
    amount: numeric("amount", { precision: 14, scale: 2 }).notNull(),
    currency: text("currency").notNull(),
    method: text("method").notNull(),
    reference: text("reference"),
    note: text("note"),
    // The paid-until date this payment extended the workspace to.
    coversUntil: date("covers_until").notNull(),
    recordedById: text("recorded_by_id").references(() => user.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index("payments_workspace_idx").on(t.workspaceId, t.createdAt)],
);

// Platform-wide settings edited in the admin panel (single row, id = "platform").
export const platformSettings = pgTable("platform_settings", {
  id: text("id").primaryKey().default("platform"),
  price: numeric("price", { precision: 14, scale: 2 }),
  currency: text("currency").notNull().default("USD"),
  billingPeriod: text("billing_period").notNull().default("month"),
  // Shown to customers on the billing page: how to pay you.
  paymentInstructions: text("payment_instructions"),
  contact: text("contact"),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .$onUpdate(() => new Date())
    .notNull(),
});

// --- Client share links (Phase 9) ---

/** A secret read-only link a client can open without logging in. */
export const projectShares = pgTable(
  "project_shares",
  {
    id: id(),
    workspaceId: workspaceId(),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    token: text("token").notNull(),
    showBudget: boolean("show_budget").notNull().default(false),
    createdById: text("created_by_id").references(() => user.id, { onDelete: "set null" }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    lastViewedAt: timestamp("last_viewed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [uniqueIndex("project_shares_token_uidx").on(t.token), index("project_shares_project_idx").on(t.projectId)],
);

// --- Project templates saved by a workspace (Phase 10) ---

export const projectTemplates = pgTable(
  "project_templates",
  {
    id: id(),
    workspaceId: workspaceId(),
    name: text("name").notNull(),
    description: text("description"),
    // Validated with templateDataSchema (lib/templates.ts) on write and read.
    data: jsonb("data").$type<import("@/lib/templates").TemplateData>().notNull(),
    createdById: text("created_by_id").references(() => user.id, { onDelete: "set null" }),
    ...timestamps,
  },
  (t) => [index("project_templates_workspace_idx").on(t.workspaceId)],
);

// --- Dependencies (Phase 11): finish-to-start, "taskId can't start before dependsOnId is done". ---

export const taskDependencies = pgTable(
  "task_dependencies",
  {
    workspaceId: workspaceId(),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    taskId: text("task_id")
      .notNull()
      .references(() => tasks.id, { onDelete: "cascade" }),
    dependsOnId: text("depends_on_id")
      .notNull()
      .references(() => tasks.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.taskId, t.dependsOnId] }),
    index("task_dependencies_project_idx").on(t.projectId),
    index("task_dependencies_depends_on_idx").on(t.dependsOnId),
  ],
);

// --- Request forms (Phase 13): public forms that create tasks. ---

export type FormQuestion = {
  id: string;
  label: string;
  type: "text" | "textarea" | "choice";
  options?: string[];
  required: boolean;
};

export type FormConfig = {
  /** Built-in fields to ask; "subject" and "details" are always asked. */
  askName: "off" | "optional" | "required";
  askEmail: "off" | "optional" | "required";
  askPhone: "off" | "optional" | "required";
  askPriority: boolean;
  askNeededBy: boolean;
  questions: FormQuestion[];
};

export const requestForms = pgTable(
  "request_forms",
  {
    id: id(),
    workspaceId: workspaceId(),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    // Secret part of the public URL (/f/<token>).
    token: text("token").notNull(),
    title: text("title").notNull(),
    intro: text("intro"),
    config: jsonb("config").$type<FormConfig>().notNull(),
    // Where new requests land, and who gets them (both optional).
    statusId: text("status_id").references(() => taskStatuses.id, { onDelete: "set null" }),
    assigneeId: text("assignee_id").references(() => user.id, { onDelete: "set null" }),
    enabled: boolean("enabled").notNull().default(true),
    createdById: text("created_by_id").references(() => user.id, { onDelete: "set null" }),
    ...timestamps,
  },
  (t) => [uniqueIndex("request_forms_token_uidx").on(t.token), index("request_forms_project_idx").on(t.projectId)],
);

export const formSubmissions = pgTable(
  "form_submissions",
  {
    id: id(),
    workspaceId: workspaceId(),
    formId: text("form_id")
      .notNull()
      .references(() => requestForms.id, { onDelete: "cascade" }),
    taskId: text("task_id").references(() => tasks.id, { onDelete: "set null" }),
    requesterName: text("requester_name"),
    requesterEmail: text("requester_email"),
    requesterPhone: text("requester_phone"),
    // { questionId: answer } for the form's own questions.
    answers: jsonb("answers").$type<Record<string, string>>().notNull().default({}),
    // Hashed client address, only for rate limiting / abuse review.
    ipHash: text("ip_hash"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index("form_submissions_form_idx").on(t.formId, t.createdAt), index("form_submissions_task_idx").on(t.taskId)],
);

// --- Automations (Phase 15): "when … then …" rules per project. ---

export const automationRules = pgTable(
  "automation_rules",
  {
    id: id(),
    workspaceId: workspaceId(),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    // Shapes and validation live in src/lib/automations.ts.
    trigger: jsonb("trigger").$type<Trigger>().notNull(),
    action: jsonb("action").$type<Action>().notNull(),
    enabled: boolean("enabled").notNull().default(true),
    createdById: text("created_by_id").references(() => user.id, { onDelete: "set null" }),
    ...timestamps,
  },
  (t) => [index("automation_rules_project_idx").on(t.projectId)],
);

export const automationRunStatus = pgEnum("automation_run_status", ["done", "skipped", "failed"]);

export const automationRuns = pgTable(
  "automation_runs",
  {
    id: id(),
    workspaceId: workspaceId(),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    ruleId: text("rule_id")
      .notNull()
      .references(() => automationRules.id, { onDelete: "cascade" }),
    taskId: text("task_id").references(() => tasks.id, { onDelete: "set null" }),
    status: automationRunStatus("status").notNull(),
    // What happened, in words ("Moved PS-3 to Done", "Notified 2 people").
    message: text("message").notNull(),
    // Time-based rules (late tasks) run once per key.
    dedupeKey: text("dedupe_key"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index("automation_runs_project_idx").on(t.projectId, t.createdAt),
    uniqueIndex("automation_runs_dedupe_uidx").on(t.ruleId, t.dedupeKey),
  ],
);

// --- Project team (Phase 17): who can see a project. Owners/admins and the manager see every project they manage. ---

export const projectMembers = pgTable(
  "project_members",
  {
    workspaceId: workspaceId(),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [primaryKey({ columns: [t.projectId, t.userId] }), index("project_members_user_idx").on(t.userId)],
);

// --- Loans (Phase 17): the company lends money to a member or a worker, repaid freely until the balance is zero. ---

export const loanRequestStatus = pgEnum("loan_request_status", ["pending", "approved", "rejected"]);

export const loanRequests = pgTable(
  "loan_requests",
  {
    id: id(),
    workspaceId: workspaceId(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    amount: numeric("amount", { precision: 14, scale: 2 }).notNull(),
    currency: text("currency").notNull(),
    reason: text("reason").notNull(),
    status: loanRequestStatus("status").notNull().default("pending"),
    decidedById: text("decided_by_id").references(() => user.id, { onDelete: "set null" }),
    decidedAt: timestamp("decided_at", { withTimezone: true }),
    decisionNote: text("decision_note"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index("loan_requests_workspace_idx").on(t.workspaceId, t.status)],
);

export const loans = pgTable(
  "loans",
  {
    id: id(),
    workspaceId: workspaceId(),
    // Exactly one borrower: a workspace member (has an account) or a worker from the resource library.
    borrowerUserId: text("borrower_user_id").references(() => user.id, { onDelete: "restrict" }),
    borrowerResourceId: text("borrower_resource_id").references(() => resources.id, { onDelete: "restrict" }),
    amount: numeric("amount", { precision: 14, scale: 2 }).notNull(),
    currency: text("currency").notNull(),
    issuedOn: date("issued_on").notNull(),
    reason: text("reason"),
    // Set for a cash advance from a project's budget (receipts become that project's expenses).
    projectId: text("project_id").references(() => projects.id, { onDelete: "cascade" }),
    // Set when repayments (and, for advances, approved receipts) reach the amount; cleared if that changes.
    paidOffAt: timestamp("paid_off_at", { withTimezone: true }),
    requestId: text("request_id").references(() => loanRequests.id, { onDelete: "set null" }),
    createdById: text("created_by_id").references(() => user.id, { onDelete: "set null" }),
    ...timestamps,
  },
  (t) => [
    index("loans_workspace_idx").on(t.workspaceId, t.issuedOn),
    index("loans_borrower_user_idx").on(t.borrowerUserId),
    index("loans_borrower_resource_idx").on(t.borrowerResourceId),
    index("loans_project_idx").on(t.projectId),
  ],
);

export const loanRepayments = pgTable(
  "loan_repayments",
  {
    id: id(),
    workspaceId: workspaceId(),
    loanId: text("loan_id")
      .notNull()
      .references(() => loans.id, { onDelete: "cascade" }),
    amount: numeric("amount", { precision: 14, scale: 2 }).notNull(),
    paidOn: date("paid_on").notNull(),
    // "cash" | "bank_transfer" | "salary_deduction" | "other"
    method: text("method").notNull(),
    note: text("note"),
    recordedById: text("recorded_by_id").references(() => user.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index("loan_repayments_loan_idx").on(t.loanId, t.paidOn)],
);

/**
 * Risk register: things that could go wrong on a project, scored likelihood × impact (1–5 each).
 * Numbered per project (R-1, R-2…).
 */
export const projectRisks = pgTable(
  "project_risks",
  {
    id: id(),
    workspaceId: workspaceId(),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    number: integer("number").notNull(),
    title: text("title").notNull(),
    description: text("description"),
    // See RISK_CATEGORIES in lib/risks.ts.
    category: text("category").notNull().default("other"),
    likelihood: integer("likelihood").notNull(),
    impact: integer("impact").notNull(),
    // What we'll do to make it less likely or less harmful.
    mitigation: text("mitigation"),
    // "open" | "watching" | "closed"
    status: text("status").notNull().default("open"),
    ownerId: text("owner_id").references(() => user.id, { onDelete: "set null" }),
    taskId: text("task_id").references(() => tasks.id, { onDelete: "set null" }),
    closedAt: timestamp("closed_at", { withTimezone: true }),
    createdById: text("created_by_id").references(() => user.id, { onDelete: "set null" }),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("project_risks_number_uidx").on(t.projectId, t.number),
    index("project_risks_project_idx").on(t.projectId, t.status),
    index("project_risks_owner_idx").on(t.ownerId),
  ],
);

/**
 * Time on a project, per person per day: a member's own hours, or a worker's
 * attendance (in the worker's unit, e.g. days) recorded by a manager.
 * Workers' approved entries fill in their project resource's used quantity.
 */
export const timeEntries = pgTable(
  "time_entries",
  {
    id: id(),
    workspaceId: workspaceId(),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    date: date("date").notNull(),
    // Exactly one of: a member (has an account) or a worker from the resource library.
    userId: text("user_id").references(() => user.id, { onDelete: "cascade" }),
    resourceId: text("resource_id").references(() => resources.id, { onDelete: "restrict" }),
    // For workers: the project resource row whose used quantity this counts toward.
    projectResourceId: text("project_resource_id").references(() => projectResources.id, { onDelete: "set null" }),
    taskId: text("task_id").references(() => tasks.id, { onDelete: "set null" }),
    quantity: numeric("quantity", { precision: 8, scale: 2 }).notNull(),
    // "hour" for members; the worker's unit ("day", "hour"…) for workers.
    unit: text("unit").notNull(),
    note: text("note"),
    status: approvalStatus("status").notNull().default("approved"),
    decidedById: text("decided_by_id").references(() => user.id, { onDelete: "set null" }),
    decidedAt: timestamp("decided_at", { withTimezone: true }),
    decisionNote: text("decision_note"),
    createdById: text("created_by_id").references(() => user.id, { onDelete: "set null" }),
    ...timestamps,
  },
  (t) => [
    index("time_entries_project_date_idx").on(t.projectId, t.date),
    index("time_entries_user_idx").on(t.userId, t.date),
    index("time_entries_resource_idx").on(t.resourceId),
    index("time_entries_usage_idx").on(t.projectResourceId),
    check("time_entries_one_person", sql`(${t.userId} is null) <> (${t.resourceId} is null)`),
    check("time_entries_quantity_positive", sql`${t.quantity} > 0`),
  ],
);

/** One diary page per project per day: weather, deliveries, problems, notes. */
export const siteLogs = pgTable(
  "site_logs",
  {
    id: id(),
    workspaceId: workspaceId(),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    date: date("date").notNull(),
    // See WEATHER in lib/timesheets.ts.
    weather: text("weather"),
    temperature: integer("temperature"),
    deliveries: text("deliveries"),
    problems: text("problems"),
    notes: text("notes"),
    createdById: text("created_by_id").references(() => user.id, { onDelete: "set null" }),
    updatedById: text("updated_by_id").references(() => user.id, { onDelete: "set null" }),
    ...timestamps,
  },
  (t) => [uniqueIndex("site_logs_project_date_uidx").on(t.projectId, t.date)],
);

/**
 * The buying company's letterhead: what every document it prints shows.
 * One row per workspace; missing = defaults (workspace name, teal, Classic).
 */
export const companyProfiles = pgTable("company_profiles", {
  workspaceId: text("workspace_id")
    .primaryKey()
    .references(() => organization.id, { onDelete: "cascade" }),
  nameEn: text("name_en"),
  nameAr: text("name_ar"),
  addressEn: text("address_en"),
  addressAr: text("address_ar"),
  phone: text("phone"),
  email: text("email"),
  website: text("website"),
  registrationNo: text("registration_no"),
  taxNo: text("tax_no"),
  footerEn: text("footer_en"),
  footerAr: text("footer_ar"),
  brandColor: text("brand_color").notNull().default("#0D9488"),
  logoPath: text("logo_path"),
  logoType: text("logo_type"),
  stampPath: text("stamp_path"),
  stampType: text("stamp_type"),
  // "classic" | "modern" | "minimal" — see PAPER_STYLES in lib/documents.
  defaultStyle: text("default_style").notNull().default("classic"),
  // Language new documents are written in.
  defaultLanguage: text("default_language").notNull().default("ar"),
  updatedById: text("updated_by_id").references(() => user.id, { onDelete: "set null" }),
  ...timestamps,
});

/**
 * A document made from a project on the company's letterhead (contract,
 * purchase order, voucher…). Field values live in `data`, line items in `items`;
 * numbered per company per type (PO-0001…).
 */
export const documents = pgTable(
  "documents",
  {
    id: id(),
    workspaceId: workspaceId(),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    // See DOC_TYPES in lib/documents/types.ts.
    type: text("type").notNull(),
    number: integer("number").notNull(),
    // "draft" | "issued" | "signed" | "cancelled"
    status: text("status").notNull().default("draft"),
    language: text("language").notNull().default("ar"),
    style: text("style").notNull().default("classic"),
    date: date("date").notNull(),
    currency: text("currency").notNull(),
    data: jsonb("data").$type<Record<string, string>>().notNull().default({}),
    items: jsonb("items").$type<{ description: string; unit: string; quantity: string; unitPrice: string; condition?: string }[]>().notNull().default([]),
    taxRate: numeric("tax_rate", { precision: 5, scale: 2 }),
    // The form as the company had it set up when this document was made (labels,
    // fields, prefix…), so later changes to the form never alter a sent document.
    layout: jsonb("layout").$type<Record<string, unknown>>(),
    issuedAt: timestamp("issued_at", { withTimezone: true }),
    createdById: text("created_by_id").references(() => user.id, { onDelete: "set null" }),
    updatedById: text("updated_by_id").references(() => user.id, { onDelete: "set null" }),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("documents_number_uidx").on(t.workspaceId, t.type, t.number),
    index("documents_project_idx").on(t.projectId, t.createdAt),
  ],
);

/**
 * How one company has adjusted a built-in document type: on/off, title, number
 * prefix, renamed / hidden fields, its own extra fields, default wording,
 * signature box names. See lib/documents/customize.ts.
 */
export const documentTypeSettings = pgTable(
  "document_type_settings",
  {
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    type: text("type").notNull(),
    enabled: boolean("enabled").notNull().default(true),
    settings: jsonb("settings").$type<Record<string, unknown>>().notNull().default({}),
    updatedById: text("updated_by_id").references(() => user.id, { onDelete: "set null" }),
    ...timestamps,
  },
  (t) => [primaryKey({ columns: [t.workspaceId, t.type] })],
);

/**
 * A file kept on a project (drawing, signed contract scan, permit, photo…).
 * Each upload of a new version is kept in project_file_versions.
 */
export const projectFiles = pgTable(
  "project_files",
  {
    id: id(),
    workspaceId: workspaceId(),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    taskId: text("task_id").references(() => tasks.id, { onDelete: "set null" }),
    name: text("name").notNull(),
    // See FILE_CATEGORIES in lib/files.ts.
    category: text("category").notNull().default("other"),
    description: text("description"),
    currentVersion: integer("current_version").notNull().default(1),
    createdById: text("created_by_id").references(() => user.id, { onDelete: "set null" }),
    ...timestamps,
  },
  (t) => [index("project_files_project_idx").on(t.projectId, t.category), index("project_files_task_idx").on(t.taskId)],
);

export const projectFileVersions = pgTable(
  "project_file_versions",
  {
    id: id(),
    workspaceId: workspaceId(),
    fileId: text("file_id")
      .notNull()
      .references(() => projectFiles.id, { onDelete: "cascade" }),
    version: integer("version").notNull(),
    // Stored on the server's disk (see lib/uploads.ts).
    path: text("path").notNull(),
    originalName: text("original_name").notNull(),
    mime: text("mime").notNull(),
    size: integer("size").notNull(),
    note: text("note"),
    uploadedById: text("uploaded_by_id").references(() => user.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [uniqueIndex("project_file_versions_uidx").on(t.fileId, t.version)],
);

/** A named group of projects whose numbers are added up together. */
export const portfolios = pgTable(
  "portfolios",
  {
    id: id(),
    workspaceId: workspaceId(),
    name: text("name").notNull(),
    description: text("description"),
    color: text("color").notNull().default("#0D9488"),
    createdById: text("created_by_id").references(() => user.id, { onDelete: "set null" }),
    ...timestamps,
  },
  (t) => [index("portfolios_workspace_idx").on(t.workspaceId)],
);

/**
 * A company's weekly report: a snapshot of every active project for one week
 * (Saturday–Friday), so past weeks can be read back and compared.
 */
export const weeklyReports = pgTable(
  "weekly_reports",
  {
    id: id(),
    workspaceId: workspaceId(),
    weekStart: date("week_start").notNull(),
    data: jsonb("data").$type<Record<string, unknown>>().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [uniqueIndex("weekly_reports_week_uidx").on(t.workspaceId, t.weekStart)],
);
