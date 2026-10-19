"use client";

import { AlertTriangle, Diamond, Lock, Minus, Repeat, SignalHigh, SignalLow, SignalMedium } from "lucide-react";
import { cn } from "@/lib/utils";
import { PRIORITIES, type Priority } from "@/lib/constants";
import { useT } from "@/i18n/client";

const priorityIcon = {
  none: Minus,
  low: SignalLow,
  medium: SignalMedium,
  high: SignalHigh,
  urgent: AlertTriangle,
} as const;

export function PriorityIcon({ priority, className }: { priority: Priority; className?: string }) {
  const t = useT();
  const Icon = priorityIcon[priority];
  return (
    <Icon
      aria-label={t(PRIORITIES.find((x) => x.value === priority)?.label ?? priority)}
      className={cn(
        "size-4 shrink-0",
        priority === "urgent" ? "text-brand-accent" : "text-muted-foreground",
        className,
      )}
    />
  );
}

/** ◆ for milestones (decorative; the row text says "Milestone" to screen readers). */
export function MilestoneIcon({ className }: { className?: string }) {
  const t = useT();
  return (
    <>
      <Diamond className={cn("size-3.5 shrink-0 fill-current text-brand-accent", className)} aria-hidden />
      <span className="sr-only">{t("Milestone:")}</span>
    </>
  );
}

/** Shown when a task waits on unfinished tasks. Icon + text, never colour alone. */
export function BlockedBadge({ count, className }: { count: number; className?: string }) {
  const t = useT();
  return (
    <span
      title={t.plural(count, "Waiting on {count} unfinished task", "Waiting on {count} unfinished tasks")}
      className={cn(
        "inline-flex shrink-0 items-center gap-1 rounded border border-amber-500/40 bg-amber-500/10 px-1.5 py-0.5 text-[11px] font-medium text-amber-800 dark:text-amber-300",
        className,
      )}
    >
      <Lock className="size-3" aria-hidden />
      {t("Blocked")}
    </span>
  );
}

/** 🔁 marker for repeating tasks (with a text alternative). */
export function RepeatIcon({ rule, className }: { rule: string; className?: string }) {
  const t = useT();
  const label = t("Repeats {rule}", { rule: t(rule) });
  return (
    <span title={label} className={cn("inline-flex shrink-0 text-muted-foreground", className)}>
      <Repeat className="size-3.5" aria-hidden />
      <span className="sr-only">{label}</span>
    </span>
  );
}
