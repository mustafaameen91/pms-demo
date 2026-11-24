"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { useT } from "@/i18n/client";

/** Company profile | Document forms. */
export function CompanyTabs({ slug, className = "mb-6" }: { slug: string; className?: string }) {
  const t = useT();
  const pathname = usePathname();
  const base = `/w/${slug}/company`;
  const tabs = [
    { href: base, label: t("Company profile"), active: pathname === base },
    { href: `${base}/forms`, label: t("Document forms"), active: pathname.startsWith(`${base}/forms`) },
  ];
  return (
    <nav aria-label={t("Company settings")} className={cn("flex w-fit gap-1 rounded-xl bg-muted p-1", className)}>
      {tabs.map((tab) => (
        <Link
          key={tab.href}
          href={tab.href}
          aria-current={tab.active ? "page" : undefined}
          className={cn(
            "rounded-lg px-3 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground",
            tab.active && "bg-card text-primary shadow-sm",
          )}
        >
          {tab.label}
        </Link>
      ))}
    </nav>
  );
}
