/** Finance reports from posted lines (pure; amounts in cents of the main currency). */
import { debitNormal } from "./core";

export type Acc = { id: string; code: string; name: string; type: string; systemKey: string | null; moneyKind: string | null };
export type PostedLine = { accountId: string; date: string; debit: number; credit: number; projectId: string | null; contactId?: string | null; source: string };

const inRange = (d: string, from?: string | null, to?: string | null) => (!from || d >= from) && (!to || d <= to);

/** Debit − credit per account. */
export function balances(lines: PostedLine[], from?: string | null, to?: string | null, projectId?: string | null) {
  const m = new Map<string, number>();
  for (const l of lines) {
    if (!inRange(l.date, from, to)) continue;
    if (projectId !== undefined && projectId !== null && l.projectId !== projectId) continue;
    m.set(l.accountId, (m.get(l.accountId) ?? 0) + l.debit - l.credit);
  }
  return m;
}

/** Balance shown the natural way round (assets/expenses as debit, the rest as credit). */
export const natural = (a: Acc, debitMinusCredit: number) => (debitNormal(a.type) ? debitMinusCredit : -debitMinusCredit);

export function trialBalance(accounts: Acc[], lines: PostedLine[], asOf: string) {
  const b = balances(lines, null, asOf);
  const rows = accounts
    .map((a) => {
      const v = b.get(a.id) ?? 0;
      return { account: a, debit: v > 0 ? v : 0, credit: v < 0 ? -v : 0 };
    })
    .filter((r) => r.debit || r.credit)
    .sort((x, y) => x.account.code.localeCompare(y.account.code));
  const debit = rows.reduce((s, r) => s + r.debit, 0);
  const credit = rows.reduce((s, r) => s + r.credit, 0);
  return { rows, debit, credit, balanced: debit === credit };
}

export function profitAndLoss(accounts: Acc[], lines: PostedLine[], from: string, to: string, projectId?: string | null) {
  const b = balances(lines, from, to, projectId);
  const pick = (type: string) =>
    accounts
      .filter((a) => a.type === type)
      .map((a) => ({ account: a, amount: natural(a, b.get(a.id) ?? 0) }))
      .filter((r) => r.amount !== 0)
      .sort((x, y) => x.account.code.localeCompare(y.account.code));
  const income = pick("income");
  const expenses = pick("expense");
  const totalIncome = income.reduce((s, r) => s + r.amount, 0);
  const totalExpenses = expenses.reduce((s, r) => s + r.amount, 0);
  return { income, expenses, totalIncome, totalExpenses, profit: totalIncome - totalExpenses };
}

/**
 * Balance sheet on a date. Profit isn't moved into equity by a year-end entry;
 * it's shown as "profit kept in the business" so the sheet always balances.
 */
export function balanceSheet(accounts: Acc[], lines: PostedLine[], asOf: string) {
  const b = balances(lines, null, asOf);
  const pick = (type: string) =>
    accounts
      .filter((a) => a.type === type)
      .map((a) => ({ account: a, amount: natural(a, b.get(a.id) ?? 0) }))
      .filter((r) => r.amount !== 0)
      .sort((x, y) => x.account.code.localeCompare(y.account.code));
  const assets = pick("asset");
  const liabilities = pick("liability");
  const equity = pick("equity");
  const income = accounts.filter((a) => a.type === "income").reduce((s, a) => s + natural(a, b.get(a.id) ?? 0), 0);
  const expense = accounts.filter((a) => a.type === "expense").reduce((s, a) => s + natural(a, b.get(a.id) ?? 0), 0);
  const profit = income - expense;
  const totalAssets = assets.reduce((s, r) => s + r.amount, 0);
  const totalLiabilities = liabilities.reduce((s, r) => s + r.amount, 0);
  const totalEquity = equity.reduce((s, r) => s + r.amount, 0) + profit;
  return { assets, liabilities, equity, profit, totalAssets, totalLiabilities, totalEquity, balanced: totalAssets === totalLiabilities + totalEquity };
}

export const CASH_GROUPS = {
  payment_in: "From customers",
  payment_out: "To suppliers",
  expense: "Project expenses",
  payroll_paid: "Salaries",
  loan: "Loans and advances given",
  repayment: "Loan repayments received",
  opening: "Opening balances",
  manual: "Other (manual entries)",
} as const;

/** Money in and out of the cash and bank accounts, by where it came from / went. */
export function cashFlow(accounts: Acc[], lines: (PostedLine & { direction?: "in" | "out" })[], from: string, to: string) {
  const money = new Set(accounts.filter((a) => a.moneyKind).map((a) => a.id));
  const groups = new Map<string, number>();
  let start = 0;
  let end = 0;
  for (const l of lines) {
    if (!money.has(l.accountId)) continue;
    const v = l.debit - l.credit;
    if (l.date < from) start += v;
    if (l.date <= to) end += v;
    if (!inRange(l.date, from, to) || l.source === "transfer") continue;
    const key = l.source === "payment" ? (v >= 0 ? "payment_in" : "payment_out") : l.source in CASH_GROUPS ? l.source : "manual";
    groups.set(key, (groups.get(key) ?? 0) + v);
  }
  const rows = (Object.keys(CASH_GROUPS) as (keyof typeof CASH_GROUPS)[]).filter((k) => groups.get(k)).map((k) => ({ key: k, label: CASH_GROUPS[k], amount: groups.get(k)! }));
  return { start, end, rows, change: end - start };
}

/** Income, costs and profit per project (lines tagged with a project). */
export function projectProfit(accounts: Acc[], lines: PostedLine[], from?: string | null, to?: string | null) {
  const type = new Map(accounts.map((a) => [a.id, a.type]));
  const m = new Map<string, { income: number; costs: number }>();
  for (const l of lines) {
    if (!l.projectId || !inRange(l.date, from, to)) continue;
    const t = type.get(l.accountId);
    if (t !== "income" && t !== "expense") continue;
    const p = m.get(l.projectId) ?? { income: 0, costs: 0 };
    if (t === "income") p.income += l.credit - l.debit;
    else p.costs += l.debit - l.credit;
    m.set(l.projectId, p);
  }
  return [...m].map(([projectId, v]) => ({ projectId, ...v, profit: v.income - v.costs, margin: v.income ? (v.income - v.costs) / v.income : null }));
}

export const AGE_BUCKETS = [
  { key: "current", label: "Not due yet", max: 0 },
  { key: "d30", label: "1–30 days late", max: 30 },
  { key: "d60", label: "31–60 days late", max: 60 },
  { key: "d90", label: "61–90 days late", max: 90 },
  { key: "older", label: "Over 90 days late", max: Infinity },
] as const;
export type AgeKey = (typeof AGE_BUCKETS)[number]["key"];

const daysLate = (due: string, today: string) => Math.round((Date.parse(today) - Date.parse(due)) / 86_400_000);
export const ageBucket = (due: string, today: string): AgeKey => {
  const d = daysLate(due, today);
  return AGE_BUCKETS.find((b) => d <= b.max)!.key;
};

/** Open amounts per contact per age bucket. */
export function aging(items: { contactId: string; dueDate: string; open: number }[], today: string) {
  const m = new Map<string, Record<AgeKey, number> & { total: number }>();
  for (const i of items) {
    if (i.open <= 0) continue;
    const row = m.get(i.contactId) ?? { current: 0, d30: 0, d60: 0, d90: 0, older: 0, total: 0 };
    row[ageBucket(i.dueDate, today)] += i.open;
    row.total += i.open;
    m.set(i.contactId, row);
  }
  return m;
}

/** Monday-free week buckets: 0 = this week (overdue lands here), 1… = following weeks. */
export function forecastWeeks(
  today: string,
  weeks: number,
  startCash: number,
  inflows: { date: string; amount: number }[],
  outflows: { date: string; amount: number }[],
) {
  const day = (iso: string) => Math.floor((Date.parse(iso) - Date.parse(today)) / 86_400_000);
  const rows = Array.from({ length: weeks }, (_, i) => ({ week: i, start: new Date(Date.parse(today) + i * 7 * 86_400_000).toISOString().slice(0, 10), inflow: 0, outflow: 0, cash: 0 }));
  for (const f of inflows) {
    const w = Math.max(0, Math.floor(day(f.date) / 7));
    if (w < weeks) rows[w].inflow += f.amount;
  }
  for (const f of outflows) {
    const w = Math.max(0, Math.floor(day(f.date) / 7));
    if (w < weeks) rows[w].outflow += f.amount;
  }
  let cash = startCash;
  for (const r of rows) {
    cash += r.inflow - r.outflow;
    r.cash = cash;
  }
  const low = rows.reduce((m, r) => Math.min(m, r.cash), startCash);
  return { rows, low, firstShort: rows.find((r) => r.cash < 0) ?? null };
}

/** First day of the financial year that `date` falls in. */
export function fiscalYearStart(date: string, startMonth: number) {
  const [y, m] = date.split("-").map(Number);
  const year = m >= startMonth ? y : y - 1;
  return `${year}-${String(startMonth).padStart(2, "0")}-01`;
}
export function fiscalYearEnd(start: string) {
  const [y, m] = start.split("-").map(Number);
  const d = new Date(Date.UTC(y + 1, m - 1, 0));
  return d.toISOString().slice(0, 10);
}

/** Adds a running balance to each item (in order). */
export function withRunningBalance<T extends { amount: number }>(items: T[]): (T & { balance: number })[] {
  const out: (T & { balance: number })[] = [];
  let total = 0;
  for (const x of items) {
    total += x.amount;
    out.push({ ...x, balance: total });
  }
  return out;
}
