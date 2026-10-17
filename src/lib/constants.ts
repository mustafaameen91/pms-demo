export const PRIORITIES = [
  { value: "none", label: "No priority" },
  { value: "low", label: "Low" },
  { value: "medium", label: "Medium" },
  { value: "high", label: "High" },
  { value: "urgent", label: "Urgent" },
] as const;

export type Priority = (typeof PRIORITIES)[number]["value"];

export const PROJECT_COLORS = [
  "#0d9488",
  "#2563eb",
  "#7c3aed",
  "#db2777",
  "#ea580c",
  "#ca8a04",
  "#16a34a",
  "#475569",
] as const;

// New projects start with this workflow; editable per project later.
export const DEFAULT_STATUSES = [
  { name: "Backlog", category: "backlog", color: "#94a3b8" },
  { name: "To do", category: "todo", color: "#64748b" },
  { name: "In progress", category: "in_progress", color: "#d97706" },
  { name: "In review", category: "in_progress", color: "#7c3aed" },
  { name: "Done", category: "done", color: "#16a34a" },
] as const;

export const POSITION_STEP = 1024;

export const PROJECT_STATUSES = [
  { value: "planning", label: "Planning", color: "#64748b" },
  { value: "active", label: "Active", color: "#0d9488" },
  { value: "on_hold", label: "On hold", color: "#d97706" },
  { value: "completed", label: "Completed", color: "#16a34a" },
  { value: "cancelled", label: "Cancelled", color: "#dc2626" },
] as const;

export type ProjectStatus = (typeof PROJECT_STATUSES)[number]["value"];

export const CURRENCIES = [
  "USD",
  "EUR",
  "GBP",
  "IQD",
  "SAR",
  "AED",
  "KWD",
  "QAR",
  "JOD",
  "EGP",
  "TRY",
] as const;
