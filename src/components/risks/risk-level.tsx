import { CircleAlert, ShieldAlert, ShieldCheck } from "lucide-react";
import { riskLevel, riskScore, type RiskLevel } from "@/lib/risks";
import { cn } from "@/lib/utils";
import type { T } from "@/i18n/translate";

/** Icon + text + colour for each level, so the level never relies on colour alone. */
export const LEVEL_STYLE: Record<RiskLevel, { icon: typeof ShieldAlert; label: string; badge: string; cell: string }> = {
  high: {
    icon: ShieldAlert,
    label: "High",
    badge: "border-destructive/30 bg-destructive/10 text-destructive",
    cell: "bg-destructive/15",
  },
  medium: {
    icon: CircleAlert,
    label: "Medium",
    badge: "border-amber-500/40 bg-amber-500/10 text-amber-800 dark:text-amber-300",
    cell: "bg-amber-500/15",
  },
  low: {
    icon: ShieldCheck,
    label: "Low",
    badge: "border-green-600/30 bg-green-600/10 text-green-700 dark:text-green-400",
    cell: "bg-green-600/10",
  },
};

/** "High · 20" chip. Works in server and client components (pass the translator). */
export function RiskLevelBadge({ likelihood, impact, t, className }: { likelihood: number; impact: number; t: T; className?: string }) {
  const score = riskScore(likelihood, impact);
  const s = LEVEL_STYLE[riskLevel(score)];
  return (
    <span className={cn("inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-xs font-medium whitespace-nowrap", s.badge, className)}>
      <s.icon className="size-3.5" aria-hidden />
      <span>
        {t(s.label)} · <span className="tabular-nums">{score}</span>
      </span>
    </span>
  );
}
