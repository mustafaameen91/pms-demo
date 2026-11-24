import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { ArrowUpRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { BrandBand } from "@/components/page/kit";

/** The brand band at the top of the dashboard and project pages, as a card. */
export function HeroBand({ children }: { children: React.ReactNode }) {
  return <BrandBand className="rounded-2xl shadow-lg shadow-brand/20 dark:shadow-black/30">{children}</BrandBand>;
}

/** A progress ring: the fill is how much is done; a tick marks where it should be today. */
export function ProgressRing({ actual, planned, label, size = "md" }: { actual: number | null; planned: number | null; label: string; size?: "sm" | "md" }) {
  const r = 52;
  const tick = planned === null ? null : (planned / 100) * 2 * Math.PI - Math.PI / 2;
  return (
    <svg viewBox="0 0 128 128" className={size === "sm" ? "size-20 shrink-0" : "size-32 shrink-0"} role="img" aria-label={label}>
      <circle cx="64" cy="64" r={r} fill="none" stroke="currentColor" strokeOpacity=".18" strokeWidth="11" />
      {actual !== null && actual > 0 && (
        <circle
          cx="64"
          cy="64"
          r={r}
          fill="none"
          stroke="currentColor"
          strokeWidth="11"
          strokeLinecap="round"
          pathLength={100}
          strokeDasharray={`${Math.min(100, actual)} 100`}
          transform="rotate(-90 64 64)"
        />
      )}
      {tick !== null && (
        <line
          x1={64 + (r - 9) * Math.cos(tick)}
          y1={64 + (r - 9) * Math.sin(tick)}
          x2={64 + (r + 9) * Math.cos(tick)}
          y2={64 + (r + 9) * Math.sin(tick)}
          stroke="#67E8F9"
          strokeWidth="3"
          strokeLinecap="round"
        />
      )}
    </svg>
  );
}

/** One of "your day" links: a count with a label, tinted when it needs action. */
export function DayLink({
  href,
  icon: Icon,
  label,
  count,
  urgent,
}: {
  href: string;
  icon: LucideIcon;
  label: string;
  count: number;
  urgent?: boolean;
}) {
  const hot = urgent && count > 0;
  return (
    <Link
      href={href}
      className={cn(
        "group flex items-center gap-3 rounded-xl border bg-card px-4 py-3 transition-colors hover:border-primary/40 hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring",
        hot && "border-destructive/30 bg-destructive/5",
      )}
    >
      <span aria-hidden className={cn("grid size-9 place-items-center rounded-lg", hot ? "bg-destructive/10 text-destructive" : "bg-primary/10 text-primary")}>
        <Icon className="size-4.5" />
      </span>
      <span className="min-w-0 flex-1">
        <span className={cn("block text-xl leading-tight font-bold tabular-nums", hot && "text-destructive")}>{count.toLocaleString()}</span>
        <span className="block truncate text-xs text-muted-foreground">{label}</span>
      </span>
      <ArrowUpRight aria-hidden className="size-4 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 rtl:-scale-x-100" />
    </Link>
  );
}
