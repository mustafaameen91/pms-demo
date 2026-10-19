import { z } from "zod";

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
      }),
    )
    .max(200),
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

type T = TemplateData["tasks"][number];
const t = (title: string, weight: number, startOffset: number, duration: number, subtasks?: string[]): T => ({
  title,
  weight,
  startOffset,
  duration,
  ...(subtasks && { subtasks }),
});

export const BUILTIN_TEMPLATES: BuiltinTemplate[] = [
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
        t("Design & drawings", 8, 0, 20, ["Architectural drawings", "Structural design", "MEP design"]),
        t("Permits & approvals", 5, 15, 25, ["Building permit", "Utility approvals"]),
        t("Site preparation", 7, 40, 10, ["Survey & setting out", "Excavation"]),
        t("Foundation", 15, 50, 25, ["Footings", "Ground slab"]),
        t("Structure / frame", 20, 75, 45, ["Columns & beams", "Slabs", "Masonry walls"]),
        t("MEP rough-in", 12, 115, 30, ["Electrical", "Plumbing", "HVAC"]),
        t("Finishes", 18, 140, 40, ["Plastering", "Flooring", "Painting", "Doors & windows"]),
        t("Inspection & snagging", 5, 180, 10),
        t("Handover", 10, 190, 5, ["As-built documents", "Keys & warranties"]),
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
        t("Site survey & measurements", 5, 0, 5),
        t("Design & approvals", 10, 5, 15, ["Layout plan", "Material selection", "Client approval"]),
        t("Demolition & strip-out", 10, 20, 7),
        t("Electrical & plumbing", 20, 27, 15),
        t("Partitions & ceilings", 15, 35, 12),
        t("Flooring & painting", 20, 45, 12),
        t("Furniture & fixtures", 15, 55, 8),
        t("Snagging & handover", 5, 63, 5),
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
        t("Brief & goals", 10, 0, 3, ["Objectives & KPIs", "Budget"]),
        t("Audience & messaging", 10, 3, 4),
        t("Creative production", 30, 7, 10, ["Copy", "Design", "Video"]),
        t("Approvals", 10, 17, 3),
        t("Launch", 15, 20, 2, ["Schedule posts / ads", "Email send"]),
        t("Optimise", 15, 22, 14),
        t("Results report", 10, 36, 3),
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
        t("Requirements", 15, 0, 10, ["Stakeholder interviews", "Requirements sign-off"]),
        t("Solution design", 10, 10, 7),
        t("Build & configure", 30, 17, 20),
        t("Testing", 20, 37, 10, ["Test plan", "User acceptance testing"]),
        t("Training", 10, 47, 5),
        t("Go-live", 10, 52, 2, ["Data migration", "Cut-over"]),
        t("Hypercare", 5, 54, 10),
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
        t("Concept & budget", 10, 0, 5),
        t("Venue & suppliers", 20, 5, 15, ["Venue", "Catering", "Sound & lighting", "Decoration"]),
        t("Program & speakers", 15, 10, 15),
        t("Marketing & invitations", 15, 15, 20),
        t("Logistics", 15, 30, 10, ["Transport", "Accommodation", "Run sheet"]),
        t("Event day", 15, 40, 1),
        t("Wrap-up & payments", 10, 41, 5),
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
        t("Kick-off", 5, 0, 2),
        t("Discovery", 20, 2, 10, ["Interviews", "Data collection"]),
        t("Analysis", 25, 12, 12),
        t("Recommendations", 20, 24, 8),
        t("Client presentation", 10, 32, 2),
        t("Implementation support", 15, 34, 20),
        t("Close-out", 5, 54, 3),
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
        t("Research", 10, 0, 10),
        t("Requirements", 10, 10, 7),
        t("Design", 15, 17, 14),
        t("Development", 30, 31, 30),
        t("Quality assurance", 15, 55, 10),
        t("Launch", 10, 65, 3, ["Launch announcement", "Sales training"]),
        t("Post-launch review", 10, 68, 7),
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
        t("Order intake & planning", 5, 0, 2),
        t("Materials procurement", 20, 2, 10),
        t("Production setup", 10, 12, 3),
        t("Production", 40, 15, 20),
        t("Quality control", 15, 35, 4),
        t("Packing & delivery", 10, 39, 4),
      ],
    },
  },
];

export const builtinTemplate = (id: string) => BUILTIN_TEMPLATES.find((tpl) => tpl.id === id);

/** Total planned length of a template, in days (for "≈ 3 months"). */
export function templateLengthDays(data: TemplateData) {
  return data.tasks.reduce((max, task) => Math.max(max, (task.startOffset ?? 0) + (task.duration ?? 0)), 0);
}

export function describeLength(days: number) {
  if (days <= 0) return "No schedule";
  if (days < 14) return `${days} days`;
  if (days < 60) return `≈ ${Math.round(days / 7)} weeks`;
  return `≈ ${Math.round(days / 30)} months`;
}

/** Adds whole days to a YYYY-MM-DD date. */
export function addDays(iso: string, days: number) {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}
