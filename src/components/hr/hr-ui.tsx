"use client";

import { AlertTriangle, CalendarClock, CircleCheck, Clock } from "lucide-react";
import { cn, formatDate, initials } from "@/lib/utils";
import { daysBetween } from "@/lib/schedule";
import { expiryState, tenure, type ExpiryState } from "@/lib/hr";
import { useT } from "@/i18n/client";

/** The person's photo, or their initials on a colour picked from their name. */
export function PersonAvatar({
  id,
  name,
  hasPhoto,
  size = "md",
  version,
  className,
}: {
  id: string;
  name: string;
  hasPhoto: boolean;
  /** Bump after uploading a new photo so the browser fetches it again. */
  version?: number;
  size?: "sm" | "md" | "lg" | "xl";
  className?: string;
}) {
  const box = { sm: "size-8 text-[11px]", md: "size-10 text-sm", lg: "size-14 text-base", xl: "size-24 text-2xl" }[size];
  const hue = [...id].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 360, 7);
  if (hasPhoto)
    return (
      // eslint-disable-next-line @next/next/no-img-element -- private, auth-checked file; next/image can't proxy it
      <img src={`/api/files/hr/photo/${id}${version ? `?v=${version}` : ""}`} alt="" className={cn("shrink-0 rounded-full object-cover ring-2 ring-background", box, className)} />
    );
  return (
    <span
      aria-hidden
      className={cn("grid shrink-0 place-items-center rounded-full font-semibold text-white ring-2 ring-background", box, className)}
      style={{ background: `linear-gradient(135deg, hsl(${hue} 65% 52%), hsl(${(hue + 40) % 360} 60% 42%))` }}
    >
      {initials(name) || "?"}
    </span>
  );
}

const EXPIRY_STYLE: Record<ExpiryState, string> = {
  expired: "bg-destructive/10 text-destructive",
  expiring: "bg-amber-500/15 text-amber-800 dark:text-amber-300",
  valid: "bg-green-600/10 text-green-700 dark:text-green-400",
  none: "bg-muted text-muted-foreground",
};

/** "Expired 3 days ago" / "Expires in 12 days" / "Valid until …", never colour alone. */
export function ExpiryBadge({ date, today, className }: { date: string | null; today: string; className?: string }) {
  const t = useT();
  const state = expiryState(date, today);
  const Icon = state === "expired" ? AlertTriangle : state === "expiring" ? Clock : state === "valid" ? CircleCheck : CalendarClock;
  const days = date ? daysBetween(today, date) : 0;
  const text =
    state === "none"
      ? t("No expiry")
      : state === "expired"
        ? t.plural(-days, "Expired {count} day ago", "Expired {count} days ago")
        : state === "expiring"
          ? days === 0
            ? t("Expires today")
            : t.plural(days, "Expires in {count} day", "Expires in {count} days")
          : t("Valid until {date}", { date: formatDate(date, t.intl) });
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap", EXPIRY_STYLE[state], className)}>
      <Icon className="size-3.5" aria-hidden />
      {text}
    </span>
  );
}

/** "3 years 2 months" of service. */
export function useTenureText() {
  const t = useT();
  return (from: string | null, to: string) => {
    if (!from) return null;
    const v = tenure(from, to);
    if (!v) return t("Starts {date}", { date: formatDate(from, t.intl) });
    if (v.years === 0 && v.months === 0) return t("Joined this month");
    const y = v.years ? t.plural(v.years, "{count} year", "{count} years") : "";
    const m = v.months ? t.plural(v.months, "{count} month", "{count} months") : "";
    return [y, m].filter(Boolean).join(t(" and "));
  };
}

/** A department's colour dot and name. */
export function DepartmentTag({ name, color, className }: { name: string; color: string; className?: string }) {
  return (
    <span className={cn("inline-flex min-w-0 items-center gap-1.5 text-sm", className)}>
      <span aria-hidden className="size-2 shrink-0 rounded-full" style={{ backgroundColor: color }} />
      <span className="truncate" dir="auto">
        {name}
      </span>
    </span>
  );
}
