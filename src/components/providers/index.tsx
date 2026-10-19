"use client";

import { ThemeProvider } from "next-themes";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "@/components/ui/sonner";
import { I18nProvider } from "@/i18n/client";
import type { Locale } from "@/i18n/config";
import type { Dictionary } from "@/i18n/translate";

export function Providers({ locale, dict, children }: { locale: Locale; dict: Dictionary; children: React.ReactNode }) {
  return (
    <I18nProvider locale={locale} dict={dict}>
      <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
        <TooltipProvider delayDuration={300}>
          {children}
          {/* Toasts sit in the reading-end corner. */}
          <Toaster position={locale === "ar" ? "bottom-left" : "bottom-right"} dir={locale === "ar" ? "rtl" : "ltr"} />
        </TooltipProvider>
      </ThemeProvider>
    </I18nProvider>
  );
}
