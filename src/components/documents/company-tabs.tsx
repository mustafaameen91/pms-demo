"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { useT } from "@/i18n/client";

/** Company profile | Document forms. */
export function CompanyTabs({ slug }: { slug: string }) {
  const t = useT();
  const pathname = usePathname();
  const base = `/w/${slug}/company`;
  const tabs = [
    { href: base, label: t("Company profile"), active: pathname === base },
    { href: `${base}/forms`, label: t("Document forms"), active: pathname.startsWith(`${base}/forms`) },
  ];
  return (
    <nav aria-label={t("Company settings")} className="mb-6 flex gap-4 border-b">
      {tabs.map((tab) => (
        <Link
          key={tab.href}
          href={tab.href}
          aria-current={tab.active ? "page" : undefined}
          className={cn("-mb-px border-b-2 border-transparent pb-2 text-sm text-muted-foreground hover:text-foreground", tab.active && "border-primary font-medium text-foreground")}
        >
          {tab.label}
        </Link>
      ))}
    </nav>
  );
}
