import { test } from "node:test";
import assert from "node:assert/strict";
import {
  baseOf,
  invoiceState,
  invoiceTotals,
  MissingRate,
  postBill,
  postExpense,
  postInvoice,
  postPayment,
  postPayroll,
  postTransfer,
  progressBilling,
  sumBase,
  toPosted,
  type DraftEntry,
} from "../src/lib/finance/core";
import { aging, balanceSheet, cashFlow, fiscalYearEnd, fiscalYearStart, forecastWeeks, profitAndLoss, projectProfit, trialBalance, type Acc, type PostedLine } from "../src/lib/finance/reports";

const rates: Record<string, number> = { USD: 1, IQD: 1 / 1300 };
const rate = (c: string) => rates[c] ?? null;

const balanced = (e: DraftEntry) => assert.equal(sumBase(e.lines), 0, `${e.memo} must balance`);

test("invoice totals with tax and retention", () => {
  const t = invoiceTotals([{ description: "Work", unit: "lot", quantity: "2", unitPrice: "500" }], "10", "5");
  assert.deepEqual(t, { subtotal: 100000, tax: 10000, total: 110000, retention: 5000, due: 105000 });
});

test("invoice states", () => {
  assert.equal(invoiceState({ status: "issued", dueDate: "2026-11-01", due: 1000, paid: 0 }, "2026-11-04").state, "overdue");
  assert.equal(invoiceState({ status: "issued", dueDate: "2026-12-01", due: 1000, paid: 400 }, "2026-11-04").state, "partial");
  assert.equal(invoiceState({ status: "issued", dueDate: "2026-12-01", due: 1000, paid: 1000 }, "2026-11-04").state, "paid");
  assert.equal(invoiceState({ status: "draft", dueDate: "2026-12-01", due: 1000, paid: 0 }, "2026-11-04").state, "draft");
});

test("progress billing bills the gap since last time", () => {
  assert.deepEqual(progressBilling("100000", 45, 3000000), { toDate: 4500000, billedBefore: 3000000, thisInvoice: 1500000 });
  assert.equal(progressBilling("100000", 20, 3000000).thisInvoice, 0);
});

test("invoice posting: receivable, retention, sales, tax", () => {
  const e = postInvoice(
    { id: "i1", number: 1, date: "2026-11-01", currency: "USD", items: [{ description: "x", unit: "", quantity: "1", unitPrice: "1000" }], taxRate: "10", retentionPercent: "5", contactId: "c", projectId: "p", code: "INV-0001" },
    rate,
    "USD",
  );
  balanced(e);
  const by = Object.fromEntries(e.lines.map((l) => [l.account, baseOf(l)]));
  assert.deepEqual(by, { ar: 105000, retention: 5000, sales: -100000, tax_out: -10000 });
});

test("foreign-currency payment clears the invoice at its own rate; the gap is an exchange difference", () => {
  // Invoice 1,300,000 IQD at 1300 → $1000. Paid when the rate is 1250 → $1040 into the bank.
  const p = postPayment(
    { id: "p1", direction: "in", date: "2026-12-01", amount: "1300000", currency: "IQD", moneyAccountId: "bank", contactId: "c", code: "RC-1" },
    [{ amount: "1300000", docRate: 1 / 1300, docCurrency: "IQD", projectId: "p" }],
    (c) => (c === "IQD" ? 1 / 1250 : 1),
    "USD",
  );
  balanced(p);
  const by = Object.fromEntries(p.lines.map((l) => [l.account, baseOf(l)]));
  assert.equal(by.bank, 104000);
  assert.equal(by.ar, -100000);
  assert.equal(by.fx, -4000);
});

test("overpayment becomes a customer advance", () => {
  const p = postPayment({ id: "p2", direction: "in", date: "2026-11-02", amount: "1500", currency: "USD", moneyAccountId: "cash", contactId: "c", code: "RC-2" }, [{ amount: "1000", docRate: 1, docCurrency: "USD", projectId: null }], rate, "USD");
  balanced(p);
  assert.equal(baseOf(p.lines.find((l) => l.account === "customer_advances")!), -50000);
});

test("bill, expense, payroll and transfer postings balance", () => {
  balanced(postBill({ id: "b", date: "2026-11-01", currency: "USD", items: [{ description: "Cement", unit: "bag", quantity: "10", unitPrice: "8" }], taxRate: "5", contactId: "s", projectId: "p", accountId: "acc-mat", code: "BILL-1" }, rate, "USD"));
  const ex = postExpense({ id: "e", date: "2026-11-01", amount: "260000", currency: "IQD", category: "materials", description: "Sand", projectId: "p", moneyAccountId: "cash", loanId: null }, rate, "USD");
  balanced(ex);
  assert.equal(ex.lines[0].account, "exp_materials");
  assert.equal(baseOf(ex.lines[0]), 20000);
  const adv = postExpense({ id: "e2", date: "2026-11-01", amount: "50", currency: "USD", category: "other", description: "Fuel", projectId: "p", moneyAccountId: "cash", loanId: "L" }, rate, "USD");
  assert.equal(adv.lines[1].account, "staff_loans");
  const pr = postPayroll(
    { id: "r", month: "2026-11", date: "2026-11-30" },
    [
      { currency: "USD", gross: "1550", net: "1375", ssEmployee: "75", ssEmployer: "180", loanDeduction: "100", deductions: [] },
      { currency: "USD", gross: "800", net: "740", ssEmployee: "40", ssEmployer: "96", loanDeduction: "0", deductions: [{ amount: "20" }] },
    ],
    rate,
    "USD",
  );
  balanced(pr);
  const by = Object.fromEntries(pr.lines.map((l) => [l.account, baseOf(l)]));
  assert.deepEqual(by, { salaries: 235000, ss_expense: 27600, salaries_payable: -211500, ss_payable: -39100, staff_loans: -10000, other_income: -2000 });
  balanced(postTransfer({ id: "t", date: "2026-11-01", fromAccountId: "cash", toAccountId: "bank", amount: "1300000", amountTo: null, fromCurrency: "IQD", toCurrency: "USD" }, rate, "USD"));
});

test("missing rate is reported, not guessed", () => {
  assert.throws(() => postExpense({ id: "e", date: "2026-11-01", amount: "5", currency: "EUR", category: "other", description: "x", projectId: "p", moneyAccountId: "cash", loanId: null }, rate, "USD"), MissingRate);
});

test("posted lines split into debit / credit", () => {
  assert.deepEqual(toPosted({ account: "a", fx: 500, currency: "USD", rate: 1 }), { debit: 500, credit: 0 });
  assert.deepEqual(toPosted({ account: "a", fx: -500, currency: "USD", rate: 1 }), { debit: 0, credit: 500 });
});

const accounts: Acc[] = [
  { id: "cash", code: "1100", name: "Cash", type: "asset", systemKey: null, moneyKind: "cash" },
  { id: "ar", code: "1300", name: "AR", type: "asset", systemKey: "ar", moneyKind: null },
  { id: "ap", code: "2100", name: "AP", type: "liability", systemKey: "ap", moneyKind: null },
  { id: "opening", code: "3100", name: "Opening", type: "equity", systemKey: "opening", moneyKind: null },
  { id: "sales", code: "4000", name: "Sales", type: "income", systemKey: "sales", moneyKind: null },
  { id: "mat", code: "5100", name: "Materials", type: "expense", systemKey: "exp_materials", moneyKind: null },
];
const L = (accountId: string, date: string, debit: number, credit: number, source: string, projectId: string | null = null): PostedLine => ({ accountId, date, debit, credit, source, projectId });
const lines: PostedLine[] = [
  L("cash", "2026-01-01", 100000, 0, "opening"),
  L("opening", "2026-01-01", 0, 100000, "opening"),
  L("ar", "2026-02-01", 50000, 0, "invoice", "p1"),
  L("sales", "2026-02-01", 0, 50000, "invoice", "p1"),
  L("cash", "2026-02-10", 30000, 0, "payment"),
  L("ar", "2026-02-10", 0, 30000, "payment"),
  L("mat", "2026-02-15", 20000, 0, "expense", "p1"),
  L("cash", "2026-02-15", 0, 20000, "expense", "p1"),
  L("mat", "2026-03-01", 5000, 0, "bill", "p2"),
  L("ap", "2026-03-01", 0, 5000, "bill", "p2"),
];

test("trial balance, P&L, balance sheet, cash flow, project profit", () => {
  assert.equal(trialBalance(accounts, lines, "2026-12-31").balanced, true);
  const pl = profitAndLoss(accounts, lines, "2026-01-01", "2026-12-31");
  assert.equal(pl.totalIncome, 50000);
  assert.equal(pl.totalExpenses, 25000);
  assert.equal(pl.profit, 25000);
  assert.equal(profitAndLoss(accounts, lines, "2026-01-01", "2026-12-31", "p1").profit, 30000);
  const bs = balanceSheet(accounts, lines, "2026-12-31");
  assert.equal(bs.balanced, true);
  assert.equal(bs.totalAssets, 130000);
  assert.equal(bs.profit, 25000);
  const cf = cashFlow(accounts, lines, "2026-02-01", "2026-02-28");
  assert.equal(cf.start, 100000);
  assert.equal(cf.end, 110000);
  assert.deepEqual(cf.rows.map((r) => [r.key, r.amount]), [["payment_in", 30000], ["expense", -20000]]);
  const pp = projectProfit(accounts, lines);
  assert.deepEqual(pp.find((p) => p.projectId === "p1"), { projectId: "p1", income: 50000, costs: 20000, profit: 30000, margin: 0.6 });
});

test("aging buckets and cash forecast", () => {
  const a = aging(
    [
      { contactId: "c", dueDate: "2026-11-10", open: 100 },
      { contactId: "c", dueDate: "2026-10-20", open: 200 },
      { contactId: "c", dueDate: "2026-07-01", open: 300 },
    ],
    "2026-11-04",
  );
  assert.deepEqual(a.get("c"), { current: 100, d30: 200, d60: 0, d90: 0, older: 300, total: 600 });
  const f = forecastWeeks("2026-11-04", 4, 1000, [{ date: "2026-11-20", amount: 500 }], [{ date: "2026-11-05", amount: 1200 }, { date: "2026-10-01", amount: 100 }]);
  assert.deepEqual(f.rows.map((r) => r.cash), [-300, -300, 200, 200]);
  assert.equal(f.firstShort?.week, 0);
});

test("financial year", () => {
  assert.equal(fiscalYearStart("2026-11-04", 1), "2026-01-01");
  assert.equal(fiscalYearStart("2026-03-04", 7), "2025-07-01");
  assert.equal(fiscalYearEnd("2025-07-01"), "2026-06-30");
});
