import type { ReportData } from "@/lib/finance/report-data";
import { AGE_BUCKETS, CASH_GROUPS } from "@/lib/finance/reports";
import type { T } from "@/i18n/translate";
import { cn } from "@/lib/utils";


type Money = (c: number) => string;

function Row({ m, label, value, strong, indent, tone, href, code }: { m: Money; label: string; value: number | string; strong?: boolean; indent?: boolean; tone?: "bad" | "good"; href?: string; code?: string }) {
  return (
    <tr className={cn("border-b last:border-0", strong && "font-semibold")}>
      <td className={cn("px-4 py-2", indent && "ps-8")}>
        {code && (
          <span className="me-2 text-xs text-muted-foreground tabular-nums" dir="ltr">
            {code}
          </span>
        )}
        {href ? (
          <a href={href} className="hover:text-primary">
            {label}
          </a>
        ) : (
          label
        )}
      </td>
      <td className={cn("px-4 py-2 text-end tabular-nums", tone === "bad" && "text-destructive", tone === "good" && "text-green-700 dark:text-green-400")}>{typeof value === "number" ? m(value) : value}</td>
    </tr>
  );
}

function Table({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative overflow-x-auto">
      <table className="w-full min-w-[28rem] text-sm">
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}

function Section({ title }: { title: string }) {
  return (
    <tr className="bg-muted/40">
      <th colSpan={2} className="px-4 py-2 text-start text-xs font-semibold tracking-wide text-muted-foreground uppercase">
        {title}
      </th>
    </tr>
  );
}

/**
 * A finance report as plain tables (no hooks): shown on the Reports page and
 * on the printed page. `t` is the reader's (or the paper's) language.
 */
export function ReportBody({ data, t, currency, accountHref }: { data: ReportData; t: T; currency: string; accountHref?: (id: string) => string }) {
  const m = (c: number) => {
    try {
      return new Intl.NumberFormat(t.intl, { style: "currency", currency, minimumFractionDigits: 2 }).format(c / 100);
    } catch {
      return (c / 100).toFixed(2);
    }
  };
  switch (data.key) {
    case "pl": {
      const p = data.pl;
      return (
        <Table>
          <Section title={t("Income")} />
          {p.income.map((r) => (
            <Row m={m} key={r.account.id} label={t(r.account.name)} code={r.account.code} value={r.amount} indent href={accountHref?.(r.account.id)} />
          ))}
          <Row m={m} label={t("Total income")} value={p.totalIncome} strong />
          <Section title={t("Expenses")} />
          {p.expenses.map((r) => (
            <Row m={m} key={r.account.id} label={t(r.account.name)} code={r.account.code} value={r.amount} indent href={accountHref?.(r.account.id)} />
          ))}
          <Row m={m} label={t("Total expenses")} value={p.totalExpenses} strong />
          <Row m={m} label={p.profit >= 0 ? t("Profit") : t("Loss")} value={Math.abs(p.profit)} strong tone={p.profit >= 0 ? "good" : "bad"} />
        </Table>
      );
    }
    case "bs": {
      const b = data.bs;
      return (
        <Table>
          <Section title={t("What we have (assets)")} />
          {b.assets.map((r) => (
            <Row m={m} key={r.account.id} label={t(r.account.name)} code={r.account.code} value={r.amount} indent href={accountHref?.(r.account.id)} />
          ))}
          <Row m={m} label={t("Total assets")} value={b.totalAssets} strong />
          <Section title={t("What we owe (liabilities)")} />
          {b.liabilities.map((r) => (
            <Row m={m} key={r.account.id} label={t(r.account.name)} code={r.account.code} value={r.amount} indent href={accountHref?.(r.account.id)} />
          ))}
          <Row m={m} label={t("Total liabilities")} value={b.totalLiabilities} strong />
          <Section title={t("Owners' equity")} />
          {b.equity.map((r) => (
            <Row m={m} key={r.account.id} label={t(r.account.name)} code={r.account.code} value={r.amount} indent href={accountHref?.(r.account.id)} />
          ))}
          <Row m={m} label={t("Profit kept in the business")} value={b.profit} indent />
          <Row m={m} label={t("Total equity")} value={b.totalEquity} strong />
          <Row m={m} label={t("Liabilities + equity")} value={b.totalLiabilities + b.totalEquity} strong tone={b.balanced ? undefined : "bad"} />
        </Table>
      );
    }
    case "cf": {
      const c = data.cf;
      return (
        <Table>
          <Row m={m} label={t("Cash at the start")} value={c.start} strong />
          {c.rows.map((r) => (
            <Row m={m} key={r.key} label={t(CASH_GROUPS[r.key])} value={r.amount} indent tone={r.amount < 0 ? "bad" : "good"} />
          ))}
          <Row m={m} label={t("Change in the period")} value={c.change} strong tone={c.change < 0 ? "bad" : "good"} />
          <Row m={m} label={t("Cash at the end")} value={c.end} strong />
        </Table>
      );
    }
    case "tb": {
      const tb = data.tb;
      return (
        <div className="relative overflow-x-auto">
          <table className="w-full min-w-[32rem] text-sm">
            <thead>
              <tr className="border-b text-xs text-muted-foreground">
                <th className="px-4 py-2 text-start font-medium">{t("Account")}</th>
                <th className="px-4 py-2 text-end font-medium">{t("Debit")}</th>
                <th className="px-4 py-2 text-end font-medium">{t("Credit")}</th>
              </tr>
            </thead>
            <tbody>
              {tb.rows.map((r) => (
                <tr key={r.account.id} className="border-b">
                  <td className="px-4 py-1.5">
                    <span className="me-2 text-xs text-muted-foreground tabular-nums" dir="ltr">
                      {r.account.code}
                    </span>
                    {t(r.account.name)}
                  </td>
                  <td className="px-4 py-1.5 text-end tabular-nums">{r.debit ? m(r.debit) : ""}</td>
                  <td className="px-4 py-1.5 text-end tabular-nums">{r.credit ? m(r.credit) : ""}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className={cn("font-semibold", !tb.balanced && "text-destructive")}>
                <td className="px-4 py-2">{tb.balanced ? t("Total (balanced)") : t("Total (not balanced)")}</td>
                <td className="px-4 py-2 text-end tabular-nums">{m(tb.debit)}</td>
                <td className="px-4 py-2 text-end tabular-nums">{m(tb.credit)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      );
    }
    case "projects":
      return data.projects.length === 0 ? (
        <p className="px-4 py-8 text-center text-sm text-muted-foreground">{t("No project income or costs in this period.")}</p>
      ) : (
        <div className="relative overflow-x-auto">
          <table className="w-full min-w-[36rem] text-sm">
            <thead>
              <tr className="border-b text-xs text-muted-foreground">
                <th className="px-4 py-2 text-start font-medium">{t("Project")}</th>
                <th className="px-4 py-2 text-end font-medium">{t("Income")}</th>
                <th className="px-4 py-2 text-end font-medium">{t("Costs")}</th>
                <th className="px-4 py-2 text-end font-medium">{t("Profit")}</th>
                <th className="px-4 py-2 text-end font-medium">{t("Margin")}</th>
              </tr>
            </thead>
            <tbody>
              {data.projects.map((p) => (
                <tr key={p.projectId} className="border-b last:border-0">
                  <td className="px-4 py-2" dir="auto">
                    {p.name} <span className="text-xs text-muted-foreground">{p.code}</span>
                  </td>
                  <td className="px-4 py-2 text-end tabular-nums">{m(p.income)}</td>
                  <td className="px-4 py-2 text-end tabular-nums">{m(p.costs)}</td>
                  <td className={cn("px-4 py-2 text-end font-semibold tabular-nums", p.profit < 0 && "text-destructive")}>{m(p.profit)}</td>
                  <td className="px-4 py-2 text-end tabular-nums">{p.margin === null ? "—" : `${Math.round(p.margin * 100)}%`}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    case "ar":
    case "ap":
      return data.aging.length === 0 ? (
        <p className="px-4 py-8 text-center text-sm text-muted-foreground">{data.key === "ar" ? t("No one owes you anything.") : t("You don't owe any supplier.")}</p>
      ) : (
        <div className="relative overflow-x-auto">
          <table className="w-full min-w-[44rem] text-sm">
            <thead>
              <tr className="border-b text-xs text-muted-foreground">
                <th className="px-4 py-2 text-start font-medium">{data.key === "ar" ? t("Customer") : t("Supplier")}</th>
                {AGE_BUCKETS.map((b) => (
                  <th key={b.key} className="px-3 py-2 text-end font-medium">
                    {t(b.label)}
                  </th>
                ))}
                <th className="px-4 py-2 text-end font-medium">{t("Total")}</th>
              </tr>
            </thead>
            <tbody>
              {data.aging.map((r) => (
                <tr key={r.contactId} className="border-b last:border-0">
                  <td className="px-4 py-2" dir="auto">
                    {r.name}
                  </td>
                  {AGE_BUCKETS.map((b) => (
                    <td key={b.key} className={cn("px-3 py-2 text-end tabular-nums", b.key !== "current" && r[b.key] > 0 && "text-destructive")}>
                      {r[b.key] ? m(r[b.key]) : ""}
                    </td>
                  ))}
                  <td className="px-4 py-2 text-end font-semibold tabular-nums">{m(r.total)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="font-semibold">
                <td className="px-4 py-2">{t("Total")}</td>
                {AGE_BUCKETS.map((b) => (
                  <td key={b.key} className="px-3 py-2 text-end tabular-nums">
                    {m(data.aging.reduce((s, r) => s + r[b.key], 0))}
                  </td>
                ))}
                <td className="px-4 py-2 text-end tabular-nums">{m(data.aging.reduce((s, r) => s + r.total, 0))}</td>
              </tr>
            </tfoot>
          </table>
          {data.key === "ar" && <p className="px-4 py-2 text-xs text-muted-foreground">{t("Retention held by customers counts as not due yet.")}</p>}
        </div>
      );
    case "tax":
      return (
        <Table>
          <Row m={m} label={t("{name} collected on sales", { name: data.tax.name })} value={data.tax.collected} />
          <Row m={m} label={t("{name} paid on purchases", { name: data.tax.name })} value={data.tax.paid} />
          <Row m={m} label={data.tax.net >= 0 ? t("To pay the tax office") : t("To claim back")} value={Math.abs(data.tax.net)} strong tone={data.tax.net >= 0 ? "bad" : "good"} />
          {data.tax.number && <Row m={m} label={t("Tax number")} value={data.tax.number} />}
        </Table>
      );
  }
}
