/** Adding projects up into a portfolio (pure). */
import type { Forecast } from "@/lib/forecast";

export type HealthRow = {
  currency: string;
  finished: boolean;
  /** Accomplishment 0–100 (null = no tasks). */
  actual: number | null;
  planned: number | null;
  behind: boolean;
  overBudget: boolean;
  headingOver: boolean;
  budget: number | null;
  spent: number;
  forecast: Forecast;
};

export type CurrencyTotals = {
  currency: string;
  projects: number;
  budget: number;
  spent: number;
  /** Expected total at the end: each project's forecast, or its budget (else what's spent) when there's no forecast yet. */
  expected: number;
  /** expected − budget, only when every project in this currency has a budget. */
  overBy: number | null;
  withoutBudget: number;
};

const round2 = (v: number) => Math.round(v * 100) / 100;

export function summarizePortfolio(rows: HealthRow[]) {
  const open = rows.filter((r) => !r.finished);
  const withTasks = rows.filter((r) => r.actual !== null);
  const withPlan = rows.filter((r) => r.planned !== null && !r.finished);
  const avg = (xs: number[]) => (xs.length ? Math.round((xs.reduce((s, x) => s + x, 0) / xs.length) * 10) / 10 : null);

  const byCurrency = new Map<string, CurrencyTotals>();
  for (const r of rows) {
    const c = byCurrency.get(r.currency) ?? { currency: r.currency, projects: 0, budget: 0, spent: 0, expected: 0, overBy: null, withoutBudget: 0 };
    c.projects += 1;
    c.budget = round2(c.budget + (r.budget ?? 0));
    c.spent = round2(c.spent + r.spent);
    c.expected = round2(c.expected + (r.forecast.ready ? r.forecast.final : Math.max(r.budget ?? 0, r.spent)));
    if (r.budget === null || r.budget <= 0) c.withoutBudget += 1;
    byCurrency.set(r.currency, c);
  }
  for (const c of byCurrency.values()) c.overBy = c.withoutBudget === 0 ? round2(c.expected - c.budget) : null;

  return {
    projects: rows.length,
    open: open.length,
    finished: rows.length - open.length,
    /** Each project counts equally. */
    avgActual: avg(withTasks.map((r) => r.actual!)),
    avgPlanned: avg(withPlan.map((r) => r.planned!)),
    behind: open.filter((r) => r.behind).length,
    overBudget: open.filter((r) => r.overBudget).length,
    headingOver: open.filter((r) => r.headingOver).length,
    money: [...byCurrency.values()].sort((a, b) => b.projects - a.projects || a.currency.localeCompare(b.currency)),
  };
}
export type PortfolioSummary = ReturnType<typeof summarizePortfolio>;
