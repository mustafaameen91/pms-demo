"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { useT } from "@/i18n/client";

export function ProjectTabs({ basePath }: { basePath: string }) {
  const t = useT();
  const pathname = usePathname();
  const tabs = [
    { href: `${basePath}/overview`, label: t("Overview"), active: pathname.startsWith(`${basePath}/overview`) },
    { href: basePath, label: t("Tasks"), active: pathname === basePath },
    { href: `${basePath}/resources`, label: t("Resources"), active: pathname.startsWith(`${basePath}/resources`) },
    { href: `${basePath}/expenses`, label: t("Expenses"), active: pathname.startsWith(`${basePath}/expenses`) },
    { href: `${basePath}/risks`, label: t("Risks"), active: pathname.startsWith(`${basePath}/risks`) },
    { href: `${basePath}/timesheets`, label: t("Timesheets"), active: pathname.startsWith(`${basePath}/timesheets`) },
    { href: `${basePath}/site-log`, label: t("Site log"), active: pathname.startsWith(`${basePath}/site-log`) },
    { href: `${basePath}/automations`, label: t("Automations"), active: pathname.startsWith(`${basePath}/automations`) },
    { href: `${basePath}/settings`, label: t("Settings"), active: pathname.startsWith(`${basePath}/settings`) },
  ];

  return (
    <nav aria-label={t("Project")} className="-mb-px mt-3 flex gap-4 overflow-x-auto whitespace-nowrap">
      {tabs.map((tab) => (
        <Link
          key={tab.href}
          href={tab.href}
          aria-current={tab.active ? "page" : undefined}
          className={cn(
            "border-b-2 border-transparent pb-2 text-sm text-muted-foreground transition-colors hover:text-foreground",
            tab.active && "border-primary font-medium text-foreground",
          )}
        >
          {tab.label}
        </Link>
      ))}
    </nav>
  );
}
