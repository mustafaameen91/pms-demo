"use server";

import { refresh } from "next/cache";
import { and, eq, inArray, max, ne, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import {
  activities,
  bills,
  budgets,
  contacts,
  documents,
  expenses,
  financeSettings,
  finPayments,
  fxRates,
  invoices,
  journalEntries,
  journalLines,
  ledgerAccounts,
  paymentAllocations,
  projects,
  resources,
  transfers,
} from "@/lib/db/schema";
import { hrAdmin, invalid, type Result } from "@/lib/hr-auth";
import { DEFAULT_ACCOUNTS, MONEY_KINDS, cents, invoiceTotals } from "@/lib/finance/core";
import { billCode, getFinanceSettings, invoiceCode, paymentCode } from "@/lib/finance/ledger";
import { deleteStoredFile, saveReceipt } from "@/lib/uploads";
import { todayISO } from "@/lib/accomplishment";
import { formatDate } from "@/lib/utils";
import { getT } from "@/i18n/server";

const NOT_SET_UP = "Set up Finance first.";
const text = (max: number) => z.string().trim().max(max).optional().nullable().transform((v) => v || null);
const isoDay = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Enter a valid date");
const currency = z.string().trim().toUpperCase().regex(/^[A-Z]{3}$/, "Use a 3-letter currency code, e.g. USD");
const amount = (msg = "Enter an amount like 1500 or 1500.50") =>
  z
    .string()
    .trim()
    .transform((v) => v.replace(/,/g, ""))
    .refine((v) => /^-?\d{1,13}(\.\d{1,2})?$/.test(v), msg);
const positive = amount().refine((v) => Number(v) > 0, "Enter an amount greater than 0");
const percent = z
  .string()
  .trim()
  .optional()
  .transform((v) => v || "0")
  .refine((v) => /^\d{1,3}(\.\d{1,2})?$/.test(v) && Number(v) <= 100, "Enter a percentage between 0 and 100");
const lineSchema = z.object({
  description: z.string().trim().max(500),
  unit: z.string().trim().max(30).default(""),
  quantity: z.string().trim().refine((v) => /^\d{1,9}(\.\d{1,3})?$/.test(v), "Enter a quantity like 1 or 2.5"),
  unitPrice: amount(),
});
const lines = z
  .array(lineSchema)
  .max(200)
  .transform((l) => l.filter((x) => x.description))
  .refine((l) => l.length > 0, "Add at least one line");
const log = (workspaceId: string, actorId: string, type: string, data: Record<string, unknown>) => db.insert(activities).values({ workspaceId, actorId, type, data });

async function admin(slug: string) {
  const auth = await hrAdmin(slug);
  if (!auth) return null;
  return { ...auth, settings: await getFinanceSettings(auth.workspace.id) };
}
/** Owner/admin of a set-up company, or an error result. */
async function ready(slug: string) {
  const t = await getT();
  const a = await admin(slug);
  if (!a) return { error: { ok: false, error: t("Only workspace owners and admins can manage Finance.") } as Result<never> };
  if (!a.settings) return { error: { ok: false, error: t(NOT_SET_UP) } as Result<never> };
  return { ...a, settings: a.settings, t, error: undefined };
}
const isLocked = (s: { lockedUntil: string | null }, date: string) => Boolean(s.lockedUntil && date <= s.lockedUntil);
const lockedMsg = (t: Awaited<ReturnType<typeof getT>>, s: { lockedUntil: string | null }) =>
  t("The books are closed up to {date}. Pick a later date, or reopen that period in Finance settings.", { date: formatDate(s.lockedUntil, t.intl) });

// =============================== Setup & settings ===============================

const moneyAccountInput = z.object({
  name: z.string().trim().min(2, "Give the account a name").max(80),
  kind: z.enum(MONEY_KINDS.map((k) => k.value) as [string, ...string[]]),
  currency,
  openingBalance: amount().optional().transform((v) => v || "0"),
  bankName: text(120),
  accountNumber: text(80),
});
const setupSchema = z.object({
  baseCurrency: currency,
  fiscalYearStart: z.coerce.number().int().min(1).max(12),
  startDate: isoDay,
  taxName: z.string().trim().min(1).max(20).default("VAT"),
  taxRate: percent,
  taxNumber: text(60),
  moneyAccounts: z.array(moneyAccountInput).min(1, "Add at least one cash box or bank account").max(20),
  importInvoices: z.boolean().default(true),
  importSuppliers: z.boolean().default(true),
});
export type SetupInput = z.input<typeof setupSchema>;

/**
 * Sets up Finance: the chart of accounts, cash and bank accounts with their
 * opening balances, and (optionally) moves the existing project invoices and
 * suppliers in. Records before the start date stay out of the books.
 */
export async function setupFinance(slug: string, input: SetupInput): Promise<Result> {
  const t = await getT();
  const a = await admin(slug);
  if (!a) return { ok: false, error: t("Only workspace owners and admins can manage Finance.") };
  if (a.settings) return { ok: true };
  const parsed = setupSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error, t);
  const d = parsed.data;
  const ws = a.workspace.id;
  await db.transaction(async (tx) => {
    await tx.insert(ledgerAccounts).values(DEFAULT_ACCOUNTS.map((x) => ({ workspaceId: ws, code: x.code, name: x.name, type: x.type, systemKey: x.key }))).onConflictDoNothing();
    const codes = { cash: 1100, bank: 1200, wallet: 1250 } as Record<string, number>;
    const made: string[] = [];
    for (const m of d.moneyAccounts) {
      const [row] = await tx
        .insert(ledgerAccounts)
        .values({ workspaceId: ws, code: String(codes[m.kind]++), name: m.name, type: "asset", moneyKind: m.kind, currency: m.currency, openingBalance: m.openingBalance, bankName: m.bankName, accountNumber: m.accountNumber })
        .returning({ id: ledgerAccounts.id });
      made.push(row.id);
    }
    await tx.insert(financeSettings).values({
      workspaceId: ws,
      baseCurrency: d.baseCurrency,
      fiscalYearStart: d.fiscalYearStart,
      startDate: d.startDate,
      taxName: d.taxName,
      taxRate: d.taxRate,
      taxNumber: d.taxNumber,
      defaultMoneyAccountId: made[0],
      updatedById: a.user.id,
    });

    if (d.importSuppliers) {
      const sup = await tx.select().from(resources).where(and(eq(resources.workspaceId, ws), eq(resources.type, "supplier")));
      if (sup.length)
        await tx
          .insert(contacts)
          .values(sup.map((r) => ({ workspaceId: ws, kind: "supplier", name: r.name, phone: r.phone, currency: r.currency, resourceId: r.id, notes: r.role ? `${r.role}` : null })))
          .onConflictDoNothing();
    }
    if (d.importInvoices) {
      const docs = await tx
        .select({ doc: documents, client: projects.client })
        .from(documents)
        .innerJoin(projects, eq(projects.id, documents.projectId))
        .where(and(eq(documents.workspaceId, ws), eq(documents.type, "invoice")));
      const byName = new Map<string, string>();
      for (const { doc, client } of docs) {
        const name = (doc.data.client || client || t("Customer")).trim();
        const key = name.toLowerCase();
        if (!byName.has(key)) {
          const [c] = await tx.insert(contacts).values({ workspaceId: ws, kind: "customer", name, currency: doc.currency }).returning({ id: contacts.id });
          byName.set(key, c.id);
        }
        const due = /^\d{4}-\d{2}-\d{2}$/.test(doc.data.dueDate ?? "") ? doc.data.dueDate : doc.date;
        await tx
          .insert(invoices)
          .values({
            workspaceId: ws,
            number: doc.number,
            contactId: byName.get(key)!,
            projectId: doc.projectId,
            date: doc.date,
            dueDate: due < doc.date ? doc.date : due,
            currency: doc.currency,
            items: doc.items.map((i) => ({ description: i.description, unit: i.unit, quantity: i.quantity || "0", unitPrice: i.unitPrice || "0" })),
            taxRate: doc.taxRate ?? "0",
            subject: doc.data.subject || null,
            paymentDetails: doc.data.paymentDetails || null,
            status: doc.status === "draft" ? "draft" : doc.status === "cancelled" ? "cancelled" : "issued",
            language: doc.language,
            style: doc.style,
            documentId: doc.id,
            issuedAt: doc.issuedAt,
            createdById: doc.createdById,
          })
          .onConflictDoNothing();
      }
    }
    await tx.insert(activities).values({ workspaceId: ws, actorId: a.user.id, type: "finance.setup", data: { currency: d.baseCurrency } });
  });
  refresh();
  return { ok: true };
}

const settingsSchema = z.object({
  fiscalYearStart: z.coerce.number().int().min(1).max(12),
  taxName: z.string().trim().min(1).max(20),
  taxRate: percent,
  taxNumber: text(60),
  paymentTermsDays: z.coerce.number().int().min(0).max(365),
  defaultMoneyAccountId: z.string().min(1),
});

export async function saveFinanceSettings(slug: string, input: z.input<typeof settingsSchema>): Promise<Result> {
  const r = await ready(slug);
  if (r.error) return r.error;
  const parsed = settingsSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error, r.t);
  const [acc] = await db
    .select({ id: ledgerAccounts.id })
    .from(ledgerAccounts)
    .where(and(eq(ledgerAccounts.id, parsed.data.defaultMoneyAccountId), eq(ledgerAccounts.workspaceId, r.workspace.id), sql`${ledgerAccounts.moneyKind} is not null`));
  if (!acc) return { ok: false, error: r.t("Choose one of the options") };
  await db.update(financeSettings).set({ ...parsed.data, updatedById: r.user.id, updatedAt: new Date() }).where(eq(financeSettings.workspaceId, r.workspace.id));
  await log(r.workspace.id, r.user.id, "finance.settings_updated", {});
  refresh();
  return { ok: true };
}

/** Closes the books up to a date (null reopens everything). */
export async function setBooksLock(slug: string, until: string | null): Promise<Result> {
  const r = await ready(slug);
  if (r.error) return r.error;
  if (until !== null && !/^\d{4}-\d{2}-\d{2}$/.test(until)) return { ok: false, error: r.t("Enter a valid date") };
  if (until && until > todayISO()) return { ok: false, error: r.t("You can't close a period that hasn't ended.") };
  await db.update(financeSettings).set({ lockedUntil: until, updatedAt: new Date() }).where(eq(financeSettings.workspaceId, r.workspace.id));
  await log(r.workspace.id, r.user.id, until ? "finance.closed" : "finance.reopened", { date: until });
  refresh();
  return { ok: true };
}

// =============================== Accounts & rates ===============================

const accountSchema = z
  .object({
    code: z.string().trim().regex(/^[0-9A-Za-z.-]{1,12}$/, "Use a short code like 6150"),
    name: z.string().trim().min(2, "Give the account a name").max(80),
    type: z.enum(["asset", "liability", "equity", "income", "expense"]),
    description: text(300),
    moneyKind: z
      .string()
      .optional()
      .nullable()
      .transform((v) => v || null)
      .refine((v) => v === null || MONEY_KINDS.some((k) => k.value === v), "Choose one of the options"),
    currency: z
      .string()
      .optional()
      .nullable()
      .transform((v) => (v ? v.toUpperCase() : null))
      .refine((v) => v === null || /^[A-Z]{3}$/.test(v), "Use a 3-letter currency code, e.g. USD"),
    bankName: text(120),
    accountNumber: text(80),
    openingBalance: amount().optional().transform((v) => v || "0"),
  })
  .refine((v) => !v.moneyKind || v.type === "asset", { path: ["type"], message: "Cash and bank accounts are assets" });

export async function saveLedgerAccount(slug: string, id: string | null, input: z.input<typeof accountSchema>): Promise<Result> {
  const r = await ready(slug);
  if (r.error) return r.error;
  const parsed = accountSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error, r.t);
  const ws = r.workspace.id;
  const [clash] = await db
    .select({ id: ledgerAccounts.id })
    .from(ledgerAccounts)
    .where(and(eq(ledgerAccounts.workspaceId, ws), eq(ledgerAccounts.code, parsed.data.code), id ? ne(ledgerAccounts.id, id) : undefined));
  if (clash) {
    const msg = r.t("Another account already uses this code.");
    return { ok: false, error: msg, fieldErrors: { code: msg } };
  }
  const values = { ...parsed.data, currency: parsed.data.moneyKind ? (parsed.data.currency ?? r.settings.baseCurrency) : null, openingBalance: parsed.data.moneyKind ? parsed.data.openingBalance : "0" };
  if (id) {
    const [old] = await db.select().from(ledgerAccounts).where(and(eq(ledgerAccounts.id, id), eq(ledgerAccounts.workspaceId, ws)));
    if (!old) return { ok: false, error: r.t("Not found") };
    // System accounts keep their type; money accounts stay money accounts once used.
    if (old.systemKey && old.type !== values.type) return { ok: false, error: r.t("Tamm posts to this account automatically, so its type can't change.") };
    const used = await db.select({ id: journalLines.id }).from(journalLines).where(eq(journalLines.accountId, id)).limit(1);
    if (used.length && (old.type !== values.type || Boolean(old.moneyKind) !== Boolean(values.moneyKind) || (old.currency ?? null) !== (values.currency ?? null)))
      return { ok: false, error: r.t("This account already has entries, so its type and currency can't change.") };
    await db.update(ledgerAccounts).set({ ...values, updatedAt: new Date() }).where(eq(ledgerAccounts.id, id));
  } else {
    await db.insert(ledgerAccounts).values({ ...values, workspaceId: ws });
  }
  refresh();
  return { ok: true };
}

export async function archiveLedgerAccount(slug: string, id: string, archived: boolean): Promise<Result> {
  const r = await ready(slug);
  if (r.error) return r.error;
  const [acc] = await db.select().from(ledgerAccounts).where(and(eq(ledgerAccounts.id, id), eq(ledgerAccounts.workspaceId, r.workspace.id)));
  if (!acc) return { ok: false, error: r.t("Not found") };
  if (acc.systemKey || acc.id === r.settings.defaultMoneyAccountId) return { ok: false, error: r.t("This account is used automatically and can't be hidden.") };
  await db.update(ledgerAccounts).set({ archivedAt: archived ? new Date() : null }).where(eq(ledgerAccounts.id, id));
  refresh();
  return { ok: true };
}

const rateSchema = z.object({
  currency,
  date: isoDay,
  rate: z
    .string()
    .trim()
    .refine((v) => /^\d{1,10}(\.\d{1,8})?$/.test(v) && Number(v) > 0, "Enter a rate greater than 0"),
  /** The rate as typed: "per" = 1 unit of currency is worth `rate` main units; "inverse" = 1 main unit buys `rate` units. */
  mode: z.enum(["per", "inverse"]).default("per"),
});

export async function saveRate(slug: string, input: z.input<typeof rateSchema>): Promise<Result> {
  const r = await ready(slug);
  if (r.error) return r.error;
  const parsed = rateSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error, r.t);
  if (parsed.data.currency === r.settings.baseCurrency) return { ok: false, error: r.t("That's your main currency; it needs no rate.") };
  const value = parsed.data.mode === "inverse" ? 1 / Number(parsed.data.rate) : Number(parsed.data.rate);
  await db
    .insert(fxRates)
    .values({ workspaceId: r.workspace.id, currency: parsed.data.currency, date: parsed.data.date, rate: value.toFixed(12) })
    .onConflictDoUpdate({ target: [fxRates.workspaceId, fxRates.currency, fxRates.date], set: { rate: value.toFixed(12) } });
  refresh();
  return { ok: true };
}

export async function deleteRate(slug: string, id: string): Promise<Result> {
  const r = await ready(slug);
  if (r.error) return r.error;
  await db.delete(fxRates).where(and(eq(fxRates.id, id), eq(fxRates.workspaceId, r.workspace.id)));
  refresh();
  return { ok: true };
}

// =============================== Contacts ===============================

const contactSchema = z.object({
  kind: z.enum(["customer", "supplier", "both"]),
  name: z.string().trim().min(2, "Enter a name").max(120),
  email: text(160).refine((v) => v === null || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v), "Enter a valid email address"),
  phone: text(60),
  address: text(300),
  taxNumber: text(60),
  currency: z
    .string()
    .optional()
    .nullable()
    .transform((v) => (v ? v.toUpperCase() : null)),
  notes: text(1000),
});
export type ContactInput = z.input<typeof contactSchema>;

export async function saveContact(slug: string, id: string | null, input: ContactInput): Promise<Result<{ id: string }>> {
  const r = await ready(slug);
  if (r.error) return r.error;
  const parsed = contactSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error, r.t);
  if (id) {
    const [row] = await db
      .update(contacts)
      .set({ ...parsed.data, updatedAt: new Date() })
      .where(and(eq(contacts.id, id), eq(contacts.workspaceId, r.workspace.id)))
      .returning({ id: contacts.id });
    if (!row) return { ok: false, error: r.t("Not found") };
    refresh();
    return { ok: true, data: row };
  }
  const [row] = await db.insert(contacts).values({ ...parsed.data, workspaceId: r.workspace.id }).returning({ id: contacts.id });
  refresh();
  return { ok: true, data: row };
}

export async function archiveContact(slug: string, id: string, archived: boolean): Promise<Result> {
  const r = await ready(slug);
  if (r.error) return r.error;
  await db.update(contacts).set({ archivedAt: archived ? new Date() : null }).where(and(eq(contacts.id, id), eq(contacts.workspaceId, r.workspace.id)));
  refresh();
  return { ok: true };
}

// =============================== Invoices ===============================

const invoiceSchema = z
  .object({
    contactId: z.string().min(1, "Choose a customer"),
    projectId: text(64),
    date: isoDay,
    dueDate: isoDay,
    currency,
    items: lines,
    taxRate: percent,
    retentionPercent: percent,
    progressPercent: z
      .string()
      .optional()
      .nullable()
      .transform((v) => v || null),
    subject: text(200),
    notes: text(2000),
    paymentDetails: text(1000),
    language: z.enum(["ar", "en"]),
    style: z.enum(["classic", "modern", "minimal"]),
  })
  .refine((v) => v.dueDate >= v.date, { path: ["dueDate"], message: "The due date can't be before the invoice date" });
export type InvoiceInput = z.input<typeof invoiceSchema>;

async function paidOn(invoiceId: string) {
  const [row] = await db.select({ s: sql<string>`coalesce(sum(${paymentAllocations.amount}), 0)` }).from(paymentAllocations).where(eq(paymentAllocations.invoiceId, invoiceId));
  return cents(row?.s);
}

export async function saveInvoice(slug: string, id: string | null, input: InvoiceInput): Promise<Result<{ id: string }>> {
  const r = await ready(slug);
  if (r.error) return r.error;
  const parsed = invoiceSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error, r.t);
  const d = parsed.data;
  const ws = r.workspace.id;
  const [c] = await db.select({ id: contacts.id }).from(contacts).where(and(eq(contacts.id, d.contactId), eq(contacts.workspaceId, ws)));
  if (!c) return { ok: false, error: r.t("Choose a customer"), fieldErrors: { contactId: r.t("Choose a customer") } };
  if (d.projectId) {
    const [p] = await db.select({ id: projects.id }).from(projects).where(and(eq(projects.id, d.projectId), eq(projects.workspaceId, ws)));
    if (!p) return { ok: false, error: r.t("Choose one of the options") };
  }
  if (id) {
    const [old] = await db.select().from(invoices).where(and(eq(invoices.id, id), eq(invoices.workspaceId, ws)));
    if (!old) return { ok: false, error: r.t("Not found") };
    if (old.status === "cancelled") return { ok: false, error: r.t("A cancelled invoice can't be changed.") };
    if (old.status === "issued" && (isLocked(r.settings, old.date) || isLocked(r.settings, d.date))) return { ok: false, error: lockedMsg(r.t, r.settings) };
    const paid = await paidOn(id);
    if (paid > invoiceTotals(d.items, d.taxRate, d.retentionPercent).total) return { ok: false, error: r.t("More than this has already been paid on it. Remove a payment first.") };
    if (paid > 0 && d.currency !== old.currency) return { ok: false, error: r.t("It has payments, so its currency can't change.") };
    await db.update(invoices).set({ ...d, updatedAt: new Date() }).where(eq(invoices.id, id));
    refresh();
    return { ok: true, data: { id } };
  }
  const row = await db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${"invoice-no:" + ws}))`);
    const [[m], [dm]] = await Promise.all([
      tx.select({ n: max(invoices.number) }).from(invoices).where(eq(invoices.workspaceId, ws)),
      tx.select({ n: max(documents.number) }).from(documents).where(and(eq(documents.workspaceId, ws), eq(documents.type, "invoice"))),
    ]);
    const number = Math.max(m?.n ?? 0, dm?.n ?? 0) + 1;
    const [x] = await tx.insert(invoices).values({ ...d, number, workspaceId: ws, createdById: r.user.id }).returning({ id: invoices.id });
    return x;
  });
  refresh();
  return { ok: true, data: { id: row.id } };
}

/** Draft → issued (it goes into the books); issued → cancelled (only without payments). */
export async function setInvoiceStatus(id: string, slug: string, status: "issued" | "cancelled" | "draft"): Promise<Result> {
  const r = await ready(slug);
  if (r.error) return r.error;
  const [inv] = await db.select().from(invoices).where(and(eq(invoices.id, id), eq(invoices.workspaceId, r.workspace.id)));
  if (!inv) return { ok: false, error: r.t("Not found") };
  if (isLocked(r.settings, inv.date)) return { ok: false, error: lockedMsg(r.t, r.settings) };
  if (status !== "issued" && (await paidOn(id)) > 0) return { ok: false, error: r.t("It has payments. Remove them first.") };
  if (status === "issued" && invoiceTotals(inv.items, inv.taxRate, inv.retentionPercent).total <= 0) return { ok: false, error: r.t("The invoice total must be more than 0.") };
  await db
    .update(invoices)
    .set({ status, issuedAt: status === "issued" ? (inv.issuedAt ?? new Date()) : inv.issuedAt })
    .where(eq(invoices.id, id));
  await log(r.workspace.id, r.user.id, `invoice.${status}`, { code: invoiceCode(inv.number) });
  refresh();
  return { ok: true };
}

export async function deleteInvoice(id: string, slug: string): Promise<Result> {
  const r = await ready(slug);
  if (r.error) return r.error;
  const [inv] = await db.select().from(invoices).where(and(eq(invoices.id, id), eq(invoices.workspaceId, r.workspace.id)));
  if (!inv) return { ok: false, error: r.t("Not found") };
  if (inv.status !== "draft") return { ok: false, error: r.t("Only a draft can be deleted. Cancel an issued invoice instead.") };
  await db.delete(invoices).where(eq(invoices.id, id));
  refresh();
  return { ok: true };
}

// =============================== Bills ===============================

const billSchema = z
  .object({
    contactId: z.string().min(1, "Choose a supplier"),
    reference: text(80),
    projectId: text(64),
    accountId: z.string().min(1, "Choose what it's for"),
    date: isoDay,
    dueDate: isoDay,
    currency,
    items: lines,
    taxRate: percent,
    notes: text(2000),
    documentId: text(64),
  })
  .refine((v) => v.dueDate >= v.date, { path: ["dueDate"], message: "The due date can't be before the bill date" });

/** Adds or edits a supplier bill (JSON in `data`, optional scan in `file`). */
export async function saveBill(slug: string, id: string | null, formData: FormData): Promise<Result<{ id: string }>> {
  const r = await ready(slug);
  if (r.error) return r.error;
  let raw: unknown;
  try {
    raw = JSON.parse(String(formData.get("data") ?? "{}"));
  } catch {
    return { ok: false, error: r.t("Not found") };
  }
  const parsed = billSchema.safeParse(raw);
  if (!parsed.success) return invalid(parsed.error, r.t);
  const d = parsed.data;
  const ws = r.workspace.id;
  const [[c], [acc]] = await Promise.all([
    db.select({ id: contacts.id }).from(contacts).where(and(eq(contacts.id, d.contactId), eq(contacts.workspaceId, ws))),
    db.select({ id: ledgerAccounts.id, type: ledgerAccounts.type }).from(ledgerAccounts).where(and(eq(ledgerAccounts.id, d.accountId), eq(ledgerAccounts.workspaceId, ws))),
  ]);
  if (!c) return { ok: false, error: r.t("Choose a supplier"), fieldErrors: { contactId: r.t("Choose a supplier") } };
  if (!acc || (acc.type !== "expense" && acc.type !== "asset")) return { ok: false, error: r.t("Choose what it's for"), fieldErrors: { accountId: r.t("Choose what it's for") } };
  if (isLocked(r.settings, d.date)) return { ok: false, error: lockedMsg(r.t, r.settings) };
  const file = formData.get("file");
  let upload: { filePath: string; fileName: string; fileType: string } | null = null;
  if (file instanceof File && file.size > 0) {
    const saved = await saveReceipt(ws, file, r.t);
    if ("error" in saved) return { ok: false, error: saved.error, fieldErrors: { file: saved.error } };
    upload = { filePath: saved.path, fileName: saved.name, fileType: saved.type };
  }
  if (id) {
    const [old] = await db.select().from(bills).where(and(eq(bills.id, id), eq(bills.workspaceId, ws)));
    if (!old) return { ok: false, error: r.t("Not found") };
    if (isLocked(r.settings, old.date)) return { ok: false, error: lockedMsg(r.t, r.settings) };
    const [paid] = await db.select({ s: sql<string>`coalesce(sum(${paymentAllocations.amount}), 0)` }).from(paymentAllocations).where(eq(paymentAllocations.billId, id));
    if (cents(paid?.s) > invoiceTotals(d.items, d.taxRate).total) return { ok: false, error: r.t("More than this has already been paid on it. Remove a payment first.") };
    await db.update(bills).set({ ...d, ...upload, updatedAt: new Date() }).where(eq(bills.id, id));
    if (upload) await deleteStoredFile(old.filePath);
    refresh();
    return { ok: true, data: { id } };
  }
  const row = await db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${"bill-no:" + ws}))`);
    const [m] = await tx.select({ n: max(bills.number) }).from(bills).where(eq(bills.workspaceId, ws));
    const [x] = await tx.insert(bills).values({ ...d, ...upload, number: (m?.n ?? 0) + 1, workspaceId: ws, createdById: r.user.id }).returning({ id: bills.id, number: bills.number });
    await tx.insert(activities).values({ workspaceId: ws, actorId: r.user.id, type: "bill.created", data: { code: billCode(x.number) } });
    return x;
  });
  refresh();
  return { ok: true, data: { id: row.id } };
}

export async function cancelBill(id: string, slug: string): Promise<Result> {
  const r = await ready(slug);
  if (r.error) return r.error;
  const [b] = await db.select().from(bills).where(and(eq(bills.id, id), eq(bills.workspaceId, r.workspace.id)));
  if (!b) return { ok: false, error: r.t("Not found") };
  if (isLocked(r.settings, b.date)) return { ok: false, error: lockedMsg(r.t, r.settings) };
  const [paid] = await db.select({ s: sql<string>`coalesce(sum(${paymentAllocations.amount}), 0)` }).from(paymentAllocations).where(eq(paymentAllocations.billId, id));
  if (cents(paid?.s) > 0) return { ok: false, error: r.t("It has payments. Remove them first.") };
  await db.update(bills).set({ status: "cancelled" }).where(eq(bills.id, id));
  await log(r.workspace.id, r.user.id, "bill.cancelled", { code: billCode(b.number) });
  refresh();
  return { ok: true };
}

// =============================== Payments ===============================

const paymentSchema = z.object({
  direction: z.enum(["in", "out"]),
  contactId: z.string().min(1, "Choose who"),
  moneyAccountId: z.string().min(1, "Choose the account"),
  date: isoDay,
  amount: positive,
  method: text(40),
  reference: text(80),
  note: text(500),
  allocations: z
    .array(z.object({ invoiceId: z.string().optional(), billId: z.string().optional(), amount: amount() }))
    .max(200)
    .transform((l) => l.filter((a) => Number(a.amount) > 0)),
});
export type PaymentInput = z.input<typeof paymentSchema>;

/**
 * Money in from a customer or out to a supplier, in the currency of the account it
 * goes through, split across their open invoices / bills (the rest stays on account).
 */
export async function savePayment(slug: string, input: PaymentInput): Promise<Result<{ id: string }>> {
  const r = await ready(slug);
  if (r.error) return r.error;
  const parsed = paymentSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error, r.t);
  const d = parsed.data;
  const ws = r.workspace.id;
  if (isLocked(r.settings, d.date)) return { ok: false, error: lockedMsg(r.t, r.settings) };
  const [[contact], [acc]] = await Promise.all([
    db.select().from(contacts).where(and(eq(contacts.id, d.contactId), eq(contacts.workspaceId, ws))),
    db.select().from(ledgerAccounts).where(and(eq(ledgerAccounts.id, d.moneyAccountId), eq(ledgerAccounts.workspaceId, ws))),
  ]);
  if (!contact) return { ok: false, error: r.t("Choose who"), fieldErrors: { contactId: r.t("Choose who") } };
  if (!acc?.moneyKind) return { ok: false, error: r.t("Choose the account"), fieldErrors: { moneyAccountId: r.t("Choose the account") } };
  const cur = acc.currency ?? r.settings.baseCurrency;
  const total = cents(d.amount);
  const allocated = d.allocations.reduce((s, a) => s + cents(a.amount), 0);
  if (allocated > total) return { ok: false, error: r.t("You've split more than the payment amount."), fieldErrors: { amount: r.t("You've split more than the payment amount.") } };

  // Each allocation: the document must be this contact's, open, in the same currency, and not overpaid.
  const invIds = d.allocations.map((a) => a.invoiceId).filter(Boolean) as string[];
  const billIds = d.allocations.map((a) => a.billId).filter(Boolean) as string[];
  const [invs, bls, prior] = await Promise.all([
    invIds.length ? db.select().from(invoices).where(and(eq(invoices.workspaceId, ws), inArray(invoices.id, invIds))) : [],
    billIds.length ? db.select().from(bills).where(and(eq(bills.workspaceId, ws), inArray(bills.id, billIds))) : [],
    invIds.length || billIds.length
      ? db
          .select({ invoiceId: paymentAllocations.invoiceId, billId: paymentAllocations.billId, s: sql<string>`sum(${paymentAllocations.amount})` })
          .from(paymentAllocations)
          .where(eq(paymentAllocations.workspaceId, ws))
          .groupBy(paymentAllocations.invoiceId, paymentAllocations.billId)
      : [],
  ]);
  for (const a of d.allocations) {
    const doc = a.invoiceId ? invs.find((x) => x.id === a.invoiceId) : bls.find((x) => x.id === a.billId);
    const isInv = Boolean(a.invoiceId);
    if (!doc || doc.contactId !== contact.id || (isInv ? (doc as typeof invoices.$inferSelect).status !== "issued" : (doc as typeof bills.$inferSelect).status !== "open") || (isInv ? d.direction !== "in" : d.direction !== "out"))
      return { ok: false, error: r.t("Choose one of the options") };
    if (doc.currency !== cur) return { ok: false, error: r.t("{code} is in {currency}. Receive it into an account in the same currency.", { code: isInv ? invoiceCode(doc.number) : billCode(doc.number), currency: doc.currency }) };
    const totals = isInv ? invoiceTotals(doc.items, doc.taxRate, (doc as typeof invoices.$inferSelect).retentionPercent) : invoiceTotals(doc.items, doc.taxRate);
    const already = cents(prior.find((p) => (isInv ? p.invoiceId === doc.id : p.billId === doc.id))?.s);
    if (already + cents(a.amount) > totals.total) return { ok: false, error: r.t("That's more than is left on {code}.", { code: isInv ? invoiceCode(doc.number) : billCode(doc.number) }) };
  }

  const row = await db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${"payment-no:" + ws + d.direction}))`);
    const [m] = await tx.select({ n: max(finPayments.number) }).from(finPayments).where(and(eq(finPayments.workspaceId, ws), eq(finPayments.direction, d.direction)));
    const number = (m?.n ?? 0) + 1;
    const [p] = await tx
      .insert(finPayments)
      .values({ workspaceId: ws, number, direction: d.direction, contactId: contact.id, moneyAccountId: acc.id, date: d.date, amount: d.amount, currency: cur, method: d.method, reference: d.reference, note: d.note, createdById: r.user.id })
      .returning({ id: finPayments.id });
    if (d.allocations.length)
      await tx.insert(paymentAllocations).values(d.allocations.map((a) => ({ workspaceId: ws, paymentId: p.id, invoiceId: a.invoiceId ?? null, billId: a.billId ?? null, amount: a.amount })));
    await tx.insert(activities).values({ workspaceId: ws, actorId: r.user.id, type: d.direction === "in" ? "payment.received" : "payment.made", data: { code: paymentCode(d.direction, number), name: contact.name, amount: d.amount, currency: cur } });
    return p;
  });
  refresh();
  return { ok: true, data: { id: row.id } };
}

export async function deletePayment(id: string, slug: string): Promise<Result> {
  const r = await ready(slug);
  if (r.error) return r.error;
  const [p] = await db.select().from(finPayments).where(and(eq(finPayments.id, id), eq(finPayments.workspaceId, r.workspace.id)));
  if (!p) return { ok: false, error: r.t("Not found") };
  if (isLocked(r.settings, p.date)) return { ok: false, error: lockedMsg(r.t, r.settings) };
  await db.delete(finPayments).where(eq(finPayments.id, id));
  await log(r.workspace.id, r.user.id, "payment.deleted", { code: paymentCode(p.direction, p.number), amount: p.amount, currency: p.currency });
  refresh();
  return { ok: true };
}

// =============================== Transfers & manual entries ===============================

const transferSchema = z
  .object({ date: isoDay, fromAccountId: z.string().min(1), toAccountId: z.string().min(1), amount: positive, amountTo: amount().optional().nullable().transform((v) => (v ? v : null)), note: text(300) })
  .refine((v) => v.fromAccountId !== v.toAccountId, { path: ["toAccountId"], message: "Choose two different accounts" });

export async function saveTransfer(slug: string, input: z.input<typeof transferSchema>): Promise<Result> {
  const r = await ready(slug);
  if (r.error) return r.error;
  const parsed = transferSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error, r.t);
  if (isLocked(r.settings, parsed.data.date)) return { ok: false, error: lockedMsg(r.t, r.settings) };
  const accs = await db.select().from(ledgerAccounts).where(and(eq(ledgerAccounts.workspaceId, r.workspace.id), inArray(ledgerAccounts.id, [parsed.data.fromAccountId, parsed.data.toAccountId])));
  if (accs.length !== 2 || accs.some((a) => !a.moneyKind)) return { ok: false, error: r.t("Choose one of the options") };
  await db.insert(transfers).values({ ...parsed.data, workspaceId: r.workspace.id, createdById: r.user.id });
  refresh();
  return { ok: true };
}

export async function deleteTransfer(slug: string, id: string): Promise<Result> {
  const r = await ready(slug);
  if (r.error) return r.error;
  const [tr] = await db.select().from(transfers).where(and(eq(transfers.id, id), eq(transfers.workspaceId, r.workspace.id)));
  if (!tr) return { ok: false, error: r.t("Not found") };
  if (isLocked(r.settings, tr.date)) return { ok: false, error: lockedMsg(r.t, r.settings) };
  await db.delete(transfers).where(eq(transfers.id, id));
  refresh();
  return { ok: true };
}

const journalSchema = z.object({
  date: isoDay,
  memo: z.string().trim().min(2, "Say what this entry is for").max(200),
  lines: z
    .array(z.object({ accountId: z.string().min(1, "Choose an account"), debit: amount().optional().transform((v) => v || "0"), credit: amount().optional().transform((v) => v || "0"), projectId: text(64), description: text(200) }))
    .min(2, "An entry needs at least two lines")
    .max(100),
});
export type JournalInput = z.input<typeof journalSchema>;

/** A manual entry for an accountant (debits must equal credits). */
export async function saveJournalEntry(slug: string, id: string | null, input: JournalInput): Promise<Result> {
  const r = await ready(slug);
  if (r.error) return r.error;
  const parsed = journalSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error, r.t);
  const d = parsed.data;
  const ws = r.workspace.id;
  if (isLocked(r.settings, d.date)) return { ok: false, error: lockedMsg(r.t, r.settings) };
  const lns = d.lines.filter((l) => cents(l.debit) || cents(l.credit));
  if (lns.some((l) => cents(l.debit) && cents(l.credit))) return { ok: false, error: r.t("Each line is either a debit or a credit, not both.") };
  if (lns.some((l) => cents(l.debit) < 0 || cents(l.credit) < 0)) return { ok: false, error: r.t("Enter amounts greater than 0") };
  const dr = lns.reduce((s, l) => s + cents(l.debit), 0);
  const cr = lns.reduce((s, l) => s + cents(l.credit), 0);
  if (lns.length < 2 || dr !== cr || dr === 0) return { ok: false, error: r.t("Debits and credits must be equal (and not zero).") };
  const accIds = [...new Set(lns.map((l) => l.accountId))];
  const found = await db.select({ id: ledgerAccounts.id }).from(ledgerAccounts).where(and(eq(ledgerAccounts.workspaceId, ws), inArray(ledgerAccounts.id, accIds)));
  if (found.length !== accIds.length) return { ok: false, error: r.t("Choose an account") };
  await db.transaction(async (tx) => {
    let entryId = id;
    if (id) {
      const [old] = await tx.select().from(journalEntries).where(and(eq(journalEntries.id, id), eq(journalEntries.workspaceId, ws)));
      if (!old || old.source !== "manual" || isLocked(r.settings, old.date)) throw new Error(r.t("Not found"));
      await tx.update(journalEntries).set({ date: d.date, memo: d.memo, updatedAt: new Date() }).where(eq(journalEntries.id, id));
      await tx.delete(journalLines).where(eq(journalLines.entryId, id));
    } else {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${"ledger:" + ws}))`);
      const [{ n }] = await tx.select({ n: sql<number>`coalesce(max(${journalEntries.number}), 0)` }).from(journalEntries).where(eq(journalEntries.workspaceId, ws));
      const [row] = await tx.insert(journalEntries).values({ workspaceId: ws, number: Number(n) + 1, date: d.date, memo: d.memo, source: "manual", createdById: r.user.id }).returning({ id: journalEntries.id });
      entryId = row.id;
    }
    await tx.insert(journalLines).values(
      lns.map((l) => ({
        workspaceId: ws,
        entryId: entryId!,
        accountId: l.accountId,
        debit: l.debit,
        credit: l.credit,
        currency: r.settings.baseCurrency,
        amountFx: (cents(l.debit) - cents(l.credit) === 0 ? 0 : (cents(l.debit) - cents(l.credit)) / 100).toFixed(2),
        projectId: l.projectId,
        description: l.description,
      })),
    );
  });
  await log(ws, r.user.id, "journal.saved", { memo: d.memo });
  refresh();
  return { ok: true };
}

export async function deleteJournalEntry(slug: string, id: string): Promise<Result> {
  const r = await ready(slug);
  if (r.error) return r.error;
  const [e] = await db.select().from(journalEntries).where(and(eq(journalEntries.id, id), eq(journalEntries.workspaceId, r.workspace.id)));
  if (!e || e.source !== "manual") return { ok: false, error: r.t("Automatic entries change with the record they come from.") };
  if (isLocked(r.settings, e.date)) return { ok: false, error: lockedMsg(r.t, r.settings) };
  await db.delete(journalEntries).where(eq(journalEntries.id, id));
  refresh();
  return { ok: true };
}

// =============================== Budget ===============================

export async function saveBudget(slug: string, year: number, rows: { accountId: string; months: string[] }[]): Promise<Result> {
  const r = await ready(slug);
  if (r.error) return r.error;
  if (!Number.isInteger(year) || year < 2000 || year > 2100) return { ok: false, error: r.t("Choose a year") };
  const clean = rows
    .slice(0, 300)
    .map((x) => ({ accountId: x.accountId, months: Array.from({ length: 12 }, (_, i) => String(x.months[i] ?? "").replace(/,/g, "").trim() || "0") }));
  if (clean.some((x) => x.months.some((m) => !/^\d{1,13}(\.\d{1,2})?$/.test(m)))) return { ok: false, error: r.t("Enter amounts like 1500 or 1500.50") };
  const ids = [...new Set(clean.map((x) => x.accountId))];
  const valid = ids.length ? await db.select({ id: ledgerAccounts.id }).from(ledgerAccounts).where(and(eq(ledgerAccounts.workspaceId, r.workspace.id), inArray(ledgerAccounts.id, ids))) : [];
  const ok = new Set(valid.map((v) => v.id));
  await db.transaction(async (tx) => {
    for (const x of clean) {
      if (!ok.has(x.accountId)) continue;
      if (x.months.every((m) => Number(m) === 0)) await tx.delete(budgets).where(and(eq(budgets.workspaceId, r.workspace.id), eq(budgets.year, year), eq(budgets.accountId, x.accountId)));
      else
        await tx
          .insert(budgets)
          .values({ workspaceId: r.workspace.id, year, accountId: x.accountId, months: x.months })
          .onConflictDoUpdate({ target: [budgets.workspaceId, budgets.year, budgets.accountId], set: { months: x.months, updatedAt: new Date() } });
    }
  });
  refresh();
  return { ok: true };
}

/** Which cash box / bank paid a project expense (Finance). */
export async function setExpenseMoneyAccount(slug: string, expenseId: string, accountId: string): Promise<Result> {
  const r = await ready(slug);
  if (r.error) return r.error;
  const [[e], [acc]] = await Promise.all([
    db.select().from(expenses).where(and(eq(expenses.id, expenseId), eq(expenses.workspaceId, r.workspace.id))),
    db.select().from(ledgerAccounts).where(and(eq(ledgerAccounts.id, accountId), eq(ledgerAccounts.workspaceId, r.workspace.id))),
  ]);
  if (!e || !acc?.moneyKind) return { ok: false, error: r.t("Not found") };
  if (isLocked(r.settings, e.date)) return { ok: false, error: lockedMsg(r.t, r.settings) };
  await db.update(expenses).set({ moneyAccountId: accountId }).where(eq(expenses.id, expenseId));
  refresh();
  return { ok: true };
}

