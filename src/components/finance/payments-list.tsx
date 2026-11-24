"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { ArrowDownLeft, ArrowUpRight, Printer, Search, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { deletePayment } from "@/lib/actions/finance";
import { cn, formatDate, formatMoney } from "@/lib/utils";
import { useT } from "@/i18n/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export type PaymentListRow = {
  id: string;
  code: string;
  direction: string;
  contactId: string;
  contact: string;
  account: string;
  date: string;
  amount: string;
  currency: string;
  reference: string | null;
  allocations: { id: string; code: string; invoiceId: string | null; billId: string | null }[];
  locked: boolean;
};

export function PaymentsList({ slug, rows }: { slug: string; rows: PaymentListRow[] }) {
  const t = useT();
  const [q, setQ] = useState("");
  const [dir, setDir] = useState<"all" | "in" | "out">("all");
  const [pending, start] = useTransition();
  const shown = useMemo(() => {
    const n = q.trim().toLowerCase();
    return rows.filter((r) => (dir === "all" || r.direction === dir) && (!n || [r.code, r.contact, r.reference, r.account, ...r.allocations.map((a) => a.code)].some((v) => v?.toLowerCase().includes(n))));
  }, [rows, q, dir]);
  const base = `/w/${slug}/finance`;
  return (
    <section className="overflow-hidden rounded-2xl border bg-card">
      <div className="flex flex-wrap items-center gap-2 border-b px-4 py-3">
        <div className="relative min-w-48 flex-1">
          <Search className="pointer-events-none absolute top-1/2 size-4 -translate-y-1/2 text-muted-foreground inset-s-3" aria-hidden />
          <Input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("Search number, name, reference…")} aria-label={t("Search")} className="h-9 ps-9" />
        </div>
        <div role="radiogroup" aria-label={t("Direction")} className="inline-flex rounded-lg border p-0.5 text-sm">
          {(
            [
              ["all", t("All")],
              ["in", t("Money in")],
              ["out", t("Money out")],
            ] as const
          ).map(([v, label]) => (
            <button key={v} type="button" role="radio" aria-checked={dir === v} onClick={() => setDir(v)} className="cursor-pointer rounded-md px-2.5 py-1 text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring aria-checked:bg-primary/10 aria-checked:font-medium aria-checked:text-primary">
              {label}
            </button>
          ))}
        </div>
      </div>
      {shown.length === 0 ? (
        <p className="px-4 py-10 text-center text-sm text-muted-foreground">{rows.length ? t("Nothing matches.") : t("No payments yet.")}</p>
      ) : (
        <ul className="divide-y">
          {shown.map((r) => {
            const inN = r.direction === "in";
            return (
              <li key={r.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                <span aria-hidden className={cn("grid size-9 shrink-0 place-items-center rounded-xl", inN ? "bg-green-600/10 text-green-700 dark:text-green-400" : "bg-muted text-muted-foreground")}>
                  {inN ? <ArrowDownLeft className="size-4" /> : <ArrowUpRight className="size-4" />}
                </span>
                <div className="min-w-48 flex-1">
                  <p className="text-sm">
                    <span className="font-medium" dir="ltr">
                      {r.code}
                    </span>{" "}
                    <Link href={`${base}/contacts/${r.contactId}`} className="text-muted-foreground hover:text-primary" dir="auto">
                      {inN ? t("from {name}", { name: r.contact }) : t("to {name}", { name: r.contact })}
                    </Link>
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {formatDate(r.date, t.intl)} · {r.account}
                    {r.reference && ` · ${r.reference}`}
                    {r.allocations.length > 0 && " · "}
                    {r.allocations.map((a, i) => (
                      <span key={a.id}>
                        {i > 0 && ", "}
                        <Link href={a.invoiceId ? `${base}/invoices/${a.invoiceId}` : `${base}/bills/${a.billId}`} className="text-primary hover:underline" dir="ltr">
                          {a.code}
                        </Link>
                      </span>
                    ))}
                  </p>
                </div>
                <span className={cn("font-semibold tabular-nums", inN ? "text-green-700 dark:text-green-400" : "")}>
                  {inN ? "+" : "−"}
                  {formatMoney(r.amount, r.currency, t.intl)}
                </span>
                <div className="flex">
                  <Button variant="ghost" size="icon" className="size-8" asChild>
                    <a href={`/print/${slug}/finance/payments/${r.id}`} target="_blank" rel="noopener" aria-label={inN ? t("Print receipt") : t("Print payment voucher")}>
                      <Printer className="size-4" />
                    </a>
                  </Button>
                  {!r.locked && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-8 text-muted-foreground hover:text-destructive"
                      disabled={pending}
                      aria-label={t("Delete {code}", { code: r.code })}
                      onClick={() =>
                        confirm(t("Delete this payment? The invoices or bills it settled become unpaid again.")) &&
                        start(async () => {
                          const res = await deletePayment(r.id, slug);
                          if (!res.ok) toast.error(res.error);
                        })
                      }
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
