"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

export function ProjectTabs({ basePath }: { basePath: string }) {
  const pathname = usePathname();
  const tabs = [
    { href: `${basePath}/overview`, label: "Overview", active: pathname.startsWith(`${basePath}/overview`) },
    { href: basePath, label: "Tasks", active: pathname === basePath },
    { href: `${basePath}/resources`, label: "Resources", active: pathname.startsWith(`${basePath}/resources`) },
    { href: `${basePath}/expenses`, label: "Expenses", active: pathname.startsWith(`${basePath}/expenses`) },
    { href: `${basePath}/settings`, label: "Settings", active: pathname.startsWith(`${basePath}/settings`) },
  ];

  return (
    <nav aria-label="Project" className="-mb-px mt-3 flex gap-4">
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
