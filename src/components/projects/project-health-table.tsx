import Link from "next/link";
import { AlertTriangle, TrendingUp } from "lucide-react";
import type { ProjectHealth } from "@/lib/data/project-health";
import { cn, formatDate, formatMoney } from "@/lib/utils";
import { AccomplishmentMeter, ScheduleBadge, fmtPct } from "@/components/projects/accomplishment";
import { ProjectStatusBadge } from "@/components/projects/project-status-badge";
import { getT } from "@/i18n/server";

/** One row per project: status, progress vs plan, money, end date, late tasks. Used by the dashboard and portfolios. */
export async function ProjectHealthTable({ rows, base }: { rows: ProjectHealth[]; base: string }) {
  const t = await getT();
  return (
    <div className="relative overflow-x-auto">
      <table className="w-full min-w-[980px] text-sm">
        <thead className="text-start text-xs text-muted-foreground">
          <tr className="border-b bg-muted/40">
            <th scope="col" className="py-2 pe-3 ps-4 font-medium">{t("Project")}</th>
            <th scope="col" className="px-3 py-2 font-medium">{t("Status")}</th>
            <th scope="col" className="w-56 px-3 py-2 font-medium">{t("Accomplishment")}</th>
            <th scope="col" className="w-48 px-3 py-2 font-medium">{t("Spent / budget")}</th>
            <th scope="col" className="px-3 py-2 font-medium">{t("End date")}</th>
            <th scope="col" className="py-2 pe-4 ps-3 text-end font-medium">{t("Late tasks")}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(({ p, accomplishment: a, money, forecast, headingOver, late, daysLeft, overdue, finished }) => (
            <tr key={p.id} className={cn("border-b last:border-b-0", finished && "text-muted-foreground")}>
              <td className="py-3 pe-3 ps-4">
                <Link href={`${base}/p/${p.key}/overview`} className="flex items-center gap-2 font-medium hover:underline">
                  <span aria-hidden className="size-2.5 shrink-0 rounded-sm" style={{ backgroundColor: p.color }} />
                  {p.name}
                  <span className="font-mono text-xs font-normal text-muted-foreground">{p.key}</span>
                </Link>
                {p.client && <p className="ps-4.5 text-xs text-muted-foreground">{p.client}</p>}
              </td>
              <td className="px-3 py-3">
                <ProjectStatusBadge status={p.status} />
              </td>
              <td className="px-3 py-3">
                {a.mode === "empty" ? (
                  <span className="text-xs text-muted-foreground">{t("No tasks yet")}</span>
                ) : (
                  <div className="grid gap-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium tabular-nums">{fmtPct(a.actual)}</span>
                      {!finished && <ScheduleBadge state={a.schedule} short />}
                    </div>
                    <AccomplishmentMeter actual={a.actual} planned={finished ? null : a.planned} size="sm" label={t("{name} accomplishment", { name: p.name })} />
                  </div>
                )}
              </td>
              <td className="px-3 py-3">
                <p className={cn("tabular-nums", money.overBudget && "font-medium text-destructive")}>
                  {formatMoney(money.actual, p.currency, t.intl)}
                  <span className="text-muted-foreground">
                    {" "}
                    / {money.budget === null ? t("no budget") : formatMoney(money.budget, p.currency, t.intl)}
                  </span>
                </p>
                {money.overBudget && (
                  <p className="flex items-center gap-1 text-xs text-destructive">
                    <AlertTriangle className="size-3" aria-hidden />
                    {t("Over budget")}
                  </p>
                )}
                {headingOver && forecast.ready ? (
                  <p
                    className={cn(
                      "flex items-center gap-1 text-xs",
                      forecast.health === "bad" ? "font-medium text-destructive" : "text-amber-700 dark:text-amber-400",
                    )}
                  >
                    <TrendingUp className="size-3" aria-hidden />
                    {t("Heading {pct}% over budget", { pct: String(forecast.overPct) })}
                  </p>
                ) : (
                  !money.overBudget &&
                  money.usedPct !== null && (
                    <p className="text-xs text-muted-foreground">{t("{pct}% used", { pct: String(money.usedPct) })}</p>
                  )
                )}
              </td>
              <td className="px-3 py-3 whitespace-nowrap">
                <p className="tabular-nums">{formatDate(p.endDate, t.intl)}</p>
                {!finished && daysLeft !== null && (
                  <p className={cn("text-xs", overdue ? "font-medium text-destructive" : "text-muted-foreground")}>
                    {overdue
                      ? t.plural(-daysLeft, "{count} days overdue", "{count} days overdue")
                      : daysLeft === 0
                        ? t("Ends today")
                        : t.plural(daysLeft, "{count} days left", "{count} days left")}
                  </p>
                )}
              </td>
              <td className={cn("py-3 pe-4 ps-3 text-end font-medium tabular-nums", late > 0 && !finished && "text-destructive")}>
                {late}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
