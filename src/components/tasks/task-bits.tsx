import { AlertTriangle, Minus, SignalHigh, SignalLow, SignalMedium } from "lucide-react";
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
