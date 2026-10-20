import { test } from "node:test";
import assert from "node:assert/strict";
import { checkRepayment, loanBalance, totalsByCurrency } from "../src/lib/loans";

test("balance goes down with each repayment and is exact in cents", () => {
  assert.deepEqual(loanBalance("1000000", []), {
    amount: "1000000.00", paid: "0.00", returned: "0.00", spent: "0.00", pending: "0.00",
    balance: "1000000.00", open: "1000000.00", paidPct: 0, paidOff: false,
  });
  const b = loanBalance("100.30", [{ amount: "0.10" }, { amount: "0.20" }, { amount: "50" }]);
  assert.equal(b.paid, "50.30");
  assert.equal(b.balance, "50.00");
  assert.equal(b.paidPct, 50);
  assert.equal(b.paidOff, false);
});

test("a loan is paid off exactly when repayments reach the amount", () => {
  const b = loanBalance("750000", [{ amount: "250000" }, { amount: "500000" }]);
  assert.equal(b.balance, "0.00");
  assert.equal(b.paidOff, true);
  assert.equal(b.paidPct, 100);
});

test("repayments must be positive and not more than the balance", () => {
  assert.equal(checkRepayment("0", "100.00"), "Enter an amount greater than 0");
  assert.equal(checkRepayment("abc", "100.00"), "Enter an amount greater than 0");
  assert.equal(checkRepayment("100.01", "100.00"), "That's more than the remaining balance of {balance}");
  assert.equal(checkRepayment("100", "100.00"), null);
  assert.equal(checkRepayment("12.5", "100.00"), null);
});

test("totals are kept per currency", () => {
  const totals = totalsByCurrency([
    { currency: "IQD", amount: "1000000", balance: "400000" },
    { currency: "IQD", amount: "500000", balance: "0" },
    { currency: "USD", amount: "300", balance: "300" },
  ]);
  assert.deepEqual(totals, [
    { currency: "IQD", lent: "1500000.00", outstanding: "400000.00", active: 1 },
    { currency: "USD", lent: "300.00", outstanding: "300.00", active: 1 },
  ]);
});

test("an advance is settled by approved receipts plus cash brought back", () => {
  // 10,000 given; 9,000 spent on receipts; 1,000 brought back.
  const half = loanBalance("10000", [], [{ amount: "6000", approvalStatus: "approved" }, { amount: "3000", approvalStatus: "pending" }]);
  assert.equal(half.spent, "6000.00");
  assert.equal(half.pending, "3000.00");
  assert.equal(half.balance, "4000.00");
  // Receipts waiting for approval are held back from what can still be returned or claimed.
  assert.equal(half.open, "1000.00");
  assert.equal(half.paidOff, false);
  const done = loanBalance("10000", [{ amount: "1000" }], [
    { amount: "6000", approvalStatus: "approved" },
    { amount: "3000", approvalStatus: "approved" },
    { amount: "500", approvalStatus: "rejected" },
  ]);
  assert.equal(done.returned, "1000.00");
  assert.equal(done.spent, "9000.00");
  assert.equal(done.balance, "0.00");
  assert.equal(done.paidOff, true);
});
