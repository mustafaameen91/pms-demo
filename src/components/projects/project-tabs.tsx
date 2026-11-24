"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { useT } from "@/i18n/client";

/** `canManage` shows the manager-only tabs (documents). */
export function ProjectTabs({ basePath, canManage = false }: { basePath: string; canManage?: boolean }) {
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
    { href: `${basePath}/files`, label: t("Files"), active: pathname.startsWith(`${basePath}/files`) },
    ...(canManage ? [{ href: `${basePath}/documents`, label: t("Documents"), active: pathname.startsWith(`${basePath}/documents`) }] : []),
    { href: `${basePath}/automations`, label: t("Automations"), active: pathname.startsWith(`${basePath}/automations`) },
    { href: `${basePath}/settings`, label: t("Settings"), active: pathname.startsWith(`${basePath}/settings`) },
  ];

  return (
    <nav aria-label={t("Project")} className="flex min-w-0 gap-1 overflow-x-auto rounded-xl bg-muted p-1 whitespace-nowrap">
      {tabs.map((tab) => (
        <Link
          key={tab.href}
          href={tab.href}
          aria-current={tab.active ? "page" : undefined}
          className={cn(
            "rounded-lg px-3 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-background/60 hover:text-foreground",
            tab.active && "bg-card text-primary shadow-sm hover:bg-card hover:text-primary",
          )}
        >
          {tab.label}
        </Link>
      ))}
    </nav>
  );
}
