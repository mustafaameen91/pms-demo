/** Loan arithmetic (pure). Money is handled in cents so 0.1 + 0.2 problems can't creep in. */

export const REPAYMENT_METHODS = [
  { value: "cash", label: "Cash" },
  { value: "bank_transfer", label: "Bank transfer" },
  { value: "salary_deduction", label: "Salary deduction" },
  { value: "other", label: "Other" },
] as const;
export type RepaymentMethod = (typeof REPAYMENT_METHODS)[number]["value"];

const cents = (v: string | number) => Math.round(Number(v) * 100);
const fromCents = (c: number) => (c / 100).toFixed(2);

export type LoanBalance = {
  amount: string;
  /** Everything that settles it: repayments (cash returned) + approved receipts. */
  paid: string;
  /** Repayments / cash brought back. */
  returned: string;
  /** Approved receipts (advances only). */
  spent: string;
  /** Receipts waiting for approval (advances only); not settled yet. */
  pending: string;
  balance: string;
  /** What can still be returned or claimed with receipts: balance minus receipts waiting for approval. */
  open: string;
  /** 0–100, for a progress bar. */
  paidPct: number;
  paidOff: boolean;
};

/**
 * Where a loan stands. A personal loan is settled by repayments; a project
 * advance also by receipts (expenses) bought with it, once they're approved.
 */
export function loanBalance(
  amount: string | number,
  repayments: { amount: string | number }[],
  receipts: { amount: string | number; approvalStatus: string }[] = [],
): LoanBalance {
  const total = cents(amount);
  const returned = repayments.reduce((sum, r) => sum + cents(r.amount), 0);
  const spent = receipts.filter((r) => r.approvalStatus === "approved").reduce((sum, r) => sum + cents(r.amount), 0);
  const pending = receipts.filter((r) => r.approvalStatus === "pending").reduce((sum, r) => sum + cents(r.amount), 0);
  const paid = returned + spent;
  const balance = Math.max(0, total - paid);
  return {
    amount: fromCents(total),
    paid: fromCents(paid),
    returned: fromCents(returned),
    spent: fromCents(spent),
    pending: fromCents(pending),
    balance: fromCents(balance),
    open: fromCents(Math.max(0, balance - pending)),
    paidPct: total > 0 ? Math.min(100, Math.round((paid / total) * 100)) : 0,
    paidOff: total > 0 && paid >= total,
  };
}

/** A repayment must be more than 0 and not more than what's still owed. Returns an English error or null. */
export function checkRepayment(amount: string, balance: string): string | null {
  if (!/^\d+(\.\d{1,2})?$/.test(amount.trim()) || cents(amount) <= 0) return "Enter an amount greater than 0";
  if (cents(amount) > cents(balance)) return "That's more than the remaining balance of {balance}";
  return null;
}

/** Outstanding balances added up per currency (loans in different currencies aren't mixed). */
export function totalsByCurrency(rows: { currency: string; amount: string; balance: string }[]) {
  const map = new Map<string, { lent: number; outstanding: number; count: number }>();
  for (const r of rows) {
    const t = map.get(r.currency) ?? { lent: 0, outstanding: 0, count: 0 };
    t.lent += cents(r.amount);
    t.outstanding += cents(r.balance);
    if (cents(r.balance) > 0) t.count += 1;
    map.set(r.currency, t);
  }
  return [...map].map(([currency, t]) => ({ currency, lent: fromCents(t.lent), outstanding: fromCents(t.outstanding), active: t.count }));
}
