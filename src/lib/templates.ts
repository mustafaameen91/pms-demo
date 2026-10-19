import { z } from "zod";
import { createT, type T } from "@/i18n/translate";

const EN = createT("en", {});

/**
 * Project templates: a workflow (statuses) plus weighted main tasks with
 * planned timing relative to the project start. Built-ins live here; workspaces
 * can save their own (stored as JSON in project_templates.data).
 */

const categories = ["backlog", "todo", "in_progress", "done", "canceled"] as const;

export const templateDataSchema = z.object({
  statuses: z
    .array(
      z.object({
        name: z.string().trim().min(1).max(40),
        category: z.enum(categories),
        color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
      }),
    )
    .min(1)
    .max(12),
  tasks: z
    .array(
      z.object({
        title: z.string().trim().min(1).max(300),
        description: z.string().max(5000).optional(),
        weight: z.number().min(0).max(100).optional(),
        /** Days after the project start. */
        startOffset: z.number().int().min(0).max(3650).optional(),
        /** Length in days (≥ 1). */
        duration: z.number().int().min(1).max(3650).optional(),
        subtasks: z.array(z.string().trim().min(1).max(300)).max(50).optional(),
        milestone: z.boolean().optional(),
        /** Indexes (in this list) of tasks that must finish first. */
        dependsOn: z.array(z.number().int().min(0)).max(50).optional(),
      }),
    )
    .max(200)
    .refine(
      (tasks) => tasks.every((t, i) => (t.dependsOn ?? []).every((d) => d < tasks.length && d !== i)),
      "Dependencies must point to other tasks in the template",
    ),
});

export type TemplateData = z.infer<typeof templateDataSchema>;

export type BuiltinTemplate = {
  id: string;
  name: string;
  field: string;
  description: string;
  icon: "building" | "hammer" | "megaphone" | "server" | "party" | "briefcase" | "rocket" | "factory";
  data: TemplateData;
};

const S = {
  notStarted: { name: "Not started", category: "backlog", color: "#94a3b8" },
  todo: { name: "To do", category: "todo", color: "#64748b" },
  progress: { name: "In progress", category: "in_progress", color: "#d97706" },
  review: { name: "In review", category: "in_progress", color: "#7c3aed" },
  done: { name: "Done", category: "done", color: "#16a34a" },
} as const;

type TemplateTask = TemplateData["tasks"][number];
const task = (title: string, weight: number, startOffset: number, duration: number, subtasks?: string[]): TemplateTask => ({
  title,
  weight,
  startOffset,
  duration,
  ...(subtasks && { subtasks }),
});

/**
 * Finish-to-start chain from timing: each task waits on the latest earlier task
 * that ends before it starts. Never creates loops or date conflicts.
 */
export function deriveDependencies(data: TemplateData): TemplateData {
  return {
    ...data,
    tasks: data.tasks.map((task, i) => {
      if (task.dependsOn || task.startOffset === undefined) return task;
      let best = -1;
      let bestEnd = -1;
      for (let j = 0; j < i; j++) {
        const other = data.tasks[j];
        if (other.startOffset === undefined || !other.duration) continue;
        const end = other.startOffset + other.duration; // first free day
        if (end <= task.startOffset && end > bestEnd) {
          best = j;
          bestEnd = end;
        }
      }
      return best >= 0 ? { ...task, dependsOn: [best] } : task;
    }),
  };
}

const BUILTIN_SOURCE: BuiltinTemplate[] = [
  {
    id: "construction",
    name: "Building construction",
    field: "Construction",
    icon: "building",
    description: "From design and permits to structure, finishes and handover.",
    data: {
      statuses: [
        S.notStarted,
        { name: "Planning", category: "todo", color: "#64748b" },
        { name: "Execution", category: "in_progress", color: "#d97706" },
        { name: "Inspection", category: "in_progress", color: "#7c3aed" },
        S.done,
      ],
      tasks: [
        task("Design & drawings", 8, 0, 20, ["Architectural drawings", "Structural design", "MEP design"]),
        task("Permits & approvals", 5, 15, 25, ["Building permit", "Utility approvals"]),
        task("Site preparation", 7, 40, 10, ["Survey & setting out", "Excavation"]),
        task("Foundation", 15, 50, 25, ["Footings", "Ground slab"]),
        task("Structure / frame", 20, 75, 45, ["Columns & beams", "Slabs", "Masonry walls"]),
        task("MEP rough-in", 12, 115, 30, ["Electrical", "Plumbing", "HVAC"]),
        task("Finishes", 18, 140, 40, ["Plastering", "Flooring", "Painting", "Doors & windows"]),
        task("Inspection & snagging", 5, 180, 10),
        task("Handover", 10, 190, 5, ["As-built documents", "Keys & warranties"]),
      ],
    },
  },
  {
    id: "renovation",
    name: "Renovation / office fit-out",
    field: "Construction",
    icon: "hammer",
    description: "Survey, demolition, services, finishes and furniture for an existing space.",
    data: {
      statuses: [S.todo, S.progress, { name: "Snagging", category: "in_progress", color: "#7c3aed" }, S.done],
      tasks: [
        task("Site survey & measurements", 5, 0, 5),
        task("Design & approvals", 10, 5, 15, ["Layout plan", "Material selection", "Client approval"]),
        task("Demolition & strip-out", 10, 20, 7),
        task("Electrical & plumbing", 20, 27, 15),
        task("Partitions & ceilings", 15, 35, 12),
        task("Flooring & painting", 20, 45, 12),
        task("Furniture & fixtures", 15, 55, 8),
        task("Snagging & handover", 5, 63, 5),
      ],
    },
  },
  {
    id: "marketing-campaign",
    name: "Marketing campaign",
    field: "Marketing",
    icon: "megaphone",
    description: "Brief, creative, approvals, launch and results.",
    data: {
      statuses: [
        { name: "Brief", category: "todo", color: "#64748b" },
        { name: "Creative", category: "in_progress", color: "#d97706" },
        { name: "Review", category: "in_progress", color: "#7c3aed" },
        { name: "Live", category: "in_progress", color: "#0d9488" },
        S.done,
      ],
      tasks: [
        task("Brief & goals", 10, 0, 3, ["Objectives & KPIs", "Budget"]),
        task("Audience & messaging", 10, 3, 4),
        task("Creative production", 30, 7, 10, ["Copy", "Design", "Video"]),
        task("Approvals", 10, 17, 3),
        task("Launch", 15, 20, 2, ["Schedule posts / ads", "Email send"]),
        task("Optimise", 15, 22, 14),
        task("Results report", 10, 36, 3),
      ],
    },
  },
  {
    id: "it-rollout",
    name: "IT system rollout",
    field: "IT",
    icon: "server",
    description: "Requirements, configuration, testing, training and go-live.",
    data: {
      statuses: [S.notStarted, S.todo, S.progress, { name: "Testing", category: "in_progress", color: "#7c3aed" }, S.done],
      tasks: [
        task("Requirements", 15, 0, 10, ["Stakeholder interviews", "Requirements sign-off"]),
        task("Solution design", 10, 10, 7),
        task("Build & configure", 30, 17, 20),
        task("Testing", 20, 37, 10, ["Test plan", "User acceptance testing"]),
        task("Training", 10, 47, 5),
        task("Go-live", 10, 52, 2, ["Data migration", "Cut-over"]),
        task("Hypercare", 5, 54, 10),
      ],
    },
  },
  {
    id: "event",
    name: "Event",
    field: "Events",
    icon: "party",
    description: "Conference, launch party or wedding: venue, suppliers, guests and the big day.",
    data: {
      statuses: [S.todo, S.progress, { name: "Confirmed", category: "in_progress", color: "#0d9488" }, S.done],
      tasks: [
        task("Concept & budget", 10, 0, 5),
        task("Venue & suppliers", 20, 5, 15, ["Venue", "Catering", "Sound & lighting", "Decoration"]),
        task("Program & speakers", 15, 10, 15),
        task("Marketing & invitations", 15, 15, 20),
        task("Logistics", 15, 30, 10, ["Transport", "Accommodation", "Run sheet"]),
        task("Event day", 15, 40, 1),
        task("Wrap-up & payments", 10, 41, 5),
      ],
    },
  },
  {
    id: "consulting",
    name: "Client consulting project",
    field: "Professional services",
    icon: "briefcase",
    description: "Kick-off, discovery, analysis, recommendations and delivery to a client.",
    data: {
      statuses: [S.todo, S.progress, { name: "Client review", category: "in_progress", color: "#7c3aed" }, S.done],
      tasks: [
        task("Kick-off", 5, 0, 2),
        task("Discovery", 20, 2, 10, ["Interviews", "Data collection"]),
        task("Analysis", 25, 12, 12),
        task("Recommendations", 20, 24, 8),
        task("Client presentation", 10, 32, 2),
        task("Implementation support", 15, 34, 20),
        task("Close-out", 5, 54, 3),
      ],
    },
  },
  {
    id: "product-launch",
    name: "Product launch",
    field: "Product",
    icon: "rocket",
    description: "Research, design, build, test and launch a product or feature.",
    data: {
      statuses: [S.notStarted, S.todo, S.progress, S.review, S.done],
      tasks: [
        task("Research", 10, 0, 10),
        task("Requirements", 10, 10, 7),
        task("Design", 15, 17, 14),
        task("Development", 30, 31, 30),
        task("Quality assurance", 15, 55, 10),
        task("Launch", 10, 65, 3, ["Launch announcement", "Sales training"]),
        task("Post-launch review", 10, 68, 7),
      ],
    },
  },
  {
    id: "production-run",
    name: "Production order",
    field: "Manufacturing",
    icon: "factory",
    description: "From customer order and materials to production, QC and delivery.",
    data: {
      statuses: [S.todo, S.progress, { name: "Quality check", category: "in_progress", color: "#7c3aed" }, S.done],
      tasks: [
        task("Order intake & planning", 5, 0, 2),
        task("Materials procurement", 20, 2, 10),
        task("Production setup", 10, 12, 3),
        task("Production", 40, 15, 20),
        task("Quality control", 15, 35, 4),
        task("Packing & delivery", 10, 39, 4),
      ],
    },
  },
];

export const BUILTIN_TEMPLATES: BuiltinTemplate[] = BUILTIN_SOURCE.map((tpl) => ({
  ...tpl,
  data: deriveDependencies(tpl.data),
}));

export const builtinTemplate = (id: string) => BUILTIN_TEMPLATES.find((tpl) => tpl.id === id);

/**
 * A built-in template in the reader's language: name, field, description,
 * workflow (column) names, task and sub-task titles. Use it for display and
 * when creating a project from a built-in template. The Arabic lives in
 * src/i18n/ar/projects.ts.
 */
export function localizeBuiltinTemplate(tpl: BuiltinTemplate, t: T): BuiltinTemplate {
  // "Copy|template" lets a word mean something else here than on a button ("Copy" = copywriting).
  const word = (text: string) => {
    const key = `${text}|template`;
    const hit = t(key);
    return hit === key ? t(text) : hit;
  };
  return {
    ...tpl,
    name: word(tpl.name),
    field: word(tpl.field),
    description: word(tpl.description),
    data: {
      ...tpl.data,
      statuses: tpl.data.statuses.map((s) => ({ ...s, name: word(s.name) })),
      tasks: tpl.data.tasks.map((item) => ({
        ...item,
        title: word(item.title),
        ...(item.description !== undefined && { description: word(item.description) }),
        ...(item.subtasks && { subtasks: item.subtasks.map(word) }),
      })),
    },
  };
}

/** Total planned length of a template, in days (for "≈ 3 months"). */
export function templateLengthDays(data: TemplateData) {
  return data.tasks.reduce((max, task) => Math.max(max, (task.startOffset ?? 0) + (task.duration ?? 0)), 0);
}

export function describeLength(days: number, t: T = EN) {
  if (days <= 0) return t("No schedule");
  if (days < 14) return t.plural(days, "{count} days", "{count} days");
  if (days < 60) return t.plural(Math.round(days / 7), "≈ {count} weeks", "≈ {count} weeks");
  return t.plural(Math.round(days / 30), "≈ {count} months", "≈ {count} months");
}

/** Adds whole days to a YYYY-MM-DD date. */
export function addDays(iso: string, days: number) {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}
