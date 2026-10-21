"use client";

import { usePathname, useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { useT } from "@/i18n/client";
import { nativeSelectClass } from "@/components/resources/resource-fields";

/** Dashboard: show all projects, one portfolio's, or those in none. */
export function PortfolioFilter({ portfolios, value }: { portfolios: { id: string; name: string }[]; value: string }) {
  const t = useT();
  const router = useRouter();
  const pathname = usePathname();
  return (
    <label className="flex items-center gap-2 text-sm">
      <span className="text-muted-foreground">{t("Portfolio")}</span>
      <select
        value={value}
        onChange={(e) => router.push(e.target.value ? `${pathname}?portfolio=${e.target.value}` : pathname)}
        className={cn(nativeSelectClass, "h-8 w-56")}
      >
        <option value="">{t("All projects")}</option>
        {portfolios.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
          </option>
        ))}
        <option value="none">{t("Not in a portfolio")}</option>
      </select>
    </label>
  );
}
