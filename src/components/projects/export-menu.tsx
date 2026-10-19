"use client";

import { Download, FileSpreadsheet, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useT } from "@/i18n/client";

export function ExportMenu({ excelHref, printHref }: { excelHref: string; printHref: string }) {
  const t = useT();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="h-7">
          <Download className="size-3.5" />
          {t("Export")}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52">
        <DropdownMenuItem asChild>
          <a href={excelHref} download>
            <FileSpreadsheet className="size-4" />
            {t("Excel report (.xlsx)")}
          </a>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <a href={printHref} target="_blank" rel="noreferrer">
            <FileText className="size-4" />
            {t("PDF report (print)")}
          </a>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
