"use client";

import { Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useT } from "@/i18n/client";

export function PrintButton() {
  const t = useT();
  return (
    <Button onClick={() => window.print()} className="print:hidden">
      <Printer className="size-4" />
      {t("Print / Save as PDF")}
    </Button>
  );
}
