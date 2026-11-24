import { sql } from "drizzle-orm";
import {
  pgTable,
  text,
  integer,
  timestamp,
  date,
  numeric,
  jsonb,
  boolean,
  index,
  uniqueIndex,
  foreignKey,
  check,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";
import { organization, user } from "./auth";
import { loanRepayments, resources } from "./pm";

// HR (Phase 28). Owners/admins only: salaries and personal details are private.
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

export const departments = pgTable(
  "departments",
  {
    id: id(),
    workspaceId: workspaceId(),
    name: text("name").notNull(),
    color: text("color").notNull().default("#4F46E5"),
    ...timestamps,
  },
  (t) => [uniqueIndex("departments_workspace_name_uidx").on(t.workspaceId, t.name)],
);

export type Allowance = { name: string; amount: string };

/**
 * One person working for the company, with or without a login. May be linked to
 * a member account and/or a worker from the resource library (same person).
 * Numbered per company (EMP-001…). Someone who leaves keeps their record (endDate set).
 */
export const employees = pgTable(
  "employees",
  {
    id: id(),
    workspaceId: workspaceId(),
    number: integer("number").notNull(),
    userId: text("user_id").references(() => user.id, { onDelete: "set null" }),
    resourceId: text("resource_id").references(() => resources.id, { onDelete: "set null" }),
    name: text("name").notNull(),
    // The name in the other language / script (e.g. Arabic and Latin), optional.
    nameAlt: text("name_alt"),
    photoPath: text("photo_path"),
    photoType: text("photo_type"),

    // Job
    jobTitle: text("job_title"),
    departmentId: text("department_id").references(() => departments.id, { onDelete: "set null" }),
    // Reports to.
    managerId: text("manager_id"),
    // See EMPLOYMENT_TYPES in lib/hr.ts.
    employmentType: text("employment_type").notNull().default("full_time"),
    workLocation: text("work_location"),
    hireDate: date("hire_date"),
    probationEndDate: date("probation_end_date"),
    contractEndDate: date("contract_end_date"),
    // Left the company: kept, never deleted.
    endDate: date("end_date"),
    // See LEAVING_REASONS in lib/hr-rules.ts (older rows may hold free text).
    endReason: text("end_reason"),
    endNote: text("end_note"),

    // Personal
    birthDate: date("birth_date"),
    gender: text("gender"),
    nationality: text("nationality"),
    nationalId: text("national_id"),
    maritalStatus: text("marital_status"),
    phone: text("phone"),
    email: text("email"),
    address: text("address"),
    emergencyName: text("emergency_name"),
    emergencyPhone: text("emergency_phone"),

    // Pay: "monthly" | "daily" | "hourly"; basic is per that period.
    payBasis: text("pay_basis").notNull().default("monthly"),
    basicPay: numeric("basic_pay", { precision: 14, scale: 2 }),
    allowances: jsonb("allowances").$type<Allowance[]>().notNull().default([]),
    currency: text("currency").notNull().default("USD"),
    bankName: text("bank_name"),
    bankAccount: text("bank_account"),

    notes: text("notes"),
    // Work hours / days off when they differ from the company's (null = company default).
    shiftId: text("shift_id").references((): AnyPgColumn => shifts.id, { onDelete: "set null" }),
    // Leaving checklist: item key → done (see OFFBOARDING_ITEMS in lib/hr.ts).
    offboarding: jsonb("offboarding").$type<Record<string, boolean>>().notNull().default({}),
    createdById: text("created_by_id").references(() => user.id, { onDelete: "set null" }),
    ...timestamps,
  },
  (t) => [
    foreignKey({ columns: [t.managerId], foreignColumns: [t.id] }).onDelete("set null"),
    uniqueIndex("employees_number_uidx").on(t.workspaceId, t.number),
    uniqueIndex("employees_user_uidx").on(t.workspaceId, t.userId),
    uniqueIndex("employees_resource_uidx").on(t.workspaceId, t.resourceId),
    index("employees_workspace_idx").on(t.workspaceId, t.endDate),
    index("employees_manager_idx").on(t.managerId),
    check("employees_not_own_manager", sql`${t.managerId} is null or ${t.managerId} <> ${t.id}`),
  ],
);

/** Passport, ID, residency, permits, contracts, certificates — each with an optional expiry and file. */
export const employeeDocuments = pgTable(
  "employee_documents",
  {
    id: id(),
    workspaceId: workspaceId(),
    employeeId: text("employee_id")
      .notNull()
      .references(() => employees.id, { onDelete: "cascade" }),
    // See EMPLOYEE_DOC_TYPES in lib/hr.ts.
    type: text("type").notNull(),
    title: text("title"),
    docNumber: text("doc_number"),
    issueDate: date("issue_date"),
    expiryDate: date("expiry_date"),
    filePath: text("file_path"),
    fileName: text("file_name"),
    fileType: text("file_type"),
    note: text("note"),
    createdById: text("created_by_id").references(() => user.id, { onDelete: "set null" }),
    ...timestamps,
  },
  (t) => [
    index("employee_documents_employee_idx").on(t.employeeId),
    index("employee_documents_expiry_idx").on(t.workspaceId, t.expiryDate),
  ],
);

// --- Company HR rules (one row per company; missing = defaults in lib/hr-rules.ts) ---

export type EndOfServiceRules = {
  /** Days of pay per year of service for the first `firstYears` years, then `daysAfter`. */
  firstYears: number;
  daysFirst: number;
  daysAfter: number;
  /** Minimum service (years) before any end-of-service pay. */
  minYears: number;
  /** "basic" or "gross" (basic + allowances). */
  basis: "basic" | "gross";
  /** If they resign: share paid by years of service, e.g. [{ years: 2, percent: 33 }, …]; empty = always 100%. */
  resignation: { years: number; percent: number }[];
};

export const hrSettings = pgTable("hr_settings", {
  workspaceId: text("workspace_id")
    .primaryKey()
    .references(() => organization.id, { onDelete: "cascade" }),
  // Days off each week: 0 = Sunday … 6 = Saturday.
  weekend: jsonb("weekend").$type<number[]>().notNull().default([5, 6]),
  workStart: text("work_start").notNull().default("08:00"),
  workEnd: text("work_end").notNull().default("16:00"),
  // Minutes after the start time before someone counts as late.
  graceMinutes: integer("grace_minutes").notNull().default(15),
  // Overtime pay = hourly rate × this.
  overtimeRate: numeric("overtime_rate", { precision: 4, scale: 2 }).notNull().default("1.5"),
  // A day's pay for monthly staff: "30" = monthly ÷ 30; "working" = monthly ÷ working days in the month.
  dayBasis: text("day_basis").notNull().default("30"),
  // Social security / pension, % of the contribution base.
  ssEmployee: numeric("ss_employee", { precision: 5, scale: 2 }).notNull().default("0"),
  ssEmployer: numeric("ss_employer", { precision: 5, scale: 2 }).notNull().default("0"),
  // "basic" or "gross".
  ssBase: text("ss_base").notNull().default("basic"),
  endOfService: jsonb("end_of_service")
    .$type<EndOfServiceRules>()
    .notNull()
    .default({ firstYears: 5, daysFirst: 15, daysAfter: 30, minYears: 1, basis: "basic", resignation: [] }),
  updatedById: text("updated_by_id").references(() => user.id, { onDelete: "set null" }),
  ...timestamps,
});

/** Work hours and days off for a group of people (night shift, site crew…). */
export const shifts = pgTable("shifts", {
  id: id(),
  workspaceId: workspaceId(),
  name: text("name").notNull(),
  workStart: text("work_start").notNull(),
  workEnd: text("work_end").notNull(),
  weekend: jsonb("weekend").$type<number[]>().notNull(),
  ...timestamps,
});

export const holidays = pgTable(
  "holidays",
  {
    id: id(),
    workspaceId: workspaceId(),
    date: date("date").notNull(),
    name: text("name").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [uniqueIndex("holidays_date_uidx").on(t.workspaceId, t.date)],
);

// --- Attendance (28c) ---

/**
 * One row per person per day that was recorded. Days with no row are filled in
 * when read: weekend, holiday, approved leave, or "not recorded".
 */
export const attendance = pgTable(
  "attendance",
  {
    id: id(),
    workspaceId: workspaceId(),
    employeeId: text("employee_id")
      .notNull()
      .references(() => employees.id, { onDelete: "cascade" }),
    date: date("date").notNull(),
    // See ATTENDANCE_STATUSES in lib/hr-rules.ts.
    status: text("status").notNull(),
    checkIn: text("check_in"),
    checkOut: text("check_out"),
    lateMinutes: integer("late_minutes").notNull().default(0),
    overtimeHours: numeric("overtime_hours", { precision: 5, scale: 2 }).notNull().default("0"),
    // Hours worked (hourly staff); filled from check-in/out or project timesheets.
    hours: numeric("hours", { precision: 5, scale: 2 }),
    // "manual" | "timesheet"
    source: text("source").notNull().default("manual"),
    note: text("note"),
    recordedById: text("recorded_by_id").references(() => user.id, { onDelete: "set null" }),
    ...timestamps,
  },
  (t) => [uniqueIndex("attendance_day_uidx").on(t.employeeId, t.date), index("attendance_workspace_date_idx").on(t.workspaceId, t.date)],
);

// --- Leave (28d) ---

export const leaveTypes = pgTable("leave_types", {
  id: id(),
  workspaceId: workspaceId(),
  name: text("name").notNull(),
  paid: boolean("paid").notNull().default(true),
  // Days earned per year (spread over the months); null = no balance (e.g. unpaid).
  daysPerYear: numeric("days_per_year", { precision: 5, scale: 1 }),
  // Unused days that move to next year (at most).
  carryOver: numeric("carry_over", { precision: 5, scale: 1 }).notNull().default("0"),
  color: text("color").notNull().default("#4F46E5"),
  archivedAt: timestamp("archived_at", { withTimezone: true }),
  ...timestamps,
});

export const leaveRequests = pgTable(
  "leave_requests",
  {
    id: id(),
    workspaceId: workspaceId(),
    employeeId: text("employee_id")
      .notNull()
      .references(() => employees.id, { onDelete: "cascade" }),
    typeId: text("type_id")
      .notNull()
      .references(() => leaveTypes.id, { onDelete: "restrict" }),
    startDate: date("start_date").notNull(),
    endDate: date("end_date").notNull(),
    // Working days it uses (weekends and holidays not counted); half day = 0.5.
    days: numeric("days", { precision: 5, scale: 1 }).notNull(),
    reason: text("reason"),
    // "pending" | "approved" | "rejected" | "cancelled"
    status: text("status").notNull().default("pending"),
    decidedById: text("decided_by_id").references(() => user.id, { onDelete: "set null" }),
    decidedAt: timestamp("decided_at", { withTimezone: true }),
    decisionNote: text("decision_note"),
    createdById: text("created_by_id").references(() => user.id, { onDelete: "set null" }),
    ...timestamps,
  },
  (t) => [
    index("leave_requests_employee_idx").on(t.employeeId, t.startDate),
    index("leave_requests_workspace_idx").on(t.workspaceId, t.status, t.startDate),
    check("leave_requests_dates", sql`${t.endDate} >= ${t.startDate}`),
  ],
);

// --- Payroll (28e) ---

/** One month's payroll. Draft → approved (locked, loan instalments recorded) → paid. */
export const payrollRuns = pgTable(
  "payroll_runs",
  {
    id: id(),
    workspaceId: workspaceId(),
    // "2026-11"
    month: text("month").notNull(),
    // "draft" | "approved" | "paid"
    status: text("status").notNull().default("draft"),
    note: text("note"),
    approvedById: text("approved_by_id").references(() => user.id, { onDelete: "set null" }),
    approvedAt: timestamp("approved_at", { withTimezone: true }),
    paidAt: timestamp("paid_at", { withTimezone: true }),
    // Finance: the bank / cash box salaries were paid from (null = the default cash account).
    paidFromAccountId: text("paid_from_account_id"),
    createdById: text("created_by_id").references(() => user.id, { onDelete: "set null" }),
    ...timestamps,
  },
  (t) => [uniqueIndex("payroll_runs_month_uidx").on(t.workspaceId, t.month)],
);

export type PayLine = { name: string; amount: string };

/** One person's pay for a run: everything copied in, so later changes never alter it. */
export const payslips = pgTable(
  "payslips",
  {
    id: id(),
    workspaceId: workspaceId(),
    runId: text("run_id")
      .notNull()
      .references(() => payrollRuns.id, { onDelete: "cascade" }),
    employeeId: text("employee_id")
      .notNull()
      .references(() => employees.id, { onDelete: "cascade" }),
    // Snapshot of the person.
    name: text("name").notNull(),
    code: text("code").notNull(),
    jobTitle: text("job_title"),
    department: text("department"),
    bankName: text("bank_name"),
    bankAccount: text("bank_account"),
    currency: text("currency").notNull(),
    payBasis: text("pay_basis").notNull(),
    basicPay: numeric("basic_pay", { precision: 14, scale: 2 }).notNull(),
    allowances: jsonb("allowances").$type<PayLine[]>().notNull().default([]),
    // What the month looked like (from attendance and leave).
    workingDays: numeric("working_days", { precision: 5, scale: 1 }).notNull(),
    paidDays: numeric("paid_days", { precision: 5, scale: 1 }).notNull(),
    absentDays: numeric("absent_days", { precision: 5, scale: 1 }).notNull().default("0"),
    unpaidLeaveDays: numeric("unpaid_leave_days", { precision: 5, scale: 1 }).notNull().default("0"),
    hoursWorked: numeric("hours_worked", { precision: 7, scale: 2 }).notNull().default("0"),
    overtimeHours: numeric("overtime_hours", { precision: 6, scale: 2 }).notNull().default("0"),
    lateMinutes: integer("late_minutes").notNull().default(0),
    // Money.
    basicEarned: numeric("basic_earned", { precision: 14, scale: 2 }).notNull(),
    overtimePay: numeric("overtime_pay", { precision: 14, scale: 2 }).notNull().default("0"),
    additions: jsonb("additions").$type<PayLine[]>().notNull().default([]),
    deductions: jsonb("deductions").$type<PayLine[]>().notNull().default([]),
    ssEmployee: numeric("ss_employee", { precision: 14, scale: 2 }).notNull().default("0"),
    ssEmployer: numeric("ss_employer", { precision: 14, scale: 2 }).notNull().default("0"),
    loanDeduction: numeric("loan_deduction", { precision: 14, scale: 2 }).notNull().default("0"),
    gross: numeric("gross", { precision: 14, scale: 2 }).notNull(),
    net: numeric("net", { precision: 14, scale: 2 }).notNull(),
    ...timestamps,
  },
  (t) => [uniqueIndex("payslips_run_employee_uidx").on(t.runId, t.employeeId), index("payslips_employee_idx").on(t.employeeId)],
);

// --- Assets (28b) ---

export const assets = pgTable(
  "assets",
  {
    id: id(),
    workspaceId: workspaceId(),
    number: integer("number").notNull(),
    name: text("name").notNull(),
    // See ASSET_CATEGORIES in lib/hr-rules.ts.
    category: text("category").notNull().default("other"),
    serial: text("serial"),
    value: numeric("value", { precision: 14, scale: 2 }),
    currency: text("currency").notNull().default("USD"),
    purchaseDate: date("purchase_date"),
    // "new" | "good" | "fair" | "poor" | "broken"
    condition: text("condition").notNull().default("good"),
    // "available" | "assigned" | "repair" | "retired" | "lost"
    status: text("status").notNull().default("available"),
    notes: text("notes"),
    createdById: text("created_by_id").references(() => user.id, { onDelete: "set null" }),
    ...timestamps,
  },
  (t) => [uniqueIndex("assets_number_uidx").on(t.workspaceId, t.number), index("assets_workspace_idx").on(t.workspaceId, t.status)],
);

/** An asset handed to a person; open while returnedOn is null. */
export const assetAssignments = pgTable(
  "asset_assignments",
  {
    id: id(),
    workspaceId: workspaceId(),
    assetId: text("asset_id")
      .notNull()
      .references(() => assets.id, { onDelete: "cascade" }),
    employeeId: text("employee_id")
      .notNull()
      .references(() => employees.id, { onDelete: "cascade" }),
    assignedOn: date("assigned_on").notNull(),
    conditionOut: text("condition_out").notNull(),
    noteOut: text("note_out"),
    returnedOn: date("returned_on"),
    conditionIn: text("condition_in"),
    noteIn: text("note_in"),
    assignedById: text("assigned_by_id").references(() => user.id, { onDelete: "set null" }),
    returnedById: text("returned_by_id").references(() => user.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index("asset_assignments_asset_idx").on(t.assetId, t.assignedOn),
    index("asset_assignments_employee_idx").on(t.employeeId),
    // At most one open hand-over per asset.
    uniqueIndex("asset_assignments_open_uidx").on(t.assetId).where(sql`${t.returnedOn} is null`),
  ],
);

// --- Contracts (28f) ---

export const employeeContracts = pgTable(
  "employee_contracts",
  {
    id: id(),
    workspaceId: workspaceId(),
    employeeId: text("employee_id")
      .notNull()
      .references(() => employees.id, { onDelete: "cascade" }),
    startDate: date("start_date").notNull(),
    // null = open-ended.
    endDate: date("end_date"),
    employmentType: text("employment_type").notNull(),
    jobTitle: text("job_title"),
    basicPay: numeric("basic_pay", { precision: 14, scale: 2 }),
    currency: text("currency").notNull(),
    note: text("note"),
    filePath: text("file_path"),
    fileName: text("file_name"),
    fileType: text("file_type"),
    createdById: text("created_by_id").references(() => user.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index("employee_contracts_employee_idx").on(t.employeeId, t.startDate)],
);

/** Loan repayments recorded when a payslip is approved (removed again if the run is reopened). */
export const payslipLoanRepayments = pgTable(
  "payslip_loan_repayments",
  {
    payslipId: text("payslip_id")
      .notNull()
      .references(() => payslips.id, { onDelete: "cascade" }),
    repaymentId: text("repayment_id")
      .notNull()
      .references(() => loanRepayments.id, { onDelete: "cascade" }),
  },
  (t) => [uniqueIndex("payslip_loan_repayments_uidx").on(t.payslipId, t.repaymentId)],
);
