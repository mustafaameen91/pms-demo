/** Risk register rules (pure): likelihood × impact on a 1–5 scale each. */

export const RISK_CATEGORIES = [
  { value: "schedule", label: "Schedule" },
  { value: "cost", label: "Cost" },
  { value: "safety", label: "Safety" },
  { value: "quality", label: "Quality" },
  { value: "technical", label: "Technical" },
  { value: "permits", label: "Permits & legal" },
  { value: "supply", label: "Suppliers & materials" },
  { value: "weather", label: "Weather & site" },
  { value: "other", label: "Other" },
] as const;
export type RiskCategory = (typeof RISK_CATEGORIES)[number]["value"];

export const LIKELIHOOD_LABELS = ["Rare", "Unlikely", "Possible", "Likely", "Almost certain"] as const;
export const IMPACT_LABELS = ["Negligible", "Minor", "Moderate", "Major", "Severe"] as const;

export const RISK_STATUSES = [
  { value: "open", label: "Open|risk" },
  { value: "watching", label: "Watching|risk" },
  { value: "closed", label: "Closed|risk" },
] as const;
export type RiskStatus = (typeof RISK_STATUSES)[number]["value"];

export type RiskLevel = "low" | "medium" | "high";

export const riskScore = (likelihood: number, impact: number) => likelihood * impact;

/** 1–4 low, 5–12 medium, 15–25 high (the usual 5 × 5 matrix bands). */
export function riskLevel(score: number): RiskLevel {
  if (score >= 15) return "high";
  if (score >= 5) return "medium";
  return "low";
}

/** Risks still being dealt with (not closed). */
export const isActiveRisk = (r: { status: string }) => r.status !== "closed";

/** Highest score first; ties: higher impact first, then the older (lower number) one. */
export function byScore<T extends { likelihood: number; impact: number; number: number }>(a: T, b: T) {
  return riskScore(b.likelihood, b.impact) - riskScore(a.likelihood, a.impact) || b.impact - a.impact || a.number - b.number;
}

/** Count of risks in each matrix cell: cells[likelihood - 1][impact - 1]. */
export function riskMatrix(risks: { likelihood: number; impact: number }[]) {
  const cells = Array.from({ length: 5 }, () => Array<number>(5).fill(0));
  for (const r of risks) cells[r.likelihood - 1][r.impact - 1] += 1;
  return cells;
}
