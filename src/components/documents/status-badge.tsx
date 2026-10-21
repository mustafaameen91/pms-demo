"use client";

import { Ban, CircleCheck, FilePen, Send } from "lucide-react";
import { DOC_STATUSES } from "@/lib/documents/types";
import { cn } from "@/lib/utils";
import { useT } from "@/i18n/client";

const STYLE = {
  draft: { icon: FilePen, cls: "border-border text-muted-foreground" },
  issued: { icon: Send, cls: "border-blue-600/30 bg-blue-600/10 text-blue-700 dark:text-blue-300" },
  signed: { icon: CircleCheck, cls: "border-green-600/30 bg-green-600/10 text-green-700 dark:text-green-400" },
  cancelled: { icon: Ban, cls: "border-destructive/30 bg-destructive/10 text-destructive" },
} as const;

/** Draft / Issued / Signed / Cancelled, with an icon so it never relies on colour alone. */
export function StatusBadge({ status }: { status: string }) {
  const t = useT();
  const lang = t.locale === "ar" ? "ar" : "en";
  const s = STYLE[status as keyof typeof STYLE] ?? STYLE.draft;
  const label = DOC_STATUSES.find((x) => x.value === status)?.label[lang] ?? status;
  return (
    <span className={cn("inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-xs font-medium whitespace-nowrap", s.cls)}>
      <s.icon className="size-3" aria-hidden />
      {label}
    </span>
  );
}
