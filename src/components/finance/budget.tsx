"use client";

import { useState, useTransition } from "react";
import { Copy, Loader2, Save } from "lucide-react";
import { toast } from "sonner";
import { saveBudget } from "@/lib/actions/finance";
import { useT } from "@/i18n/client";
import { Button } from "@/components/ui/button";

type Row = { accountId: string; code: string; name: string; type: string; months: string[] };

/** A grid of 12 months per income / expense account. */
export function BudgetEditor({ slug, year, monthLabels, rows }: { slug: string; year: number; monthLabels: string[]; rows: Row[] }) {
  const t = useT();
  const [grid, setGrid] = useState(rows);
  const [pending, start] = useTransition();
  const set = (i: number, m: number, v: string) => setGrid(grid.map((r, j) => (j === i ? { ...r, months: r.months.map((x, k) => (k === m ? v : x)) } : r)));
  const fill = (i: number) => setGrid(grid.map((r, j) => (j === i ? { ...r, months: r.months.map(() => r.months[0]) } : r)));
  const total = (r: Row) => r.months.reduce((s, v) => s + (Number(String(v).replace(/,/g, "")) || 0), 0);
  return (
    <div className="grid gap-3">
      <div className="relative overflow-x-auto rounded-2xl border bg-card">
        <table className="w-full min-w-[64rem] text-sm">
          <thead className="text-xs text-muted-foreground">
            <tr className="border-b">
              <th className="sticky z-10 bg-card px-3 py-2 text-start font-medium inset-s-0">{t("Account")}</th>
              {monthLabels.map((m) => (
                <th key={m} className="px-1 py-2 text-end font-medium">
                  {m}
                </th>
              ))}
              <th className="px-3 py-2 text-end font-medium">{t("Year")}</th>
            </tr>
          </thead>
          <tbody>
            {grid.map((r, i) => (
              <tr key={r.accountId} className="border-b last:border-0">
                <th scope="row" className="sticky z-10 bg-card px-3 py-1 text-start font-normal inset-s-0">
                  <span className="flex items-center gap-1">
                    <span className="max-w-48 truncate" dir="auto">
                      {t(r.name)}
                    </span>
                    <button type="button" onClick={() => fill(i)} className="cursor-pointer rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground" aria-label={t("Copy the first month to every month for {name}", { name: t(r.name) })} title={t("Same amount every month")}>
                      <Copy className="size-3.5" />
                    </button>
                  </span>
                </th>
                {r.months.map((v, m) => (
                  <td key={m} className="p-0.5">
                    <input
                      dir="ltr"
                      inputMode="decimal"
                      aria-label={`${t(r.name)} ${monthLabels[m]}`}
                      value={v === "0" ? "" : v}
                      placeholder="0"
                      onChange={(e) => set(i, m, e.target.value)}
                      className="h-8 w-20 rounded-md border border-transparent bg-transparent px-1.5 text-end tabular-nums hover:border-input focus:border-ring focus:outline-none"
                    />
                  </td>
                ))}
                <td className="px-3 text-end font-medium tabular-nums">{total(r).toLocaleString(t.intl)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex justify-end">
        <Button
          disabled={pending}
          onClick={() =>
            start(async () => {
              const res = await saveBudget(slug, year, grid.map((r) => ({ accountId: r.accountId, months: r.months })));
              if (!res.ok) return void toast.error(res.error);
              toast.success(t("Budget saved"));
            })
          }
        >
          {pending ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
          {t("Save budget")}
        </Button>
      </div>
    </div>
  );
}
