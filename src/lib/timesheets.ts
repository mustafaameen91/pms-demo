/** Timesheet and site-log rules (pure). Dates are "YYYY-MM-DD". */

/** Weeks start on Saturday (the work week in Iraq). 0 = Sunday … 6 = Saturday. */
export const WEEK_START_DAY = 6;

export const WEATHER = [
  { value: "sunny", label: "Sunny" },
  { value: "cloudy", label: "Cloudy" },
  { value: "rain", label: "Rain" },
  { value: "wind", label: "Windy" },
  { value: "dust", label: "Dust storm" },
  { value: "hot", label: "Very hot" },
  { value: "cold", label: "Cold" },
] as const;
export type Weather = (typeof WEATHER)[number]["value"];

const toUTC = (iso: string) => {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
};
const toISO = (d: Date) => d.toISOString().slice(0, 10);

export function addDays(iso: string, days: number) {
  const d = toUTC(iso);
  d.setUTCDate(d.getUTCDate() + days);
  return toISO(d);
}

/** The Saturday on or before this date. */
export function weekStartOf(iso: string) {
  const day = toUTC(iso).getUTCDay();
  return addDays(iso, -((day - WEEK_START_DAY + 7) % 7));
}

/** The 7 dates of the week starting on `start`. */
export const weekDays = (start: string) => Array.from({ length: 7 }, (_, i) => addDays(start, i));

export const isISODate = (v: unknown): v is string =>
  typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(toUTC(v).getTime()) && toISO(toUTC(v)) === v;

type GridEntry = {
  date: string;
  personKey: string;
  personName: string;
  kind: "member" | "worker";
  quantity: string | number;
  unit: string;
  status: string;
};

export type WeekRow = {
  personKey: string;
  personName: string;
  kind: "member" | "worker";
  /** Each day's total per unit (a worker might be logged in days, a member in hours). */
  days: Record<string, { quantity: number; unit: string; pending: boolean }[]>;
  totals: { quantity: number; unit: string }[];
};

const round2 = (v: number) => Math.round(v * 100) / 100;

function addTo(list: { quantity: number; unit: string }[], quantity: number, unit: string) {
  const hit = list.find((x) => x.unit === unit);
  if (hit) hit.quantity = round2(hit.quantity + quantity);
  else list.push({ quantity: round2(quantity), unit });
}

/**
 * One row per person for the week: members first, then workers, by name.
 * Rejected entries are left out; pending ones are counted but flagged.
 */
export function buildWeek(entries: GridEntry[], start: string): WeekRow[] {
  const days = new Set(weekDays(start));
  const rows = new Map<string, WeekRow>();
  for (const e of entries) {
    if (e.status === "rejected" || !days.has(e.date)) continue;
    const row =
      rows.get(e.personKey) ??
      ({ personKey: e.personKey, personName: e.personName, kind: e.kind, days: {}, totals: [] } satisfies WeekRow);
    rows.set(e.personKey, row);
    const q = Number(e.quantity);
    const cell = (row.days[e.date] ??= []);
    const hit = cell.find((c) => c.unit === e.unit);
    if (hit) {
      hit.quantity = round2(hit.quantity + q);
      hit.pending ||= e.status === "pending";
    } else cell.push({ quantity: round2(q), unit: e.unit, pending: e.status === "pending" });
    addTo(row.totals, q, e.unit);
  }
  return [...rows.values()].sort(
    (a, b) => (a.kind === b.kind ? a.personName.localeCompare(b.personName) : a.kind === "member" ? -1 : 1),
  );
}

/** Approved totals per task (null = whole project), per unit. */
export function totalsByTask(entries: { taskId: string | null; quantity: string | number; unit: string; status: string }[]) {
  const map = new Map<string | null, { quantity: number; unit: string }[]>();
  for (const e of entries) {
    if (e.status !== "approved") continue;
    const list = map.get(e.taskId) ?? [];
    addTo(list, Number(e.quantity), e.unit);
    map.set(e.taskId, list);
  }
  return map;
}

/** A worker's used quantity on a project: what was entered by hand before + approved attendance. */
export function usedFromTimesheets(base: string | number, entries: { quantity: string | number; status: string }[]) {
  return round2(Number(base) + entries.filter((e) => e.status === "approved").reduce((s, e) => s + Number(e.quantity), 0));
}

/** Sensible default amount for one day's attendance in a worker's unit. */
export function defaultQuantity(unit: string) {
  return unit === "hour" ? 8 : 1;
}
