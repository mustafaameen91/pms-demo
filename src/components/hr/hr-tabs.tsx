"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { CalendarCheck, Network, Package, Plane, Settings2, Users, Wallet } from "lucide-react";
import { cn } from "@/lib/utils";
import { useT } from "@/i18n/client";

/** The HR sections, shown under each HR page's title. */
export function HrTabs({ slug, pendingLeave = 0 }: { slug: string; pendingLeave?: number }) {
  const t = useT();
  const path = usePathname();
  const base = `/w/${slug}/hr`;
  const tabs = [
    { href: base, label: t("People|HR"), icon: Users, active: path === base || /^\/w\/[^/]+\/hr\/[0-9a-f-]{36}/.test(path) },
    { href: `${base}/attendance`, label: t("Attendance"), icon: CalendarCheck },
    { href: `${base}/leave`, label: t("Leave"), icon: Plane, badge: pendingLeave },
    { href: `${base}/payroll`, label: t("Payroll"), icon: Wallet },
    { href: `${base}/assets`, label: t("Assets"), icon: Package },
    { href: `${base}/org`, label: t("Org chart"), icon: Network },
    { href: `${base}/settings`, label: t("HR settings"), icon: Settings2 },
  ];
  return (
    <nav aria-label={t("HR sections")} className="-mx-1 flex gap-1 overflow-x-auto pb-0.5">
      {tabs.map(({ href, label, icon: Icon, active, badge }) => {
        const on = active ?? path.startsWith(href);
        return (
          <Link
            key={href}
            href={href}
            aria-current={on ? "page" : undefined}
            className={cn(
              "inline-flex h-9 shrink-0 items-center gap-2 rounded-lg px-3 text-sm whitespace-nowrap text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring",
              on && "bg-primary/10 font-semibold text-primary hover:bg-primary/15 hover:text-primary",
            )}
          >
            <Icon className="size-4" aria-hidden />
            {label}
            {badge ? (
              <span className="rounded-full bg-amber-400 px-1.5 text-[11px] font-semibold text-amber-950 tabular-nums">
                {badge}
                <span className="sr-only"> {t("waiting")}</span>
              </span>
            ) : null}
          </Link>
        );
      })}
    </nav>
  );
}
