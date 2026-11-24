import "server-only";
import { eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import { employees, payrollRuns, payslips } from "@/lib/db/schema";
import { cents } from "./core";
import { listAccounts, postedLines, rateLookup, type FinanceSettings } from "./ledger";
import { fiscalYearStart, forecastWeeks, profitAndLoss, type Acc } from "./reports";
import { billRows, invoiceRows } from "@/lib/data/finance";
import { addDays, monthDays, shiftMonth } from "@/lib/hr-rules";
import { grossPay, isActive } from "@/lib/hr";

/** Cash and bank balances: in the main currency and in each account's own currency. */
export function moneyBalances(accounts: Awaited<ReturnType<typeof listAccounts>>, lines: Awaited<ReturnType<typeof postedLines>>, base: string, upto?: string) {
  return accounts
    .filter((a) => a.moneyKind)
    .map((a) => {
      const mine = lines.filter((l) => l.accountId === a.id && (!upto || l.date <= upto));
      const cur = a.currency ?? base;
      return {
        account: a,
        currency: cur,
        base: mine.reduce((s, l) => s + l.debit - l.credit, 0),
        own: mine.filter((l) => l.currency === cur).reduce((s, l) => s + l.fx, 0),
      };
    });
}

/** Everything on the Finance overview, in the main currency (cents). */
export async function financeOverview(workspaceId: string, s: FinanceSettings, today: string) {
  const base = s.baseCurrency;
  const [accounts, lines, rate, invs, bls] = await Promise.all([listAccounts(workspaceId), postedLines(workspaceId), rateLookup(workspaceId, base), invoiceRows(workspaceId, today), billRows(workspaceId, today)]);
  const toBase = (amountCents: number, currency: string) => Math.round(amountCents * (rate(currency, today) ?? 0));
  const missingRates = new Set<string>();
  const conv = (c: number, currency: string) => {
    if (rate(currency, today) === null) missingRates.add(currency);
    return toBase(c, currency);
  };
  const money = moneyBalances(accounts, lines, base, today);
  const cash = money.reduce((s2, m) => s2 + m.base, 0);
  const openInv = invs.filter((i) => i.inv.status === "issued" && i.open > 0);
  const openBills = bls.filter((b) => b.bill.status === "open" && b.open > 0);
  const owedToUs = openInv.reduce((s2, i) => s2 + conv(i.open, i.inv.currency), 0);
  const retention = invs.reduce((s2, i) => s2 + conv(i.retentionOpen, i.inv.currency), 0);
  const weOwe = openBills.reduce((s2, b) => s2 + conv(b.open, b.bill.currency), 0);

  const accs: Acc[] = accounts.map((a) => ({ id: a.id, code: a.code, name: a.name, type: a.type, systemKey: a.systemKey, moneyKind: a.moneyKind }));
  const yStart = fiscalYearStart(today, s.fiscalYearStart);
  const year = profitAndLoss(accs, lines, yStart, today);
  const thisMonth = profitAndLoss(accs, lines, `${today.slice(0, 7)}-01`, today);
  const months = Array.from({ length: 6 }, (_, i) => shiftMonth(today.slice(0, 7), i - 5)).map((mo) => {
    const p = profitAndLoss(accs, lines, `${mo}-01`, monthDays(mo).at(-1)!);
    return { month: mo, income: p.totalIncome, costs: p.totalExpenses };
  });

  // Cash forecast: open invoices in, open bills out, and salaries at each month end.
  const outflows = openBills.map((b) => ({ date: b.bill.dueDate, amount: conv(b.open, b.bill.currency) }));
  const inflows = openInv.map((i) => ({ date: i.inv.dueDate, amount: conv(i.open, i.inv.currency) }));
  const horizon = addDays(today, 7 * 12);
  const [people, runs] = await Promise.all([db.select().from(employees).where(eq(employees.workspaceId, workspaceId)), db.select().from(payrollRuns).where(eq(payrollRuns.workspaceId, workspaceId))]);
  const unpaid = runs.filter((r) => r.status === "approved");
  const unpaidSlips = unpaid.length ? await db.select().from(payslips).where(inArray(payslips.runId, unpaid.map((r) => r.id))) : [];
  for (const r of unpaid) outflows.push({ date: monthDays(r.month).at(-1)!, amount: unpaidSlips.filter((x) => x.runId === r.id).reduce((t, x) => t + conv(cents(x.net), x.currency), 0) });
  const monthly = people
    .filter((e) => isActive(e, today) && e.basicPay)
    .reduce((t, e) => t + conv(Math.round(grossPay(e) * 100 * (e.payBasis === "daily" ? 22 : e.payBasis === "hourly" ? 176 : 1)), e.currency), 0);
  for (let mo = today.slice(0, 7); `${mo}-01` <= horizon; mo = shiftMonth(mo, 1)) {
    if (runs.some((r) => r.month === mo)) continue;
    const end = monthDays(mo).at(-1)!;
    if (end <= horizon && monthly) outflows.push({ date: end, amount: monthly });
  }
  const forecast = forecastWeeks(today, 12, cash, inflows, outflows);

  return {
    money,
    cash,
    owedToUs,
    retention,
    weOwe,
    year,
    thisMonth,
    months,
    forecast,
    payrollEstimate: monthly,
    missingRates: [...missingRates],
    overdueInvoices: openInv.filter((i) => i.state === "overdue").sort((a, b) => a.inv.dueDate.localeCompare(b.inv.dueDate)),
    billsDueSoon: openBills.filter((b) => b.bill.dueDate <= addDays(today, 14)).sort((a, b) => a.bill.dueDate.localeCompare(b.bill.dueDate)),
  };
}
