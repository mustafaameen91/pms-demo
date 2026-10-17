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
} from "drizzle-orm/pg-core";
import { organization, user } from "./auth";

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
    // Project manager.
    leadId: text("lead_id").references(() => user.id, { onDelete: "set null" }),
    // Incremented atomically when a task is created, to hand out task numbers.
    taskCounter: integer("task_counter").notNull().default(0),
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
    dueDate: date("due_date"),
    estimate: integer("estimate"),
    // Fractional index for drag-and-drop ordering inside a column.
    position: doublePrecision("position").notNull(),
    // Values for workspace-defined custom fields, keyed by custom_fields.id.
    customFields: jsonb("custom_fields").$type<Record<string, unknown>>().notNull().default({}),
    completedAt: timestamp("completed_at", { withTimezone: true }),
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
    readAt: timestamp("read_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index("notifications_user_idx").on(t.userId, t.readAt, t.createdAt)],
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
