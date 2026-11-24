"use client";

import { useRef, useState } from "react";
import { CalendarRange } from "lucide-react";
import { useT } from "@/i18n/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SelectBox } from "@/components/ui/select-box";

/**
 * The reports' period picker (a plain GET form). A named period applies as soon as it's
 * picked; the date boxes appear only for "Custom".
 */
export function PeriodForm({ report, period, periods, from, to, summary }: { report: string; period: string; periods: { value: string; label: string }[]; from: string; to: string; summary: string }) {
  const t = useT();
  const form = useRef<HTMLFormElement>(null);
  const [p, setP] = useState(period);
  return (
    <form ref={form} className="flex flex-wrap items-end gap-3 rounded-2xl border bg-card p-4">
      <input type="hidden" name="r" value={report} />
      <div className="grid gap-1.5">
        <Label htmlFor="rp-period">{t("Period")}</Label>
        <SelectBox
          id="rp-period"
          name="p"
          className="h-9 w-52"
          value={p}
          onValueChange={(v) => {
            setP(v);
            // Let the hidden input pick up the new value before sending.
            if (v !== "custom") requestAnimationFrame(() => form.current?.requestSubmit());
          }}
        >
          {periods.map((x) => (
            <option key={x.value} value={x.value}>
              {x.label}
            </option>
          ))}
        </SelectBox>
      </div>
      {p === "custom" && (
        <>
          <div className="grid gap-1.5">
            <Label htmlFor="rp-from">{t("From")}</Label>
            <Input id="rp-from" type="date" name="from" defaultValue={from} className="w-40" />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="rp-to">{t("To")}</Label>
            <Input id="rp-to" type="date" name="to" defaultValue={to} min={from} className="w-40" />
          </div>
          <Button type="submit">{t("Show")}</Button>
        </>
      )}
      <p className="inline-flex items-center gap-1.5 text-sm text-muted-foreground sm:ms-auto sm:pb-2">
        <CalendarRange className="size-4" aria-hidden />
        {summary}
      </p>
    </form>
  );
}
