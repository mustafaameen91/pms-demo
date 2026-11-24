"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowLeftRight, BookOpen, ChartPie, FileInput, FileOutput, Landmark, LayoutDashboard, Settings2, Target, Users } from "lucide-react";
import { cn } from "@/lib/utils";
import { useT } from "@/i18n/client";

/** The Finance sections, shown under each Finance page's title. */
export function FinanceTabs({ slug, overdue = 0 }: { slug: string; overdue?: number }) {
  const t = useT();
  const path = usePathname();
  const base = `/w/${slug}/finance`;
  const tabs = [
    { href: base, label: t("Overview"), icon: LayoutDashboard, exact: true },
    { href: `${base}/invoices`, label: t("Invoices"), icon: FileOutput, badge: overdue },
    { href: `${base}/bills`, label: t("Bills"), icon: FileInput },
    { href: `${base}/payments`, label: t("Payments"), icon: ArrowLeftRight },
    { href: `${base}/accounts`, label: t("Cash & bank"), icon: Landmark },
    { href: `${base}/contacts`, label: t("Customers & suppliers"), icon: Users },
    { href: `${base}/reports`, label: t("Reports"), icon: ChartPie },
    { href: `${base}/budget`, label: t("Budget"), icon: Target },
    { href: `${base}/books`, label: t("Books"), icon: BookOpen },
    { href: `${base}/settings`, label: t("Settings"), icon: Settings2 },
  ];
  return (
    <nav aria-label={t("Finance sections")} className="-mx-1 flex gap-1 overflow-x-auto pb-0.5">
      {tabs.map(({ href, label, icon: Icon, exact, badge }) => {
        const on = exact ? path === href : path.startsWith(href);
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
              <span className="rounded-full bg-destructive px-1.5 text-[11px] font-semibold text-white tabular-nums">
                {badge}
                <span className="sr-only"> {t("overdue")}</span>
              </span>
            ) : null}
          </Link>
        );
      })}
    </nav>
  );
}
