import "server-only";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import { projects } from "@/lib/db/schema";
import { listAccounts, listContacts, postedLines, rateLookup, type FinanceSettings } from "./ledger";
import { aging, balanceSheet, cashFlow, fiscalYearEnd, fiscalYearStart, profitAndLoss, projectProfit, trialBalance, type Acc } from "./reports";
import { billRows, invoiceRows } from "@/lib/data/finance";
import { shiftMonth, monthDays } from "@/lib/hr-rules";

export const REPORTS = [
  { key: "pl", label: "Profit and loss" },
  { key: "bs", label: "Balance sheet" },
  { key: "cf", label: "Cash flow" },
  { key: "projects", label: "Profit by project" },
  { key: "ar", label: "Who owes us" },
  { key: "ap", label: "Whom we owe" },
  { key: "tax", label: "Sales tax" },
  { key: "tb", label: "Trial balance" },
] as const;
export type ReportKey = (typeof REPORTS)[number]["key"];

export const PERIODS = ["this_month", "last_month", "this_quarter", "this_year", "last_year", "custom"] as const;
export type Period = (typeof PERIODS)[number];

/** From/to dates of a named period (financial year aware). */
export function periodRange(p: Period, today: string, fyStart: number, from?: string, to?: string) {
  const mo = today.slice(0, 7);
  switch (p) {
    case "this_month":
      return { from: `${mo}-01`, to: today };
    case "last_month": {
      const lm = shiftMonth(mo, -1);
      return { from: `${lm}-01`, to: monthDays(lm).at(-1)! };
    }
    case "this_quarter": {
      const m = Number(mo.slice(5));
      const q = `${mo.slice(0, 4)}-${String(m - ((m - 1) % 3)).padStart(2, "0")}`;
      return { from: `${q}-01`, to: today };
    }
    case "this_year":
      return { from: fiscalYearStart(today, fyStart), to: today };
    case "last_year": {
      const s = fiscalYearStart(today, fyStart);
      const prev = `${Number(s.slice(0, 4)) - 1}${s.slice(4)}`;
      return { from: prev, to: fiscalYearEnd(prev) };
    }
    case "custom":
      return { from: from ?? `${mo}-01`, to: to ?? today };
  }
}

/** Everything any report needs (cents in the main currency). */
export async function reportData(workspaceId: string, s: FinanceSettings, key: ReportKey, from: string, to: string, today: string) {
  const [accounts, lines] = await Promise.all([listAccounts(workspaceId), postedLines(workspaceId)]);
  const accs: Acc[] = accounts.map((a) => ({ id: a.id, code: a.code, name: a.name, type: a.type, systemKey: a.systemKey, moneyKind: a.moneyKind }));
  switch (key) {
    case "pl":
      return { key, pl: profitAndLoss(accs, lines, from, to) };
    case "bs":
      return { key, bs: balanceSheet(accs, lines, to) };
    case "cf":
      return { key, cf: cashFlow(accs, lines, from, to) };
    case "tb":
      return { key, tb: trialBalance(accs, lines, to) };
    case "projects": {
      const rows = projectProfit(accs, lines, from, to);
      const names = rows.length ? await db.select({ id: projects.id, name: projects.name, key: projects.key }).from(projects).where(and(eq(projects.workspaceId, workspaceId), inArray(projects.id, rows.map((r) => r.projectId)))) : [];
      return { key, projects: rows.map((r) => ({ ...r, name: names.find((n) => n.id === r.projectId)?.name ?? "", code: names.find((n) => n.id === r.projectId)?.key ?? "" })).sort((a, b) => b.profit - a.profit) };
    }
    case "ar":
    case "ap": {
      const [contacts, rate] = await Promise.all([listContacts(workspaceId), rateLookup(workspaceId, s.baseCurrency)]);
      const conv = (c: number, cur: string) => Math.round(c * (rate(cur, today) ?? 0));
      const items =
        key === "ar"
          ? (await invoiceRows(workspaceId, today)).filter((i) => i.inv.status === "issued").flatMap((i) => [
              { contactId: i.inv.contactId, dueDate: i.inv.dueDate, open: conv(i.open, i.inv.currency) },
              ...(i.retentionOpen ? [{ contactId: i.inv.contactId, dueDate: "9999-12-31", open: conv(i.retentionOpen, i.inv.currency) }] : []),
            ])
          : (await billRows(workspaceId, today)).filter((b) => b.bill.status === "open").map((b) => ({ contactId: b.bill.contactId, dueDate: b.bill.dueDate, open: conv(b.open, b.bill.currency) }));
      const m = aging(items, today);
      return { key, aging: [...m].map(([contactId, v]) => ({ contactId, name: contacts.find((c) => c.id === contactId)?.name ?? "", ...v })).sort((a, b) => b.total - a.total) };
    }
    case "tax": {
      const out = accounts.find((a) => a.systemKey === "tax_out")!;
      const inn = accounts.find((a) => a.systemKey === "tax_in")!;
      const within = lines.filter((l) => l.date >= from && l.date <= to);
      const collected = within.filter((l) => l.accountId === out.id).reduce((t, l) => t + l.credit - l.debit, 0);
      const paid = within.filter((l) => l.accountId === inn.id).reduce((t, l) => t + l.debit - l.credit, 0);
      return { key, tax: { collected, paid, net: collected - paid, name: s.taxName, number: s.taxNumber } };
    }
  }
}
export type ReportData = Awaited<ReturnType<typeof reportData>>;
