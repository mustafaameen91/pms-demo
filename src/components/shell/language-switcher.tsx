"use client";

import { useTransition } from "react";
import { Languages, Loader2 } from "lucide-react";
import { setLanguage } from "@/lib/actions/locale";
import { LOCALE_NAMES, type Locale } from "@/i18n/config";
import { useT } from "@/i18n/client";
import { cn } from "@/lib/utils";

/** "English | العربية" toggle. Reloads so the whole page switches direction cleanly. */
export function LanguageSwitcher({ className }: { className?: string }) {
  const t = useT();
  const [pending, startTransition] = useTransition();
  const other: Locale = t.locale === "ar" ? "en" : "ar";
  return (
    <button
      type="button"
      lang={other}
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          await setLanguage(other);
          window.location.reload();
        })
      }
      aria-label={`${t("Language")}: ${LOCALE_NAMES[other]}`}
      className={cn(
        "inline-flex min-h-9 cursor-pointer items-center gap-1.5 rounded-md px-2.5 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:opacity-60",
        className,
      )}
    >
      {pending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Languages className="size-4" aria-hidden />}
      {LOCALE_NAMES[other]}
    </button>
  );
}
