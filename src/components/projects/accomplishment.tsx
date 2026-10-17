import { CircleCheck, CircleMinus, TrendingDown, TrendingUp } from "lucide-react";
import type { Accomplishment, ScheduleState } from "@/lib/accomplishment";
import { cn } from "@/lib/utils";

export const fmtPct = (n: number | null) =>
  n === null ? "—" : `${Number.isInteger(n) ? n : n.toFixed(1)}%`;

const SCHEDULE: Record<ScheduleState, { label: string; icon: typeof TrendingUp; className: string }> = {
  ahead: {
    label: "Ahead of plan",
    icon: TrendingUp,
    className: "border-green-600/30 bg-green-600/10 text-green-700 dark:text-green-400",
  },
  on_track: {
    label: "On track",
    icon: CircleCheck,
    className: "border-primary/30 bg-primary/10 text-primary",
  },
  behind: {
    label: "Behind plan",
    icon: TrendingDown,
    className: "border-destructive/30 bg-destructive/10 text-destructive",
  },
};

/** Schedule state with icon + text (never colour alone). */
export function ScheduleBadge({
  state,
  short,
  className,
}: {
  state: ScheduleState | null;
  short?: boolean;
  className?: string;
}) {
  if (!state) {
    return (
      <span
        className={cn(
          "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs text-muted-foreground",
          className,
        )}
      >
        <CircleMinus className="size-3.5" aria-hidden />
        No schedule
      </span>
    );
  }
  const s = SCHEDULE[state];
  const Icon = s.icon;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium",
        s.className,
        className,
      )}
    >
      <Icon className="size-3.5" aria-hidden />
      {short ? s.label.replace(" of plan", "").replace(" plan", "") : s.label}
    </span>
  );
}

/**
 * Single-series meter: teal fill on a lighter teal track, with a thin marker
 * where the project should be today.
 */
export function AccomplishmentMeter({
  actual,
  planned,
  size = "md",
  label,
  className,
}: {
  actual: number | null;
  planned: number | null;
  size?: "sm" | "md" | "lg";
  label: string;
  className?: string;
}) {
  const value = actual ?? 0;
  const height = size === "lg" ? "h-3" : size === "md" ? "h-2" : "h-1.5";
  const description =
    planned === null ? `${fmtPct(actual)} done` : `${fmtPct(actual)} done, planned ${fmtPct(planned)} by today`;
  return (
    <div className={cn("relative", className)} title={description}>
      <div
        role="meter"
        aria-label={label}
        aria-valuenow={value}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuetext={description}
        className={cn("overflow-hidden rounded-full bg-primary/15", height)}
      >
        <div className="h-full rounded-full bg-primary transition-[width] duration-300" style={{ width: `${value}%` }} />
      </div>
      {planned !== null && (
        <span
          aria-hidden
          className={cn(
            "absolute top-1/2 w-0.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-foreground/70 ring-2 ring-background",
            size === "lg" ? "h-5" : "h-3.5",
          )}
          style={{ left: `${Math.min(100, Math.max(0, planned))}%` }}
        />
      )}
    </div>
  );
}

/** Compact one-line summary for headers and cards. */
export function AccomplishmentSummary({ a, className }: { a: Accomplishment; className?: string }) {
  if (a.mode === "empty") {
    return <span className={cn("text-xs text-muted-foreground", className)}>No tasks yet</span>;
  }
  return (
    <span className={cn("inline-flex items-center gap-2", className)}>
      <span className="text-sm font-semibold">{fmtPct(a.actual)} done</span>
      <ScheduleBadge state={a.schedule} short />
    </span>
  );
}
