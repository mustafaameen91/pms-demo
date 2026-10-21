import { AlertTriangle, CircleCheck, Info, TrendingUp } from "lucide-react";
import type { Forecast } from "@/lib/forecast";
import { cn, formatMoney } from "@/lib/utils";
import type { T } from "@/i18n/translate";

const HEALTH = {
  good: { icon: CircleCheck, className: "text-green-700 dark:text-green-400" },
  watch: { icon: AlertTriangle, className: "text-amber-700 dark:text-amber-400" },
  bad: { icon: AlertTriangle, className: "text-destructive" },
} as const;

/** One line on where the money is heading, e.g. "Heading 33% over budget". */
export function forecastHeadline(f: Forecast, currency: string, t: T): string | null {
  if (!f.ready || f.overBy === null) return null;
  const amount = formatMoney(Math.abs(f.overBy), currency, t.intl);
  if (f.done) return f.overBy > 0 ? t("Finished {amount} over budget", { amount }) : t("Finished within budget");
  if (f.health === "good") return f.overBy < 0 ? t("Heading {amount} under budget", { amount }) : t("Heading for the budget");
  return t("Heading {amount} over budget ({pct}%)", { amount, pct: String(f.overPct) });
}

/**
 * Expected final cost with a plain-words explanation. Works in server and
 * client components (pass the translator).
 */
export function ForecastBlock({ forecast: f, currency, t, className }: { forecast: Forecast; currency: string; t: T; className?: string }) {
  const money = (v: number) => formatMoney(v, currency, t.intl);
  if (!f.ready) {
    return (
      <div className={cn("text-sm", className)}>
        <p className="flex items-center gap-1.5 font-medium">
          <TrendingUp className="size-4 text-muted-foreground" aria-hidden />
          {t("Cost forecast")}
        </p>
        <p className="mt-1 text-muted-foreground">
          {f.reason === "no-progress"
            ? t("No forecast yet. It starts once some of the work is done.")
            : t("No forecast yet. Nothing has been spent so far.")}
        </p>
      </div>
    );
  }
  const headline = forecastHeadline(f, currency, t);
  const health = f.health ? HEALTH[f.health] : null;
  return (
    <div className={cn("text-sm", className)}>
      <p className="flex items-center gap-1.5 font-medium">
        <TrendingUp className="size-4 text-muted-foreground" aria-hidden />
        {f.done ? t("Final cost") : t("Expected final cost")}
      </p>
      <p className={cn("mt-1 text-2xl font-semibold tabular-nums", f.health === "bad" && "text-destructive")}>{money(f.final)}</p>
      {headline && health && (
        <p className={cn("mt-1 flex items-start gap-1.5 font-medium", health.className)}>
          <health.icon className="mt-0.5 size-4 shrink-0" aria-hidden />
          {headline}
        </p>
      )}
      <ul className="mt-2 grid gap-1 text-xs text-muted-foreground">
        <li>
          {f.spentPct !== null
            ? t("{spent}% of the budget spent for {done}% of the work.", { spent: String(f.spentPct), done: String(f.donePct) })
            : t("Based on {done}% of the work done.", { done: String(f.donePct) })}{" "}
          {f.costIndex !== null &&
            !f.done &&
            (f.costIndex < 1
              ? t("Spending is running ahead of progress.")
              : t("Spending is in step with progress."))}
        </li>
        {!f.done && <li>{t("About {amount} still to spend.", { amount: money(f.toGo) })}</li>}
        {f.scheduleIndex !== null && !f.done && (
          <li>
            {f.scheduleIndex < 0.95
              ? t("Work is moving at {pct}% of the planned pace.", { pct: String(Math.round(f.scheduleIndex * 100)) })
              : t("Work is keeping up with the plan.")}
          </li>
        )}
        {f.early && (
          <li className="flex items-start gap-1 text-amber-800 dark:text-amber-300">
            <Info className="mt-0.5 size-3 shrink-0" aria-hidden />
            {t("Early estimate: less than 10% of the work is done, so it can still change a lot.")}
          </li>
        )}
        <li>{t("Expected final cost = spent ÷ % of work done.")}</li>
      </ul>
    </div>
  );
}
