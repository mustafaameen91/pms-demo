/**
 * Finance rules (pure; Phase 29): the chart of accounts a company starts with,
 * invoice totals, money in cents, and how every record turns into balanced
 * double-entry lines. No country is built in.
 */

export const ACCOUNT_TYPES = [
  { value: "asset", label: "Asset|account", normal: "debit" },
  { value: "liability", label: "Liability", normal: "credit" },
  { value: "equity", label: "Equity", normal: "credit" },
  { value: "income", label: "Income", normal: "credit" },
  { value: "expense", label: "Expense", normal: "debit" },
] as const;
export type AccountType = (typeof ACCOUNT_TYPES)[number]["value"];
export const debitNormal = (type: string) => type === "asset" || type === "expense";

/** Accounts every company gets; `key` = the system key Tamm posts to. All renamable. */
export const DEFAULT_ACCOUNTS: { code: string; name: string; type: AccountType; key: string }[] = [
  { code: "1300", name: "Customers owe us (receivable)", type: "asset", key: "ar" },
  { code: "1310", name: "Retention held by customers", type: "asset", key: "retention" },
  { code: "1400", name: "Staff loans and advances", type: "asset", key: "staff_loans" },
  { code: "1500", name: "Tax paid on purchases", type: "asset", key: "tax_in" },
  { code: "2100", name: "We owe suppliers (payable)", type: "liability", key: "ap" },
  { code: "2200", name: "Tax collected on sales", type: "liability", key: "tax_out" },
  { code: "2300", name: "Salaries to pay", type: "liability", key: "salaries_payable" },
  { code: "2400", name: "Social security to pay", type: "liability", key: "ss_payable" },
  { code: "2500", name: "Customer advances", type: "liability", key: "customer_advances" },
  { code: "2600", name: "Supplier advances", type: "asset", key: "supplier_advances" },
  { code: "3000", name: "Owner's capital", type: "equity", key: "capital" },
  { code: "3100", name: "Opening balances", type: "equity", key: "opening" },
  { code: "4000", name: "Sales and project income", type: "income", key: "sales" },
  { code: "4900", name: "Other income", type: "income", key: "other_income" },
  { code: "5100", name: "Materials", type: "expense", key: "exp_materials" },
  { code: "5110", name: "Equipment", type: "expense", key: "exp_equipment" },
  { code: "5120", name: "Labour", type: "expense", key: "exp_labor" },
  { code: "5130", name: "Subcontractors", type: "expense", key: "exp_subcontractor" },
  { code: "5140", name: "Transport", type: "expense", key: "exp_transport" },
  { code: "5150", name: "Permits and fees", type: "expense", key: "exp_permits_fees" },
  { code: "5160", name: "Utilities", type: "expense", key: "exp_utilities" },
  { code: "5190", name: "Other project costs", type: "expense", key: "exp_other" },
  { code: "6000", name: "Salaries", type: "expense", key: "salaries" },
  { code: "6010", name: "Social security (company share)", type: "expense", key: "ss_expense" },
  { code: "6100", name: "Rent", type: "expense", key: "rent" },
  { code: "6200", name: "Office and general", type: "expense", key: "general" },
  { code: "7000", name: "Exchange differences", type: "expense", key: "fx" },
];

/** Where a project expense of each category is charged. */
export const EXPENSE_ACCOUNT: Record<string, string> = {
  materials: "exp_materials",
  equipment: "exp_equipment",
  labor: "exp_labor",
  subcontractor: "exp_subcontractor",
  transport: "exp_transport",
  permits_fees: "exp_permits_fees",
  utilities: "exp_utilities",
  other: "exp_other",
};

export const MONEY_KINDS = [
  { value: "cash", label: "Cash box" },
  { value: "bank", label: "Bank account" },
  { value: "wallet", label: "Mobile wallet" },
] as const;

// --- Money (cents) ---

export const cents = (v: string | number | null | undefined) => Math.round(Number(v || 0) * 100);
export const fromCents = (c: number) => (c / 100).toFixed(2);

// --- Invoices & bills ---

export type Line = { description: string; unit: string; quantity: string; unitPrice: string };

/** Subtotal, tax, total, retention held back and what's due now (cents). */
export function invoiceTotals(items: Line[], taxRate: string | number, retentionPercent: string | number = 0) {
  const subtotal = items.reduce((s, i) => s + Math.round(Number(i.quantity || 0) * cents(i.unitPrice)), 0);
  const tax = Math.round((subtotal * Number(taxRate || 0)) / 100);
  const total = subtotal + tax;
  const retention = Math.round((subtotal * Number(retentionPercent || 0)) / 100);
  return { subtotal, tax, total, retention, due: total - retention };
}

/** paid, open (due − paid) and the state shown to people. */
export function invoiceState(o: { status: string; dueDate: string; due: number; paid: number }, today: string) {
  const open = Math.max(0, o.due - o.paid);
  if (o.status === "draft") return { open, state: "draft" as const };
  if (o.status === "cancelled") return { open: 0, state: "cancelled" as const };
  if (open === 0) return { open, state: "paid" as const };
  if (o.dueDate < today) return { open, state: "overdue" as const };
  return { open, state: o.paid > 0 ? ("partial" as const) : ("open" as const) };
}

/**
 * A progress invoice from the project's accomplishment: contract value × progress so far,
 * less what was billed before. Returns the line to bill (cents) and the new cumulative %.
 */
export function progressBilling(contractValue: string | number, progressPercent: number, billedBefore: number) {
  const toDate = Math.round((cents(contractValue) * Math.max(0, Math.min(100, progressPercent))) / 100);
  return { toDate, billedBefore, thisInvoice: Math.max(0, toDate - billedBefore) };
}

// --- Postings ---

export type DraftLine = {
  /** System key or account id. */
  account: string;
  /** Signed amount in the original currency, cents (+ debit, − credit). */
  fx: number;
  currency: string;
  /** Rate to the main currency used for this line (1 when the same). */
  rate: number;
  projectId?: string | null;
  contactId?: string | null;
  description?: string | null;
  /** Override the converted amount (cents, signed) — used for exchange-difference balancing. */
  base?: number;
};
export type DraftEntry = { sourceKey: string; source: string; sourceId: string; date: string; memo: string; projectId?: string | null; lines: DraftLine[] };

/** Main-currency amount of a line (cents, signed). */
export const baseOf = (l: DraftLine) => l.base ?? Math.round(l.fx * l.rate);

/** Makes debits equal credits: any rounding / exchange gap goes to the exchange-differences account. */
export function balance(entry: DraftEntry, currency: string): DraftEntry {
  const gap = entry.lines.reduce((s, l) => s + baseOf(l), 0);
  if (gap === 0) return entry;
  return { ...entry, lines: [...entry.lines, { account: "fx", fx: -gap, currency, rate: 1, base: -gap, description: "Exchange / rounding difference" }] };
}

/** Lines to (debit, credit) in the main currency. */
export function toPosted(l: DraftLine) {
  const b = baseOf(l);
  return { debit: b > 0 ? b : 0, credit: b < 0 ? -b : 0 };
}

export const sumBase = (lines: DraftLine[]) => lines.reduce((s, l) => s + baseOf(l), 0);

type Rate = (currency: string, date: string) => number | null;
export class MissingRate extends Error {
  constructor(
    public currency: string,
    public date: string,
  ) {
    super(`No exchange rate for ${currency} on ${date}`);
  }
}
/** Rate or throw MissingRate (the sync records it as an issue). */
export const need = (rate: Rate, currency: string, date: string) => {
  const r = rate(currency, date);
  if (r === null) throw new MissingRate(currency, date);
  return r;
};

/** Issued invoice: receivable (+ retention) against sales and tax. */
export function postInvoice(inv: { id: string; number: number; date: string; currency: string; items: Line[]; taxRate: string; retentionPercent: string; contactId: string; projectId: string | null; code: string }, rate: Rate, base: string): DraftEntry {
  const r = need(rate, inv.currency, inv.date);
  const t = invoiceTotals(inv.items, inv.taxRate, inv.retentionPercent);
  const common = { currency: inv.currency, rate: r, projectId: inv.projectId, contactId: inv.contactId };
  const lines: DraftLine[] = [
    { account: "ar", fx: t.total - t.retention, ...common },
    ...(t.retention ? [{ account: "retention", fx: t.retention, ...common }] : []),
    { account: "sales", fx: -t.subtotal, ...common },
    ...(t.tax ? [{ account: "tax_out", fx: -t.tax, ...common }] : []),
  ];
  return balance({ sourceKey: `invoice:${inv.id}`, source: "invoice", sourceId: inv.id, date: inv.date, memo: `Invoice ${inv.code}`, projectId: inv.projectId, lines }, base);
}

/** Open bill: cost (+ tax paid) against what we owe the supplier. */
export function postBill(b: { id: string; date: string; currency: string; items: Line[]; taxRate: string; contactId: string; projectId: string | null; accountId: string; code: string }, rate: Rate, base: string): DraftEntry {
  const r = need(rate, b.currency, b.date);
  const t = invoiceTotals(b.items, b.taxRate);
  const common = { currency: b.currency, rate: r, projectId: b.projectId, contactId: b.contactId };
  const lines: DraftLine[] = [
    { account: b.accountId, fx: t.subtotal, ...common },
    ...(t.tax ? [{ account: "tax_in", fx: t.tax, ...common }] : []),
    { account: "ap", fx: -t.total, ...common },
  ];
  return balance({ sourceKey: `bill:${b.id}`, source: "bill", sourceId: b.id, date: b.date, memo: `Bill ${b.code}`, projectId: b.projectId, lines }, base);
}

/**
 * A payment. Money moves at the payment's rate; each allocation clears the invoice/bill
 * at the invoice's own rate (the difference is an exchange gain/loss); the rest is an advance.
 */
export function postPayment(
  p: { id: string; direction: "in" | "out"; date: string; amount: string; currency: string; moneyAccountId: string; contactId: string; code: string },
  allocations: { amount: string; docRate: number; docCurrency: string; projectId: string | null; retention?: boolean }[],
  rate: Rate,
  base: string,
): DraftEntry {
  const r = need(rate, p.currency, p.date);
  const sign = p.direction === "in" ? 1 : -1;
  const amount = cents(p.amount);
  const lines: DraftLine[] = [{ account: p.moneyAccountId, fx: sign * amount, currency: p.currency, rate: r, contactId: p.contactId }];
  let allocated = 0;
  for (const a of allocations) {
    const fx = cents(a.amount);
    allocated += fx;
    lines.push({
      account: p.direction === "in" ? (a.retention ? "retention" : "ar") : "ap",
      fx: -sign * fx,
      currency: a.docCurrency,
      rate: a.docRate,
      contactId: p.contactId,
      projectId: a.projectId,
    });
  }
  const rest = amount - allocated;
  if (rest > 0) lines.push({ account: p.direction === "in" ? "customer_advances" : "supplier_advances", fx: -sign * rest, currency: p.currency, rate: r, contactId: p.contactId });
  return balance({ sourceKey: `payment:${p.id}`, source: "payment", sourceId: p.id, date: p.date, memo: `${p.direction === "in" ? "Payment received" : "Payment made"} ${p.code}`, lines }, base);
}

/** Approved project expense: cost against the money account (or the advance it was bought with). */
export function postExpense(
  e: { id: string; date: string; amount: string; currency: string; category: string; description: string; projectId: string; moneyAccountId: string; loanId: string | null },
  rate: Rate,
  base: string,
): DraftEntry {
  const r = need(rate, e.currency, e.date);
  const a = cents(e.amount);
  const common = { currency: e.currency, rate: r, projectId: e.projectId };
  return balance(
    {
      sourceKey: `expense:${e.id}`,
      source: "expense",
      sourceId: e.id,
      date: e.date,
      memo: e.description,
      projectId: e.projectId,
      lines: [
        { account: EXPENSE_ACCOUNT[e.category] ?? "exp_other", fx: a, ...common },
        { account: e.loanId ? "staff_loans" : e.moneyAccountId, fx: -a, ...common },
      ],
    },
    base,
  );
}

/** A loan or cash advance handed out. */
export function postLoan(l: { id: string; issuedOn: string; amount: string; currency: string; moneyAccountId: string; projectId: string | null; borrower: string }, rate: Rate, base: string): DraftEntry {
  const r = need(rate, l.currency, l.issuedOn);
  const a = cents(l.amount);
  const common = { currency: l.currency, rate: r, projectId: l.projectId };
  return balance(
    {
      sourceKey: `loan:${l.id}`,
      source: "loan",
      sourceId: l.id,
      date: l.issuedOn,
      memo: `Loan to ${l.borrower}`,
      projectId: l.projectId,
      lines: [
        { account: "staff_loans", fx: a, ...common },
        { account: l.moneyAccountId, fx: -a, ...common },
      ],
    },
    base,
  );
}

/** Cash / bank repayment of a loan (salary deductions are posted by payroll instead). */
export function postRepayment(rp: { id: string; paidOn: string; amount: string; currency: string; moneyAccountId: string; borrower: string }, rate: Rate, base: string): DraftEntry {
  const r = need(rate, rp.currency, rp.paidOn);
  const a = cents(rp.amount);
  return balance(
    {
      sourceKey: `repayment:${rp.id}`,
      source: "repayment",
      sourceId: rp.id,
      date: rp.paidOn,
      memo: `Loan repayment from ${rp.borrower}`,
      lines: [
        { account: rp.moneyAccountId, fx: a, currency: rp.currency, rate: r },
        { account: "staff_loans", fx: -a, currency: rp.currency, rate: r },
      ],
    },
    base,
  );
}

export type SlipForPosting = { currency: string; gross: string; net: string; ssEmployee: string; ssEmployer: string; loanDeduction: string; deductions: { amount: string }[] };

/**
 * Approved payroll: salaries and company social security as costs; net pay and
 * social security to pay as debts; loan instalments reduce staff loans; other
 * deductions (fines…) are other income. One line set per currency.
 */
export function postPayroll(run: { id: string; month: string; date: string }, slips: SlipForPosting[], rate: Rate, base: string): DraftEntry {
  const byCur = new Map<string, SlipForPosting[]>();
  for (const s of slips) byCur.set(s.currency, [...(byCur.get(s.currency) ?? []), s]);
  const lines: DraftLine[] = [];
  for (const [currency, list] of byCur) {
    const r = need(rate, currency, run.date);
    const sum = (f: (s: SlipForPosting) => number) => list.reduce((t, s) => t + f(s), 0);
    const gross = sum((s) => cents(s.gross));
    const ssE = sum((s) => cents(s.ssEmployee));
    const ssC = sum((s) => cents(s.ssEmployer));
    const loan = sum((s) => cents(s.loanDeduction));
    const other = sum((s) => s.deductions.reduce((t, d) => t + cents(d.amount), 0));
    const net = sum((s) => cents(s.net));
    const c = { currency, rate: r };
    lines.push({ account: "salaries", fx: gross, ...c });
    if (ssC) lines.push({ account: "ss_expense", fx: ssC, ...c });
    lines.push({ account: "salaries_payable", fx: -net, ...c });
    if (ssE + ssC) lines.push({ account: "ss_payable", fx: -(ssE + ssC), ...c });
    if (loan) lines.push({ account: "staff_loans", fx: -loan, ...c });
    if (other) lines.push({ account: "other_income", fx: -other, ...c });
  }
  return balance({ sourceKey: `payroll:${run.id}`, source: "payroll", sourceId: run.id, date: run.date, memo: `Payroll ${run.month}`, lines }, base);
}

/** Salaries paid out of a money account. */
export function postPayrollPaid(run: { id: string; month: string; date: string; moneyAccountId: string }, nets: { currency: string; net: number }[], rate: Rate, base: string): DraftEntry {
  const lines: DraftLine[] = [];
  for (const n of nets) {
    const r = need(rate, n.currency, run.date);
    lines.push({ account: "salaries_payable", fx: n.net, currency: n.currency, rate: r }, { account: run.moneyAccountId, fx: -n.net, currency: n.currency, rate: r });
  }
  return balance({ sourceKey: `payroll_paid:${run.id}`, source: "payroll_paid", sourceId: run.id, date: run.date, memo: `Salaries paid ${run.month}`, lines }, base);
}

export function postTransfer(tr: { id: string; date: string; fromAccountId: string; toAccountId: string; amount: string; amountTo: string | null; fromCurrency: string; toCurrency: string }, rate: Rate, base: string): DraftEntry {
  const rf = need(rate, tr.fromCurrency, tr.date);
  const rt = need(rate, tr.toCurrency, tr.date);
  const out = cents(tr.amount);
  const into = tr.amountTo ? cents(tr.amountTo) : tr.fromCurrency === tr.toCurrency ? out : Math.round((out * rf) / rt);
  return balance(
    {
      sourceKey: `transfer:${tr.id}`,
      source: "transfer",
      sourceId: tr.id,
      date: tr.date,
      memo: "Transfer",
      lines: [
        { account: tr.toAccountId, fx: into, currency: tr.toCurrency, rate: rt },
        { account: tr.fromAccountId, fx: -out, currency: tr.fromCurrency, rate: rf },
      ],
    },
    base,
  );
}

/** Opening balance of a money account on the start date (against "Opening balances"). */
export function postOpening(a: { id: string; date: string; amount: string; currency: string }, rate: Rate, base: string): DraftEntry {
  const r = need(rate, a.currency, a.date);
  const v = cents(a.amount);
  return balance(
    {
      sourceKey: `opening:${a.id}`,
      source: "opening",
      sourceId: a.id,
      date: a.date,
      memo: "Opening balance",
      lines: [
        { account: a.id, fx: v, currency: a.currency, rate: r },
        { account: "opening", fx: -v, currency: a.currency, rate: r },
      ],
    },
    base,
  );
}

/** Stable fingerprint of an entry, so unchanged ones aren't rewritten. */
export function entryHash(e: DraftEntry, resolve: (account: string) => string) {
  return JSON.stringify([e.date, e.memo, e.projectId ?? null, e.lines.map((l) => [resolve(l.account), baseOf(l), l.fx, l.currency, l.projectId ?? null, l.contactId ?? null])]);
}
