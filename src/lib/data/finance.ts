import "server-only";
import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import { bills, budgets, contacts, documents, finPayments, fxRates, invoices, journalEntries, journalLines, ledgerAccounts, ledgerIssues, paymentAllocations, projects, transfers, user } from "@/lib/db/schema";
import { cents, invoiceState, invoiceTotals } from "@/lib/finance/core";
import { billCode, invoiceCode, paymentCode } from "@/lib/finance/ledger";
import { getProjectHealth } from "@/lib/data/project-health";
import type { WorkspaceRole } from "@/lib/auth/session";

const sumBy = <K,>(rows: { key: K; amount: string }[]) => {
  const m = new Map<K, number>();
  for (const r of rows) m.set(r.key, (m.get(r.key) ?? 0) + cents(r.amount));
  return m;
};

export async function invoiceRows(workspaceId: string, today: string, filter: { contactId?: string; projectId?: string } = {}) {
  const rows = await db
    .select({ inv: invoices, contact: contacts.name, project: projects.name, projectKey: projects.key })
    .from(invoices)
    .innerJoin(contacts, eq(contacts.id, invoices.contactId))
    .leftJoin(projects, eq(projects.id, invoices.projectId))
    .where(and(eq(invoices.workspaceId, workspaceId), filter.contactId ? eq(invoices.contactId, filter.contactId) : undefined, filter.projectId ? eq(invoices.projectId, filter.projectId) : undefined))
    .orderBy(desc(invoices.date), desc(invoices.number));
  const paid = rows.length
    ? sumBy(
        (await db.select({ key: paymentAllocations.invoiceId, amount: paymentAllocations.amount }).from(paymentAllocations).where(inArray(paymentAllocations.invoiceId, rows.map((r) => r.inv.id)))).map((x) => ({
          key: x.key!,
          amount: x.amount,
        })),
      )
    : new Map<string, number>();
  return rows.map((r) => {
    const t = invoiceTotals(r.inv.items, r.inv.taxRate, r.inv.retentionPercent);
    const p = paid.get(r.inv.id) ?? 0;
    const st = invoiceState({ status: r.inv.status, dueDate: r.inv.dueDate, due: t.due, paid: p }, today);
    // Retention still held: what's left of the total beyond what's due now.
    const retentionOpen = r.inv.status === "issued" ? Math.max(0, t.total - p - st.open) : 0;
    return { ...r, code: invoiceCode(r.inv.number), totals: t, paid: p, open: st.open, state: st.state, retentionOpen };
  });
}
export type InvoiceRow = Awaited<ReturnType<typeof invoiceRows>>[number];

export async function billRows(workspaceId: string, today: string, filter: { contactId?: string } = {}) {
  const rows = await db
    .select({ bill: bills, contact: contacts.name, project: projects.name, account: ledgerAccounts.name })
    .from(bills)
    .innerJoin(contacts, eq(contacts.id, bills.contactId))
    .innerJoin(ledgerAccounts, eq(ledgerAccounts.id, bills.accountId))
    .leftJoin(projects, eq(projects.id, bills.projectId))
    .where(and(eq(bills.workspaceId, workspaceId), filter.contactId ? eq(bills.contactId, filter.contactId) : undefined))
    .orderBy(desc(bills.date), desc(bills.number));
  const paid = rows.length
    ? sumBy(
        (await db.select({ key: paymentAllocations.billId, amount: paymentAllocations.amount }).from(paymentAllocations).where(inArray(paymentAllocations.billId, rows.map((r) => r.bill.id)))).map((x) => ({
          key: x.key!,
          amount: x.amount,
        })),
      )
    : new Map<string, number>();
  return rows.map((r) => {
    const t = invoiceTotals(r.bill.items, r.bill.taxRate);
    const p = paid.get(r.bill.id) ?? 0;
    const st = invoiceState({ status: r.bill.status === "open" ? "issued" : r.bill.status, dueDate: r.bill.dueDate, due: t.total, paid: p }, today);
    return { ...r, code: billCode(r.bill.number), totals: t, paid: p, open: st.open, state: st.state };
  });
}
export type BillRow = Awaited<ReturnType<typeof billRows>>[number];

export async function paymentRows(workspaceId: string, filter: { contactId?: string; accountId?: string } = {}) {
  const rows = await db
    .select({ p: finPayments, contact: contacts.name, account: ledgerAccounts.name, by: user.name })
    .from(finPayments)
    .innerJoin(contacts, eq(contacts.id, finPayments.contactId))
    .innerJoin(ledgerAccounts, eq(ledgerAccounts.id, finPayments.moneyAccountId))
    .leftJoin(user, eq(user.id, finPayments.createdById))
    .where(and(eq(finPayments.workspaceId, workspaceId), filter.contactId ? eq(finPayments.contactId, filter.contactId) : undefined, filter.accountId ? eq(finPayments.moneyAccountId, filter.accountId) : undefined))
    .orderBy(desc(finPayments.date), desc(finPayments.createdAt));
  const allocs = rows.length
    ? await db
        .select({ a: paymentAllocations, invNo: invoices.number, billNo: bills.number })
        .from(paymentAllocations)
        .leftJoin(invoices, eq(invoices.id, paymentAllocations.invoiceId))
        .leftJoin(bills, eq(bills.id, paymentAllocations.billId))
        .where(inArray(paymentAllocations.paymentId, rows.map((r) => r.p.id)))
    : [];
  return rows.map((r) => ({
    ...r,
    code: paymentCode(r.p.direction, r.p.number),
    allocations: allocs
      .filter((a) => a.a.paymentId === r.p.id)
      .map((a) => ({ id: a.a.id, amount: a.a.amount, invoiceId: a.a.invoiceId, billId: a.a.billId, code: a.invNo ? invoiceCode(a.invNo) : a.billNo ? billCode(a.billNo) : "" })),
  }));
}
export type PaymentRow = Awaited<ReturnType<typeof paymentRows>>[number];

export async function listTransfers(workspaceId: string) {
  return db.select().from(transfers).where(eq(transfers.workspaceId, workspaceId)).orderBy(desc(transfers.date));
}

export async function listRates(workspaceId: string) {
  return db.select().from(fxRates).where(eq(fxRates.workspaceId, workspaceId)).orderBy(asc(fxRates.currency), desc(fxRates.date));
}

export async function listIssues(workspaceId: string) {
  return db.select().from(ledgerIssues).where(eq(ledgerIssues.workspaceId, workspaceId));
}

export async function listBudgets(workspaceId: string, year: number) {
  return db.select().from(budgets).where(and(eq(budgets.workspaceId, workspaceId), eq(budgets.year, year)));
}

/** Entries with their lines (newest first), optionally for one account. */
export async function journal(workspaceId: string, opts: { accountId?: string; limit?: number; from?: string; to?: string } = {}) {
  const entries = await db
    .select()
    .from(journalEntries)
    .where(eq(journalEntries.workspaceId, workspaceId))
    .orderBy(desc(journalEntries.date), desc(journalEntries.number))
    .limit(opts.accountId ? 100000 : (opts.limit ?? 200));
  if (entries.length === 0) return [];
  const lines = await db
    .select({ l: journalLines, account: ledgerAccounts.name, code: ledgerAccounts.code, contact: contacts.name, project: projects.key })
    .from(journalLines)
    .innerJoin(ledgerAccounts, eq(ledgerAccounts.id, journalLines.accountId))
    .leftJoin(contacts, eq(contacts.id, journalLines.contactId))
    .leftJoin(projects, eq(projects.id, journalLines.projectId))
    .where(inArray(journalLines.entryId, entries.map((e) => e.id)));
  const out = entries
    .filter((e) => (!opts.from || e.date >= opts.from) && (!opts.to || e.date <= opts.to))
    .map((e) => ({ entry: e, lines: lines.filter((l) => l.l.entryId === e.id) }))
    .filter((e) => !opts.accountId || e.lines.some((l) => l.l.accountId === opts.accountId));
  return opts.accountId ? out.slice(0, opts.limit ?? 500) : out;
}
export type JournalRow = Awaited<ReturnType<typeof journal>>[number];

/**
 * Per project, what a progress invoice needs: accomplishment so far, the contract
 * value (from the project's latest contract document, if any) and what was already billed.
 */
export async function projectBilling(workspace: { id: string; role: WorkspaceRole }, userId: string) {
  const [health, contracts, invs] = await Promise.all([
    getProjectHealth(workspace, userId),
    db
      .select({ projectId: documents.projectId, data: documents.data, status: documents.status, date: documents.date })
      .from(documents)
      .where(and(eq(documents.workspaceId, workspace.id), eq(documents.type, "contract"))),
    db.select().from(invoices).where(and(eq(invoices.workspaceId, workspace.id), inArray(invoices.status, ["issued", "draft"]))),
  ]);
  return health.map((h) => {
    const contract = contracts
      .filter((c) => c.projectId === h.p.id && c.status !== "cancelled" && c.data.value)
      .sort((a, b) => b.date.localeCompare(a.date))[0];
    const billed = invs.filter((i) => i.projectId === h.p.id && i.status === "issued").reduce((s, i) => s + invoiceTotals(i.items, "0").subtotal, 0);
    return {
      id: h.p.id,
      name: h.p.name,
      key: h.p.key,
      currency: h.p.currency,
      client: h.p.client,
      progress: h.accomplishment.actual,
      contractValue: contract?.data.value ?? null,
      billedBefore: billed,
    };
  });
}
export type ProjectBilling = Awaited<ReturnType<typeof projectBilling>>[number];
