/**
 * Cost forecast (pure), the "earned value" way: if the work done so far cost
 * what it cost, the whole project will cost  spent ÷ (% done).
 *
 *   value of work done (EV) = budget × % done
 *   cost efficiency (CPI)   = EV ÷ spent        (1 = on budget, < 1 = spending faster than progress)
 *   expected final cost     = spent ÷ % done    (= budget ÷ CPI)
 *   schedule efficiency     = % done ÷ % planned by today
 */

export type CostHealth = "good" | "watch" | "bad";

export type Forecast =
  | { ready: false; reason: "no-progress" | "no-spending" }
  | {
      ready: true;
      /** Expected total cost when the project finishes. */
      final: number;
      /** Still to spend (final − spent). */
      toGo: number;
      /** Less than 10% of the work is done: the estimate can still move a lot. */
      early: boolean;
      /** All the work is done: the final cost is what's been spent. */
      done: boolean;
      /** final − budget (positive = over), or null without a budget. */
      overBy: number | null;
      /** overBy as % of budget. */
      overPct: number | null;
      /** % of budget spent so far. */
      spentPct: number | null;
      donePct: number;
      /** Cost efficiency (CPI), or null without a budget. */
      costIndex: number | null;
      /** Schedule efficiency (SPI), or null without a plan for today. */
      scheduleIndex: number | null;
      health: CostHealth | null;
    };

/** Up to this far over budget still counts as on budget (rounding, small extras). */
export const FORECAST_TOLERANCE_PCT = 2;
/** Beyond this far over budget is a real problem, not just something to watch. */
export const FORECAST_ALARM_PCT = 10;

const round2 = (v: number) => Math.round(v * 100) / 100;
const round1 = (v: number) => Math.round(v * 10) / 10;

export function computeForecast({
  budget,
  spent,
  donePct,
  plannedPct,
}: {
  budget: number | null;
  spent: number;
  /** Accomplishment 0–100 (null = no tasks). */
  donePct: number | null;
  /** Planned by today 0–100 (null = no dates). */
  plannedPct: number | null;
}): Forecast {
  if (donePct === null || donePct <= 0) return { ready: false, reason: "no-progress" };
  if (spent <= 0) return { ready: false, reason: "no-spending" };

  const done = donePct >= 100;
  const final = round2(done ? spent : spent / (donePct / 100));
  const hasBudget = budget !== null && budget > 0;
  const overBy = hasBudget ? round2(final - budget) : null;
  const overPct = hasBudget ? round1((overBy! / budget) * 100) : null;
  return {
    ready: true,
    final,
    toGo: round2(Math.max(0, final - spent)),
    early: !done && donePct < 10,
    done,
    overBy,
    overPct,
    spentPct: hasBudget ? round1((spent / budget) * 100) : null,
    donePct: round1(donePct),
    costIndex: hasBudget ? round2((budget * (donePct / 100)) / spent) : null,
    scheduleIndex: plannedPct ? round2(donePct / plannedPct) : null,
    health:
      overPct === null ? null : overPct <= FORECAST_TOLERANCE_PCT ? "good" : overPct <= FORECAST_ALARM_PCT ? "watch" : "bad",
  };
}
