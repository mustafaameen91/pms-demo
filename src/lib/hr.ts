/** HR rules (pure; shared by server, client and tests). Phase 28. */
import { daysBetween } from "@/lib/schedule";

export const EMPLOYMENT_TYPES = [
  { value: "full_time", label: "Full time" },
  { value: "part_time", label: "Part time" },
  { value: "contract", label: "Fixed-term contract" },
  { value: "temporary", label: "Temporary / seasonal" },
  { value: "daily", label: "Daily worker" },
  { value: "intern", label: "Intern / trainee" },
] as const;
export type EmploymentType = (typeof EMPLOYMENT_TYPES)[number]["value"];

export const PAY_BASES = [
  { value: "monthly", label: "Monthly", per: "per month" },
  { value: "daily", label: "Daily", per: "per day" },
  { value: "hourly", label: "Hourly", per: "per hour" },
] as const;
export type PayBasis = (typeof PAY_BASES)[number]["value"];

export const GENDERS = [
  { value: "male", label: "Male" },
  { value: "female", label: "Female" },
] as const;

export const MARITAL_STATUSES = [
  { value: "single", label: "Single" },
  { value: "married", label: "Married" },
  { value: "divorced", label: "Divorced" },
  { value: "widowed", label: "Widowed" },
] as const;

export const EMPLOYEE_DOC_TYPES = [
  { value: "passport", label: "Passport" },
  { value: "national_id", label: "National ID" },
  { value: "residency", label: "Residency" },
  { value: "visa", label: "Visa" },
  { value: "work_permit", label: "Work permit" },
  { value: "driving_licence", label: "Driving licence" },
  { value: "health_card", label: "Health card / insurance" },
  { value: "contract", label: "Employment contract" },
  { value: "certificate", label: "Certificate / degree" },
  { value: "other", label: "Other" },
] as const;
export type EmployeeDocType = (typeof EMPLOYEE_DOC_TYPES)[number]["value"];

export const labelOf = (list: readonly { value: string; label: string }[], value: string | null | undefined) =>
  list.find((o) => o.value === value)?.label ?? value ?? "";

/** Warn this many days before something expires or ends. */
export const EXPIRY_WARNING_DAYS = 30;

/** EMP-007 */
export const employeeCode = (n: number) => `EMP-${String(n).padStart(3, "0")}`;

export type ExpiryState = "expired" | "expiring" | "valid" | "none";

/** Where a date with an expiry stands today. */
export function expiryState(expiry: string | null | undefined, today: string, warnDays = EXPIRY_WARNING_DAYS): ExpiryState {
  if (!expiry) return "none";
  const left = daysBetween(today, expiry);
  if (left < 0) return "expired";
  if (left <= warnDays) return "expiring";
  return "valid";
}

/** Whole years and months between two dates (for "3 years 2 months" of service). */
export function tenure(from: string, to: string): { years: number; months: number } | null {
  if (to < from) return null;
  const [fy, fm, fd] = from.split("-").map(Number);
  const [ty, tm, td] = to.split("-").map(Number);
  let months = (ty - fy) * 12 + (tm - fm);
  if (td < fd) months -= 1;
  return { years: Math.floor(months / 12), months: months % 12 };
}

/** Days from `today` to the next yearly occurrence of a date's month/day (0 = today). Feb 29 → Feb 28 in other years. */
export function daysToNextYearly(date: string, today: string): number {
  const [, m, d] = date.split("-").map(Number);
  const [ty] = today.split("-").map(Number);
  const on = (y: number) => {
    const leap = (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
    const day = m === 2 && d === 29 && !leap ? 28 : d;
    return `${y}-${String(m).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  };
  const thisYear = on(ty);
  return thisYear >= today ? daysBetween(today, thisYear) : daysBetween(today, on(ty + 1));
}

const num = (s: string | null | undefined) => (s ? Number(s) : 0);

/** Basic + allowances, per the employee's pay period. */
export function grossPay(e: { basicPay: string | null; allowances: { amount: string }[] }) {
  return num(e.basicPay) + e.allowances.reduce((s, a) => s + num(a.amount), 0);
}

export type EmployeeLike = {
  id: string;
  name: string;
  managerId: string | null;
  endDate: string | null;
  hireDate: string | null;
  birthDate: string | null;
  probationEndDate: string | null;
  contractEndDate: string | null;
  jobTitle: string | null;
  departmentId: string | null;
  phone: string | null;
  nationalId: string | null;
  emergencyPhone: string | null;
  basicPay: string | null;
  bankAccount: string | null;
  photoPath: string | null;
};

export const isActive = (e: { endDate: string | null }, today: string) => !e.endDate || e.endDate > today;

/** The details an HR file should have, in the order they're asked for. */
const PROFILE_FIELDS: { key: keyof EmployeeLike; label: string }[] = [
  { key: "jobTitle", label: "Job title" },
  { key: "departmentId", label: "Department" },
  { key: "hireDate", label: "Hire date" },
  { key: "birthDate", label: "Date of birth" },
  { key: "phone", label: "Phone" },
  { key: "nationalId", label: "ID number" },
  { key: "emergencyPhone", label: "Emergency contact" },
  { key: "basicPay", label: "Pay" },
  { key: "bankAccount", label: "Bank account" },
  { key: "photoPath", label: "Photo" },
];

/** How complete a file is (0–100) and what's missing (English labels). */
export function profileCompleteness(e: EmployeeLike) {
  const missing = PROFILE_FIELDS.filter((f) => !e[f.key]).map((f) => f.label);
  return { percent: Math.round(((PROFILE_FIELDS.length - missing.length) / PROFILE_FIELDS.length) * 100), missing };
}

export type AttentionKind = "doc_expired" | "doc_expiring" | "probation_ending" | "contract_ending" | "contract_ended" | "incomplete";
export type AttentionItem = {
  kind: AttentionKind;
  employeeId: string;
  /** Days left (negative = already passed); null for "incomplete". */
  days: number | null;
  /** The date it's about (expiry / end), when there is one. */
  date: string | null;
  docType?: string;
  /** Sort key: most urgent first. */
  urgency: number;
};

/**
 * What HR should look at, most urgent first: expired and expiring documents,
 * probation and contracts ending soon, files missing important details.
 * Only for people still working here.
 */
export function attentionList(
  employees: EmployeeLike[],
  docs: { employeeId: string; type: string; expiryDate: string | null }[],
  today: string,
  warnDays = EXPIRY_WARNING_DAYS,
): AttentionItem[] {
  const active = new Map(employees.filter((e) => isActive(e, today)).map((e) => [e.id, e]));
  const out: AttentionItem[] = [];
  for (const d of docs) {
    if (!active.has(d.employeeId) || !d.expiryDate) continue;
    const state = expiryState(d.expiryDate, today, warnDays);
    if (state !== "expired" && state !== "expiring") continue;
    const days = daysBetween(today, d.expiryDate);
    out.push({ kind: state === "expired" ? "doc_expired" : "doc_expiring", employeeId: d.employeeId, days, date: d.expiryDate, docType: d.type, urgency: days });
  }
  for (const e of active.values()) {
    if (e.probationEndDate) {
      const days = daysBetween(today, e.probationEndDate);
      if (days >= 0 && days <= warnDays) out.push({ kind: "probation_ending", employeeId: e.id, days, date: e.probationEndDate, urgency: days });
    }
    if (e.contractEndDate) {
      const days = daysBetween(today, e.contractEndDate);
      if (days < 0) out.push({ kind: "contract_ended", employeeId: e.id, days, date: e.contractEndDate, urgency: days });
      else if (days <= warnDays) out.push({ kind: "contract_ending", employeeId: e.id, days, date: e.contractEndDate, urgency: days });
    }
    if (profileCompleteness(e).percent < 60) out.push({ kind: "incomplete", employeeId: e.id, days: null, date: null, urgency: 10_000 });
  }
  return out.sort((a, b) => a.urgency - b.urgency);
}

export type Celebration = { employeeId: string; kind: "birthday" | "anniversary"; days: number; years: number };

/** Birthdays and work anniversaries in the next `days` days (soonest first). */
export function upcomingCelebrations(employees: EmployeeLike[], today: string, days = 30): Celebration[] {
  const out: Celebration[] = [];
  const [ty] = today.split("-").map(Number);
  for (const e of employees) {
    if (!isActive(e, today)) continue;
    for (const [kind, date] of [["birthday", e.birthDate], ["anniversary", e.hireDate]] as const) {
      if (!date || date > today) continue;
      const left = daysToNextYearly(date, today);
      if (left > days) continue;
      const year = Number(date.slice(0, 4));
      const thisYear = date.slice(5) >= today.slice(5) || left === 0;
      const years = (thisYear ? ty : ty + 1) - year;
      // A hire date today isn't an anniversary yet.
      if (kind === "anniversary" && years < 1) continue;
      out.push({ employeeId: e.id, kind, days: left, years });
    }
  }
  return out.sort((a, b) => a.days - b.days);
}

export type OrgNode<E> = { employee: E; reports: OrgNode<E>[] };

/**
 * The org chart from "reports to". People whose manager is missing, has left, or
 * would make a loop become top-level, so everyone appears exactly once.
 */
export function buildOrgTree<E extends { id: string; managerId: string | null; name: string }>(employees: E[]): OrgNode<E>[] {
  const byId = new Map(employees.map((e) => [e.id, e]));
  const parentOf = (e: E) => {
    // Walk up; a loop back to `e` means it has no valid manager.
    let cur = e.managerId ? byId.get(e.managerId) : undefined;
    const seen = new Set([e.id]);
    while (cur) {
      if (seen.has(cur.id)) return null;
      seen.add(cur.id);
      cur = cur.managerId ? byId.get(cur.managerId) : undefined;
    }
    return e.managerId && byId.has(e.managerId) ? e.managerId : null;
  };
  const nodes = new Map(employees.map((e) => [e.id, { employee: e, reports: [] as OrgNode<E>[] }]));
  const roots: OrgNode<E>[] = [];
  for (const e of employees) {
    const p = parentOf(e);
    if (p) nodes.get(p)!.reports.push(nodes.get(e.id)!);
    else roots.push(nodes.get(e.id)!);
  }
  const sort = (list: OrgNode<E>[]) => {
    list.sort((a, b) => b.reports.length - a.reports.length || a.employee.name.localeCompare(b.employee.name));
    list.forEach((n) => sort(n.reports));
  };
  sort(roots);
  return roots;
}

/** True when making `managerId` the manager of `employeeId` would create a loop. */
export function wouldCreateLoop(employees: { id: string; managerId: string | null }[], employeeId: string, managerId: string) {
  if (employeeId === managerId) return true;
  const byId = new Map(employees.map((e) => [e.id, e.managerId]));
  let cur: string | null | undefined = managerId;
  const seen = new Set<string>();
  while (cur && !seen.has(cur)) {
    if (cur === employeeId) return true;
    seen.add(cur);
    cur = byId.get(cur);
  }
  return false;
}
