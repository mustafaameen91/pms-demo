import { AlertTriangle, Diamond, Lock, Minus, SignalHigh, SignalLow, SignalMedium } from "lucide-react";
import { cn, initials } from "@/lib/utils";
import { PRIORITIES, type Priority } from "@/lib/constants";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

const priorityIcon = {
  none: Minus,
  low: SignalLow,
  medium: SignalMedium,
  high: SignalHigh,
  urgent: AlertTriangle,
} as const;

export function priorityLabel(p: Priority) {
  return PRIORITIES.find((x) => x.value === p)?.label ?? p;
}

export function PriorityIcon({ priority, className }: { priority: Priority; className?: string }) {
  const Icon = priorityIcon[priority];
  return (
    <Icon
      aria-label={priorityLabel(priority)}
      className={cn(
        "size-4 shrink-0",
        priority === "urgent" ? "text-brand-accent" : "text-muted-foreground",
        className,
      )}
    />
  );
}

export function StatusDot({ color, className }: { color: string; className?: string }) {
  return (
    <span
      aria-hidden
      className={cn("inline-block size-2.5 shrink-0 rounded-full", className)}
      style={{ backgroundColor: color }}
    />
  );
}

export function UserAvatar({
  name,
  image,
  className,
}: {
  name: string;
  image?: string | null;
  className?: string;
}) {
  return (
    <Avatar className={cn("size-6", className)} title={name}>
      {image && <AvatarImage src={image} alt="" />}
      <AvatarFallback className="text-[10px]">{initials(name)}</AvatarFallback>
    </Avatar>
  );
}

/** "2026-10-20" -> { label: "Oct 20", overdue } without timezone drift. */
export function formatDue(date: string, done = false) {
  const [y, m, d] = date.split("-").map(Number);
  const due = new Date(y, m - 1, d);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const label = due.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    ...(y !== today.getFullYear() && { year: "numeric" }),
  });
  return { label, overdue: !done && due < today };
}

export function ProgressBar({ value, label, className }: { value: number; label: string; className?: string }) {
  return (
    <div className={cn("flex items-center gap-2", className)}>
      <div
        className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted"
        role="progressbar"
        aria-valuenow={value}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={label}
      >
        <div
          className={cn("h-full rounded-full", value === 100 ? "bg-green-600 dark:bg-green-500" : "bg-primary")}
          style={{ width: `${value}%` }}
        />
      </div>
      <span className="w-9 text-right text-xs text-muted-foreground tabular-nums">{value}%</span>
    </div>
  );
}

/** "just now", "5 minutes ago", "3 days ago", then a date. Relative to the viewer's clock. */
export function timeAgo(date: Date) {
  const seconds = Math.round((Date.now() - date.getTime()) / 1000);
  const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });
  if (seconds < 60) return "just now";
  if (seconds < 3600) return rtf.format(-Math.round(seconds / 60), "minute");
  if (seconds < 86400) return rtf.format(-Math.round(seconds / 3600), "hour");
  if (seconds < 604800) return rtf.format(-Math.round(seconds / 86400), "day");
  return date.toLocaleDateString();
}

/** ◆ for milestones (decorative; the row text says "Milestone" to screen readers). */
export function MilestoneIcon({ className }: { className?: string }) {
  return (
    <>
      <Diamond className={cn("size-3.5 shrink-0 fill-current text-brand-accent", className)} aria-hidden />
      <span className="sr-only">Milestone:</span>
    </>
  );
}

/** Shown when a task waits on unfinished tasks. Icon + text, never colour alone. */
export function BlockedBadge({ count, className }: { count: number; className?: string }) {
  return (
    <span
      title={`Waiting on ${count} unfinished ${count === 1 ? "task" : "tasks"}`}
      className={cn(
        "inline-flex shrink-0 items-center gap-1 rounded border border-amber-500/40 bg-amber-500/10 px-1.5 py-0.5 text-[11px] font-medium text-amber-800 dark:text-amber-300",
        className,
      )}
    >
      <Lock className="size-3" aria-hidden />
      Blocked
    </span>
  );
}
