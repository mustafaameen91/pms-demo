import "server-only";
import { cache } from "react";
import { and, asc, eq, gte, inArray, isNotNull, ne, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  bills,
  contacts,
  expenses,
  financeSettings,
  fxRates,
  invoices,
  journalEntries,
  journalLines,
  ledgerAccounts,
  ledgerIssues,
  loanRepayments,
  loans,
  paymentAllocations,
  finPayments,
  payrollRuns,
  payslips,
  projects,
  resources,
  transfers,
  user,
} from "@/lib/db/schema";
import {
  MissingRate,
  cents,
  entryHash,
  invoiceTotals,
  postBill,
  postExpense,
  postInvoice,
  postLoan,
  postOpening,
  postPayment,
  postPayroll,
  postPayrollPaid,
  postRepayment,
  postTransfer,
  toPosted,
  type DraftEntry,
} from "./core";
import { monthDays } from "@/lib/hr-rules";

export type FinanceSettings = typeof financeSettings.$inferSelect;

export const getFinanceSettings = cache(async (workspaceId: string) => {
  const [row] = await db.select().from(financeSettings).where(eq(financeSettings.workspaceId, workspaceId)).limit(1);
  return row ?? null;
});

export const invoiceCode = (n: number) => `INV-${String(n).padStart(4, "0")}`;
export const billCode = (n: number) => `BILL-${String(n).padStart(4, "0")}`;
export const paymentCode = (direction: string, n: number) => `${direction === "in" ? "RC" : "PV"}-${String(n).padStart(4, "0")}`;

/** Rate lookup: 1 for the main currency; else the latest rate on or before the date (or the earliest one after, if none before). */
export async function rateLookup(workspaceId: string, base: string) {
  const rows = await db.select().from(fxRates).where(eq(fxRates.workspaceId, workspaceId)).orderBy(asc(fxRates.date));
  const by = new Map<string, { date: string; rate: number }[]>();
  for (const r of rows) by.set(r.currency, [...(by.get(r.currency) ?? []), { date: r.date, rate: Number(r.rate) }]);
  return (currency: string, date: string): number | null => {
    if (currency === base) return 1;
    const list = by.get(currency);
    if (!list?.length) return null;
    let found = list[0].rate;
    for (const r of list) if (r.date <= date) found = r.rate;
    return found;
  };
}

/** Everything that should be in the books, built from the records. */
async function buildDrafts(workspaceId: string, s: FinanceSettings) {
  const base = s.baseCurrency;
  const start = s.startDate;
  const rate = await rateLookup(workspaceId, base);
  const fallback = s.defaultMoneyAccountId!;
  const [accts, invs, bls, pays, allocs, exps, lns, reps, runs, trs] = await Promise.all([
    db.select().from(ledgerAccounts).where(eq(ledgerAccounts.workspaceId, workspaceId)),
    db.select().from(invoices).where(and(eq(invoices.workspaceId, workspaceId), eq(invoices.status, "issued"))),
    db.select().from(bills).where(and(eq(bills.workspaceId, workspaceId), eq(bills.status, "open"))),
    db.select().from(finPayments).where(and(eq(finPayments.workspaceId, workspaceId), gte(finPayments.date, start))),
    db.select().from(paymentAllocations).where(eq(paymentAllocations.workspaceId, workspaceId)),
    db
      .select({ e: expenses, currency: projects.currency })
      .from(expenses)
      .innerJoin(projects, eq(projects.id, expenses.projectId))
      .where(and(eq(expenses.workspaceId, workspaceId), eq(expenses.approvalStatus, "approved"), gte(expenses.date, start))),
    db
      .select({ l: loans, userName: user.name, workerName: resources.name })
      .from(loans)
      .leftJoin(user, eq(user.id, loans.borrowerUserId))
      .leftJoin(resources, eq(resources.id, loans.borrowerResourceId))
      .where(and(eq(loans.workspaceId, workspaceId), gte(loans.issuedOn, start))),
    db
      .select({ r: loanRepayments, currency: loans.currency, userName: user.name, workerName: resources.name })
      .from(loanRepayments)
      .innerJoin(loans, eq(loans.id, loanRepayments.loanId))
      .leftJoin(user, eq(user.id, loans.borrowerUserId))
      .leftJoin(resources, eq(resources.id, loans.borrowerResourceId))
      .where(and(eq(loanRepayments.workspaceId, workspaceId), ne(loanRepayments.method, "salary_deduction"), gte(loanRepayments.paidOn, start))),
    db.select().from(payrollRuns).where(and(eq(payrollRuns.workspaceId, workspaceId), inArray(payrollRuns.status, ["approved", "paid"]))),
    db.select().from(transfers).where(and(eq(transfers.workspaceId, workspaceId), gte(transfers.date, start))),
  ]);
  const accountCurrency = new Map(accts.map((a) => [a.id, a.currency ?? base]));
  const slips = runs.length ? await db.select().from(payslips).where(inArray(payslips.runId, runs.map((r) => r.id))) : [];
  const invById = new Map(invs.map((i) => [i.id, i]));
  const billById = new Map(bls.map((b) => [b.id, b]));
  const payById = new Map(pays.map((p) => [p.id, p]));

  const drafts: DraftEntry[] = [];
  const issues: { sourceKey: string; kind: string; detail: Record<string, unknown> }[] = [];
  const add = (key: string, make: () => DraftEntry) => {
    try {
      drafts.push(make());
    } catch (e) {
      if (e instanceof MissingRate) issues.push({ sourceKey: key, kind: "rate", detail: { currency: e.currency, date: e.date } });
      else throw e;
    }
  };

  for (const a of accts)
    if (a.moneyKind && cents(a.openingBalance) !== 0)
      add(`opening:${a.id}`, () => postOpening({ id: a.id, date: start, amount: a.openingBalance, currency: a.currency ?? base }, rate, base));

  for (const i of invs) if (i.date >= start) add(`invoice:${i.id}`, () => postInvoice({ ...i, code: invoiceCode(i.number) }, rate, base));
  for (const b of bls) if (b.date >= start) add(`bill:${b.id}`, () => postBill({ ...b, code: billCode(b.number) }, rate, base));

  // Allocations to an invoice beyond what's due now settle its retention, oldest payment first.
  const invAllocs = new Map<string, typeof allocs>();
  for (const a of allocs) if (a.invoiceId) invAllocs.set(a.invoiceId, [...(invAllocs.get(a.invoiceId) ?? []), a]);
  const retentionPart = new Map<string, number>();
  for (const [invoiceId, list] of invAllocs) {
    const inv = invById.get(invoiceId);
    if (!inv) continue;
    const due = invoiceTotals(inv.items, inv.taxRate, inv.retentionPercent).due;
    let run = 0;
    const ordered = [...list].sort((x, y) => (payById.get(x.paymentId)?.date ?? "").localeCompare(payById.get(y.paymentId)?.date ?? "") || x.id.localeCompare(y.id));
    for (const a of ordered) {
      const amt = cents(a.amount);
      const normal = Math.min(amt, Math.max(0, due - run));
      run += amt;
      if (amt - normal > 0) retentionPart.set(a.id, amt - normal);
    }
  }
  for (const p of pays) {
    const mine = allocs.filter((a) => a.paymentId === p.id);
    add(`payment:${p.id}`, () => {
      const lines = mine.flatMap((a) => {
        const doc = a.invoiceId ? invById.get(a.invoiceId) : a.billId ? billById.get(a.billId) : undefined;
        // An allocation to a document that isn't in the books any more is treated as on account.
        if (!doc || doc.date < start) return [];
        const docRate = rate(doc.currency, doc.date);
        if (docRate === null) throw new MissingRate(doc.currency, doc.date);
        const ret = retentionPart.get(a.id) ?? 0;
        const amt = cents(a.amount);
        const out = [{ amount: ((amt - ret) / 100).toFixed(2), docRate, docCurrency: doc.currency, projectId: doc.projectId }];
        if (ret) out.push({ amount: (ret / 100).toFixed(2), docRate, docCurrency: doc.currency, projectId: doc.projectId, retention: true } as never);
        return out.filter((o) => Number(o.amount) > 0);
      });
      return postPayment({ ...p, direction: p.direction as "in" | "out", code: paymentCode(p.direction, p.number) }, lines, rate, base);
    });
  }

  for (const { e, currency } of exps)
    add(`expense:${e.id}`, () => postExpense({ ...e, currency, moneyAccountId: e.moneyAccountId ?? fallback }, rate, base));

  for (const { l, userName, workerName } of lns)
    add(`loan:${l.id}`, () => postLoan({ ...l, moneyAccountId: l.moneyAccountId ?? fallback, borrower: userName ?? workerName ?? "" }, rate, base));
  for (const { r, currency, userName, workerName } of reps)
    add(`repayment:${r.id}`, () => postRepayment({ ...r, currency, moneyAccountId: r.moneyAccountId ?? fallback, borrower: userName ?? workerName ?? "" }, rate, base));

  for (const run of runs) {
    const monthEnd = monthDays(run.month).at(-1)!;
    const paidOn = run.status === "paid" && run.paidAt ? run.paidAt.toISOString().slice(0, 10) : null;
    // Salaries are a cost at month end; paid early, both are on the day the money left.
    const date = paidOn && paidOn < monthEnd ? paidOn : monthEnd;
    if (date < start) continue;
    const mine = slips.filter((x) => x.runId === run.id);
    if (mine.length === 0) continue;
    add(`payroll:${run.id}`, () => postPayroll({ id: run.id, month: run.month, date }, mine, rate, base));
    if (paidOn) {
      const nets = new Map<string, number>();
      for (const x of mine) nets.set(x.currency, (nets.get(x.currency) ?? 0) + cents(x.net));
      add(`payroll_paid:${run.id}`, () =>
        postPayrollPaid({ id: run.id, month: run.month, date: paidOn < date ? date : paidOn, moneyAccountId: run.paidFromAccountId ?? fallback }, [...nets].map(([currency, net]) => ({ currency, net })), rate, base),
      );
    }
  }

  for (const tr of trs)
    add(`transfer:${tr.id}`, () => postTransfer({ ...tr, fromCurrency: accountCurrency.get(tr.fromAccountId) ?? base, toCurrency: accountCurrency.get(tr.toAccountId) ?? base }, rate, base));

  return { drafts, issues, accts };
}

/**
 * Brings the automatic part of the books in line with the records: new entries
 * are added, changed ones rewritten, removed ones deleted. Entries in a closed
 * period are never changed; differences there are listed as issues instead.
 * Safe to call often (one company at a time, under a lock).
 */
export async function syncLedger(workspaceId: string) {
  const s = await getFinanceSettings(workspaceId);
  if (!s || !s.defaultMoneyAccountId) return;
  const { drafts, issues, accts } = await buildDrafts(workspaceId, s);
  const byKey = new Map(accts.filter((a) => a.systemKey).map((a) => [a.systemKey!, a.id]));
  const ids = new Set(accts.map((a) => a.id));
  const resolve = (account: string) => byKey.get(account) ?? (ids.has(account) ? account : "");
  const locked = s.lockedUntil;

  await db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${"ledger:" + workspaceId}))`);
    const existing = await tx
      .select({ id: journalEntries.id, sourceKey: journalEntries.sourceKey, hash: journalEntries.hash, date: journalEntries.date })
      .from(journalEntries)
      .where(and(eq(journalEntries.workspaceId, workspaceId), isNotNull(journalEntries.sourceKey)));
    const have = new Map(existing.map((e) => [e.sourceKey!, e]));
    const [{ n }] = await tx.select({ n: sql<number>`coalesce(max(${journalEntries.number}), 0)` }).from(journalEntries).where(eq(journalEntries.workspaceId, workspaceId));
    let next = Number(n);
    const wanted = new Set<string>();

    for (const d of drafts) {
      wanted.add(d.sourceKey);
      if (d.lines.some((l) => !resolve(l.account))) {
        issues.push({ sourceKey: d.sourceKey, kind: "account", detail: {} });
        continue;
      }
      const hash = entryHash(d, resolve);
      const old = have.get(d.sourceKey);
      if (old?.hash === hash) continue;
      if (locked && (d.date <= locked || (old && old.date <= locked))) {
        issues.push({ sourceKey: d.sourceKey, kind: "locked", detail: { date: d.date } });
        continue;
      }
      let entryId = old?.id;
      if (entryId) {
        await tx.update(journalEntries).set({ date: d.date, memo: d.memo, projectId: d.projectId ?? null, hash, updatedAt: new Date() }).where(eq(journalEntries.id, entryId));
        await tx.delete(journalLines).where(eq(journalLines.entryId, entryId));
      } else {
        const [row] = await tx
          .insert(journalEntries)
          .values({ workspaceId, number: ++next, date: d.date, memo: d.memo, source: d.source, sourceId: d.sourceId, sourceKey: d.sourceKey, hash, projectId: d.projectId ?? null })
          .returning({ id: journalEntries.id });
        entryId = row.id;
      }
      await tx.insert(journalLines).values(
        d.lines.map((l) => {
          const p = toPosted(l);
          return {
            workspaceId,
            entryId: entryId!,
            accountId: resolve(l.account),
            debit: (p.debit / 100).toFixed(2),
            credit: (p.credit / 100).toFixed(2),
            currency: l.currency,
            amountFx: (l.fx / 100).toFixed(2),
            projectId: l.projectId ?? d.projectId ?? null,
            contactId: l.contactId ?? null,
            description: l.description ?? null,
          };
        }),
      );
    }
    // Records that were removed or no longer post (draft again, rejected expense…).
    const stale = existing.filter((e) => !wanted.has(e.sourceKey!) && !issues.some((i) => i.sourceKey === e.sourceKey && i.kind === "rate"));
    const removable = stale.filter((e) => !(locked && e.date <= locked));
    for (const e of stale) if (locked && e.date <= locked) issues.push({ sourceKey: e.sourceKey!, kind: "locked", detail: { date: e.date, removed: true } });
    if (removable.length) await tx.delete(journalEntries).where(inArray(journalEntries.id, removable.map((e) => e.id)));

    await tx.delete(ledgerIssues).where(eq(ledgerIssues.workspaceId, workspaceId));
    const unique = [...new Map(issues.map((i) => [i.sourceKey, i])).values()];
    if (unique.length) await tx.insert(ledgerIssues).values(unique.map((i) => ({ ...i, workspaceId })));
  });
}

/** Sync once per request before showing anything from the books. */
export const ensureLedger = cache((workspaceId: string) => syncLedger(workspaceId));

/** All posted lines with their entry's date and source (for reports). */
export async function postedLines(workspaceId: string) {
  const rows = await db
    .select({
      accountId: journalLines.accountId,
      debit: journalLines.debit,
      credit: journalLines.credit,
      projectId: journalLines.projectId,
      contactId: journalLines.contactId,
      currency: journalLines.currency,
      amountFx: journalLines.amountFx,
      date: journalEntries.date,
      source: journalEntries.source,
      entryId: journalEntries.id,
    })
    .from(journalLines)
    .innerJoin(journalEntries, eq(journalEntries.id, journalLines.entryId))
    .where(eq(journalLines.workspaceId, workspaceId));
  return rows.map((r) => ({ ...r, debit: cents(r.debit), credit: cents(r.credit), fx: cents(r.amountFx) }));
}

export async function listAccounts(workspaceId: string) {
  return db.select().from(ledgerAccounts).where(eq(ledgerAccounts.workspaceId, workspaceId)).orderBy(asc(ledgerAccounts.code));
}

export async function listContacts(workspaceId: string) {
  return db.select().from(contacts).where(eq(contacts.workspaceId, workspaceId)).orderBy(asc(contacts.name));
}
