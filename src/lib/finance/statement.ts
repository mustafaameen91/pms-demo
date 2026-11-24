import "server-only";
import { billRows, invoiceRows, paymentRows } from "@/lib/data/finance";
import { cents } from "./core";

/**
 * A contact's statement per currency: invoices/bills raise what's owed, payments
 * lower it; cancelled and draft documents are left out. Positive = they owe us
 * (customers) or we owe them (suppliers).
 */
export async function contactStatement(workspaceId: string, contactId: string, today: string) {
  const [invs, bls, pays] = await Promise.all([invoiceRows(workspaceId, today, { contactId }), billRows(workspaceId, today, { contactId }), paymentRows(workspaceId, { contactId })]);
  type Row = { date: string; kind: "invoice" | "bill" | "payment_in" | "payment_out"; id: string; code: string; currency: string; amount: number; sign: 1 | -1 };
  const rows: Row[] = [
    ...invs.filter((i) => i.inv.status === "issued").map((i) => ({ date: i.inv.date, kind: "invoice" as const, id: i.inv.id, code: i.code, currency: i.inv.currency, amount: i.totals.total, sign: 1 as const })),
    ...bls.filter((b) => b.bill.status === "open").map((b) => ({ date: b.bill.date, kind: "bill" as const, id: b.bill.id, code: b.code, currency: b.bill.currency, amount: b.totals.total, sign: -1 as const })),
    ...pays.map((p) => ({ date: p.p.date, kind: p.p.direction === "in" ? ("payment_in" as const) : ("payment_out" as const), id: p.p.id, code: p.code, currency: p.p.currency, amount: cents(p.p.amount), sign: (p.p.direction === "in" ? -1 : 1) as 1 | -1 })),
  ].sort((a, b) => a.date.localeCompare(b.date) || a.code.localeCompare(b.code));
  const running = new Map<string, number>();
  const lines = rows.map((r) => {
    const v = (running.get(r.currency) ?? 0) + r.sign * r.amount;
    running.set(r.currency, v);
    return { ...r, balance: v };
  });
  return { lines, balances: [...running].map(([currency, balance]) => ({ currency, balance })), invoices: invs, bills: bls };
}
