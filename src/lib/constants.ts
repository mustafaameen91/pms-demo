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

export const RESOURCE_TYPES = [
  {
    value: "material",
    label: "Material",
    plural: "Materials",
    units: ["piece", "bag", "kg", "ton", "m", "m²", "m³", "litre", "box"],
    defaultUnit: "piece",
    roleLabel: null,
  },
  {
    value: "equipment",
    label: "Equipment",
    plural: "Equipment",
    units: ["day", "hour", "week", "month", "piece"],
    defaultUnit: "day",
    roleLabel: null,
  },
  {
    value: "labor",
    label: "Worker",
    plural: "Workers",
    units: ["day", "hour", "week", "month"],
    defaultUnit: "day",
    roleLabel: "Trade / role",
  },
  {
    value: "supplier",
    label: "Supplier",
    plural: "Suppliers",
    units: ["contract", "lump sum", "month", "piece"],
    defaultUnit: "contract",
    roleLabel: "Contact person",
  },
] as const;

export type ResourceType = (typeof RESOURCE_TYPES)[number]["value"];

export const resourceTypeInfo = (type: ResourceType) => RESOURCE_TYPES.find((t) => t.value === type)!;

export const EXPENSE_CATEGORIES = [
  { value: "materials", label: "Materials" },
  { value: "equipment", label: "Equipment" },
  { value: "labor", label: "Labour" },
  { value: "subcontractor", label: "Subcontractor" },
  { value: "transport", label: "Transport" },
  { value: "permits_fees", label: "Permits & fees" },
  { value: "utilities", label: "Utilities" },
  { value: "other", label: "Other" },
] as const;

export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number]["value"];

/** Default category for a payment against a resource of this type. */
export const CATEGORY_FOR_RESOURCE: Record<ResourceType, ExpenseCategory> = {
  material: "materials",
  equipment: "equipment",
  labor: "labor",
  supplier: "subcontractor",
};
