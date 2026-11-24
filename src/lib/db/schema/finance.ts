import { sql } from "drizzle-orm";
import { pgTable, text, integer, timestamp, date, numeric, jsonb, index, uniqueIndex, check, type AnyPgColumn } from "drizzle-orm/pg-core";
import { organization, user } from "./auth";
import { documents, projects, resources } from "./pm";

// Finance (Phase 29). Owners/admins only. Money in the books is kept in the
// company's main currency; each line also keeps the original currency/amount.
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
const money = (name: string) => numeric(name, { precision: 16, scale: 2 });

/** One row per company once Finance is set up. */
export const financeSettings = pgTable("finance_settings", {
  workspaceId: text("workspace_id")
    .primaryKey()
    .references(() => organization.id, { onDelete: "cascade" }),
  baseCurrency: text("base_currency").notNull(),
  // 1 = January.
  fiscalYearStart: integer("fiscal_year_start").notNull().default(1),
  // Records dated before this aren't in the books (history kept elsewhere); opening balances are on this date.
  startDate: date("start_date").notNull(),
  // Sales tax / VAT: name on invoices, default rate (%), the company's tax number. 0 = no tax.
  taxName: text("tax_name").notNull().default("VAT"),
  taxRate: numeric("tax_rate", { precision: 5, scale: 2 }).notNull().default("0"),
  taxNumber: text("tax_number"),
  // Nothing on or before this date can change (closed months).
  lockedUntil: date("locked_until"),
  // Invoices are due this many days after their date unless set.
  paymentTermsDays: integer("payment_terms_days").notNull().default(30),
  // Where money goes / comes from when a record doesn't say (the first cash box).
  defaultMoneyAccountId: text("default_money_account_id"),
  updatedById: text("updated_by_id").references(() => user.id, { onDelete: "set null" }),
  ...timestamps,
});

/**
 * The chart of accounts. `systemKey` marks the accounts Tamm posts to
 * automatically (receivables, tax, salaries…); money accounts (cash boxes,
 * banks, wallets) have `moneyKind` set.
 */
export const ledgerAccounts = pgTable(
  "ledger_accounts",
  {
    id: id(),
    workspaceId: workspaceId(),
    code: text("code").notNull(),
    name: text("name").notNull(),
    // "asset" | "liability" | "equity" | "income" | "expense"
    type: text("type").notNull(),
    systemKey: text("system_key"),
    // "cash" | "bank" | "wallet" for money accounts.
    moneyKind: text("money_kind"),
    // Money accounts can hold another currency (e.g. a USD bank account).
    currency: text("currency"),
    bankName: text("bank_name"),
    accountNumber: text("account_number"),
    // Money accounts: what was in it on the Finance start date (in its own currency).
    openingBalance: money("opening_balance").notNull().default("0"),
    description: text("description"),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("ledger_accounts_code_uidx").on(t.workspaceId, t.code),
    uniqueIndex("ledger_accounts_system_uidx").on(t.workspaceId, t.systemKey),
    index("ledger_accounts_type_idx").on(t.workspaceId, t.type),
  ],
);

/** How many units of the main currency one unit of `currency` is worth from `date`. */
export const fxRates = pgTable(
  "fx_rates",
  {
    id: id(),
    workspaceId: workspaceId(),
    currency: text("currency").notNull(),
    date: date("date").notNull(),
    rate: numeric("rate", { precision: 24, scale: 12 }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [uniqueIndex("fx_rates_uidx").on(t.workspaceId, t.currency, t.date)],
);

/** Customers and suppliers (a supplier may be linked to one in the resource library). */
export const contacts = pgTable(
  "contacts",
  {
    id: id(),
    workspaceId: workspaceId(),
    // "customer" | "supplier" | "both"
    kind: text("kind").notNull(),
    name: text("name").notNull(),
    email: text("email"),
    phone: text("phone"),
    address: text("address"),
    taxNumber: text("tax_number"),
    currency: text("currency"),
    resourceId: text("resource_id").references(() => resources.id, { onDelete: "set null" }),
    notes: text("notes"),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [index("contacts_workspace_idx").on(t.workspaceId, t.kind), uniqueIndex("contacts_resource_uidx").on(t.workspaceId, t.resourceId)],
);

export type InvoiceLine = { description: string; unit: string; quantity: string; unitPrice: string };

/**
 * A bill to a customer. Issued invoices post to the books; payments are allocated
 * to them. Printed on the letterhead with the company's Invoice form.
 */
export const invoices = pgTable(
  "invoices",
  {
    id: id(),
    workspaceId: workspaceId(),
    number: integer("number").notNull(),
    contactId: text("contact_id")
      .notNull()
      .references(() => contacts.id, { onDelete: "restrict" }),
    projectId: text("project_id").references(() => projects.id, { onDelete: "set null" }),
    date: date("date").notNull(),
    dueDate: date("due_date").notNull(),
    currency: text("currency").notNull(),
    items: jsonb("items").$type<InvoiceLine[]>().notNull().default([]),
    taxRate: numeric("tax_rate", { precision: 5, scale: 2 }).notNull().default("0"),
    // Held back by the customer until handover (% of the amount before tax).
    retentionPercent: numeric("retention_percent", { precision: 5, scale: 2 }).notNull().default("0"),
    // Progress invoice: share of the contract billed so far (cumulative %), for the record.
    progressPercent: numeric("progress_percent", { precision: 5, scale: 2 }),
    subject: text("subject"),
    notes: text("notes"),
    paymentDetails: text("payment_details"),
    // "draft" | "issued" | "cancelled" (paid/partly paid is worked out from payments).
    status: text("status").notNull().default("draft"),
    language: text("language").notNull().default("ar"),
    style: text("style").notNull().default("classic"),
    // The project document it came from, for invoices made before Finance.
    documentId: text("document_id").references(() => documents.id, { onDelete: "set null" }),
    issuedAt: timestamp("issued_at", { withTimezone: true }),
    createdById: text("created_by_id").references(() => user.id, { onDelete: "set null" }),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("invoices_number_uidx").on(t.workspaceId, t.number),
    index("invoices_contact_idx").on(t.contactId),
    index("invoices_project_idx").on(t.projectId),
    uniqueIndex("invoices_document_uidx").on(t.documentId),
  ],
);

/** A supplier's bill we have to pay. */
export const bills = pgTable(
  "bills",
  {
    id: id(),
    workspaceId: workspaceId(),
    number: integer("number").notNull(),
    // The supplier's own invoice number.
    reference: text("reference"),
    contactId: text("contact_id")
      .notNull()
      .references(() => contacts.id, { onDelete: "restrict" }),
    projectId: text("project_id").references(() => projects.id, { onDelete: "set null" }),
    // Cost account it's charged to.
    accountId: text("account_id")
      .notNull()
      .references((): AnyPgColumn => ledgerAccounts.id, { onDelete: "restrict" }),
    date: date("date").notNull(),
    dueDate: date("due_date").notNull(),
    currency: text("currency").notNull(),
    items: jsonb("items").$type<InvoiceLine[]>().notNull().default([]),
    taxRate: numeric("tax_rate", { precision: 5, scale: 2 }).notNull().default("0"),
    notes: text("notes"),
    // "draft" | "open" | "cancelled"
    status: text("status").notNull().default("open"),
    // The purchase order it was made from, if any.
    documentId: text("document_id").references(() => documents.id, { onDelete: "set null" }),
    filePath: text("file_path"),
    fileName: text("file_name"),
    fileType: text("file_type"),
    createdById: text("created_by_id").references(() => user.id, { onDelete: "set null" }),
    ...timestamps,
  },
  (t) => [uniqueIndex("bills_number_uidx").on(t.workspaceId, t.number), index("bills_contact_idx").on(t.contactId), index("bills_project_idx").on(t.projectId)],
);

/** Money received from a customer ("in") or paid to a supplier ("out"). */
export const finPayments = pgTable(
  "payments_fin",
  {
    id: id(),
    workspaceId: workspaceId(),
    number: integer("number").notNull(),
    direction: text("direction").notNull(),
    contactId: text("contact_id")
      .notNull()
      .references(() => contacts.id, { onDelete: "restrict" }),
    moneyAccountId: text("money_account_id")
      .notNull()
      .references(() => ledgerAccounts.id, { onDelete: "restrict" }),
    date: date("date").notNull(),
    amount: money("amount").notNull(),
    currency: text("currency").notNull(),
    method: text("method"),
    reference: text("reference"),
    note: text("note"),
    createdById: text("created_by_id").references(() => user.id, { onDelete: "set null" }),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("payments_fin_number_uidx").on(t.workspaceId, t.direction, t.number),
    index("payments_fin_contact_idx").on(t.contactId),
    check("payments_fin_amount_positive", sql`${t.amount} > 0`),
  ],
);

/** How much of a payment settles which invoice or bill. The rest stays on account. */
export const paymentAllocations = pgTable(
  "payment_allocations",
  {
    id: id(),
    workspaceId: workspaceId(),
    paymentId: text("payment_id")
      .notNull()
      .references(() => finPayments.id, { onDelete: "cascade" }),
    invoiceId: text("invoice_id").references(() => invoices.id, { onDelete: "cascade" }),
    billId: text("bill_id").references(() => bills.id, { onDelete: "cascade" }),
    amount: money("amount").notNull(),
  },
  (t) => [
    index("payment_allocations_payment_idx").on(t.paymentId),
    index("payment_allocations_invoice_idx").on(t.invoiceId),
    index("payment_allocations_bill_idx").on(t.billId),
    check("payment_allocations_one_target", sql`(${t.invoiceId} is null) <> (${t.billId} is null)`),
  ],
);

/** Moving money between two of the company's own accounts (cash to bank…). */
export const transfers = pgTable("transfers", {
  id: id(),
  workspaceId: workspaceId(),
  date: date("date").notNull(),
  fromAccountId: text("from_account_id")
    .notNull()
    .references(() => ledgerAccounts.id, { onDelete: "restrict" }),
  toAccountId: text("to_account_id")
    .notNull()
    .references(() => ledgerAccounts.id, { onDelete: "restrict" }),
  amount: money("amount").notNull(),
  // Received amount when the two accounts are in different currencies.
  amountTo: money("amount_to"),
  note: text("note"),
  createdById: text("created_by_id").references(() => user.id, { onDelete: "set null" }),
  ...timestamps,
});

/**
 * The books. Automatic entries (`source` ≠ "manual") are written by the ledger
 * sync from invoices, payments, expenses, payroll and loans, and are read-only.
 */
export const journalEntries = pgTable(
  "journal_entries",
  {
    id: id(),
    workspaceId: workspaceId(),
    number: integer("number").notNull(),
    date: date("date").notNull(),
    memo: text("memo").notNull(),
    // "manual" | "opening" | "invoice" | "bill" | "payment" | "transfer" | "expense" | "loan" | "repayment" | "payroll" | "payroll_paid"
    source: text("source").notNull(),
    sourceId: text("source_id"),
    // Unique per source record ("invoice:<id>"); null for manual entries.
    sourceKey: text("source_key"),
    // Fingerprint of the lines, so the sync only rewrites what changed.
    hash: text("hash"),
    projectId: text("project_id").references(() => projects.id, { onDelete: "set null" }),
    createdById: text("created_by_id").references(() => user.id, { onDelete: "set null" }),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("journal_entries_number_uidx").on(t.workspaceId, t.number),
    uniqueIndex("journal_entries_source_uidx").on(t.workspaceId, t.sourceKey),
    index("journal_entries_date_idx").on(t.workspaceId, t.date),
  ],
);

export const journalLines = pgTable(
  "journal_lines",
  {
    id: id(),
    workspaceId: workspaceId(),
    entryId: text("entry_id")
      .notNull()
      .references(() => journalEntries.id, { onDelete: "cascade" }),
    accountId: text("account_id")
      .notNull()
      .references(() => ledgerAccounts.id, { onDelete: "restrict" }),
    // In the main currency.
    debit: money("debit").notNull().default("0"),
    credit: money("credit").notNull().default("0"),
    // The original currency and signed amount (+ debit / − credit).
    currency: text("currency").notNull(),
    amountFx: money("amount_fx").notNull(),
    projectId: text("project_id").references(() => projects.id, { onDelete: "set null" }),
    contactId: text("contact_id").references(() => contacts.id, { onDelete: "set null" }),
    description: text("description"),
  },
  (t) => [
    index("journal_lines_entry_idx").on(t.entryId),
    index("journal_lines_account_idx").on(t.workspaceId, t.accountId),
    index("journal_lines_project_idx").on(t.projectId),
  ],
);

/** Planned income/expense per account per month of a financial year (12 amounts). */
export const budgets = pgTable(
  "budgets",
  {
    id: id(),
    workspaceId: workspaceId(),
    // The calendar year the financial year starts in.
    year: integer("year").notNull(),
    accountId: text("account_id")
      .notNull()
      .references(() => ledgerAccounts.id, { onDelete: "cascade" }),
    months: jsonb("months").$type<string[]>().notNull(),
    ...timestamps,
  },
  (t) => [uniqueIndex("budgets_uidx").on(t.workspaceId, t.year, t.accountId)],
);

/** Things the sync couldn't post (missing exchange rate, closed month), shown on the Finance page. */
export const ledgerIssues = pgTable(
  "ledger_issues",
  {
    workspaceId: workspaceId(),
    sourceKey: text("source_key").notNull(),
    // "rate" | "locked"
    kind: text("kind").notNull(),
    detail: jsonb("detail").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [uniqueIndex("ledger_issues_uidx").on(t.workspaceId, t.sourceKey)],
);

