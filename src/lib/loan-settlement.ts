import "server-only";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { expenses, loanRepayments, loans } from "@/lib/db/schema";
import { loanBalance } from "@/lib/loans";

/** Where a loan stands now: repayments plus, for a project advance, its receipts. */
export async function currentBalance(loan: { id: string; amount: string }) {
  const [repayments, receipts] = await Promise.all([
    db.select({ amount: loanRepayments.amount }).from(loanRepayments).where(eq(loanRepayments.loanId, loan.id)),
    db.select({ amount: expenses.amount, approvalStatus: expenses.approvalStatus }).from(expenses).where(eq(expenses.loanId, loan.id)),
  ]);
  return loanBalance(loan.amount, repayments, receipts);
}

/** Keeps "paid off" in step with repayments and approved receipts. */
export async function syncPaidOff(loanId: string) {
  const [loan] = await db.select().from(loans).where(eq(loans.id, loanId)).limit(1);
  if (!loan) return null;
  const balance = await currentBalance(loan);
  if (balance.paidOff && !loan.paidOffAt) await db.update(loans).set({ paidOffAt: new Date() }).where(eq(loans.id, loanId));
  if (!balance.paidOff && loan.paidOffAt) await db.update(loans).set({ paidOffAt: null }).where(eq(loans.id, loanId));
  return { loan, balance, justPaidOff: balance.paidOff && !loan.paidOffAt };
}
