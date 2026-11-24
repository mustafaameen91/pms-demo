"use client";

import { useState, useTransition } from "react";
import { ArrowRightLeft, Loader2, Lock, LockOpen, Plus, Settings2, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { deleteRate, saveFinanceSettings, saveRate, setBooksLock } from "@/lib/actions/finance";
import { CURRENCIES } from "@/lib/constants";
import { todayISO } from "@/lib/accomplishment";
import { formatDate } from "@/lib/utils";
import { useT } from "@/i18n/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SelectBox } from "@/components/ui/select-box";
import { FieldError } from "@/components/projects/project-fields";
import { Panel } from "@/components/page/kit";

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

export function FinanceSettingsView({
  slug,
  settings,
  accounts,
  rates,
  needRates,
}: {
  slug: string;
  settings: { baseCurrency: string; startDate: string; fiscalYearStart: number; taxName: string; taxRate: string; taxNumber: string | null; paymentTermsDays: number; defaultMoneyAccountId: string; lockedUntil: string | null };
  accounts: { id: string; name: string }[];
  rates: { id: string; currency: string; date: string; rate: string }[];
  needRates: string[];
}) {
  const t = useT();
  const [f, setF] = useState({ fiscalYearStart: settings.fiscalYearStart, taxName: settings.taxName, taxRate: settings.taxRate, taxNumber: settings.taxNumber ?? "", paymentTermsDays: settings.paymentTermsDays, defaultMoneyAccountId: settings.defaultMoneyAccountId });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [rate, setRate] = useState({ currency: needRates[0] ?? CURRENCIES.find((c) => c !== settings.baseCurrency) ?? "USD", date: todayISO(), rate: "", mode: "inverse" as "per" | "inverse" });
  const [rateError, setRateError] = useState<string>();
  const [lock, setLock] = useState(settings.lockedUntil ?? "");
  const [pending, start] = useTransition();
  return (
    <div className="grid items-start gap-6 xl:grid-cols-2">
      <Panel id="fs-general" title={t("General")} icon={Settings2}>
        <form
          className="grid gap-4 px-5 pb-5"
          onSubmit={(e) => {
            e.preventDefault();
            start(async () => {
              const res = await saveFinanceSettings(slug, f);
              if (!res.ok) return setErrors(res.fieldErrors ?? { form: res.error });
              setErrors({});
              toast.success(t("Saved"));
            });
          }}
        >
          <dl className="grid grid-cols-2 gap-3 rounded-xl bg-muted/50 p-3 text-sm">
            <div>
              <dt className="text-xs text-muted-foreground">{t("Main currency")}</dt>
              <dd className="font-semibold">{settings.baseCurrency}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">{t("Books start on")}</dt>
              <dd className="font-semibold">{formatDate(settings.startDate, t.intl)}</dd>
            </div>
          </dl>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-1.5">
              <Label htmlFor="fs-fy">{t("Financial year starts in")}</Label>
              <SelectBox id="fs-fy" className="h-9 w-full" value={String(f.fiscalYearStart)} onValueChange={(v) => setF({ ...f, fiscalYearStart: Number(v) })}>
                {MONTHS.map((m, i) => (
                  <option key={m} value={String(i + 1)}>
                    {t(m)}
                  </option>
                ))}
              </SelectBox>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="fs-terms">{t("Invoices due after (days)")}</Label>
              <Input id="fs-terms" dir="ltr" inputMode="numeric" value={f.paymentTermsDays} onChange={(e) => setF({ ...f, paymentTermsDays: Number(e.target.value) || 0 })} />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="fs-taxname">{t("Sales tax name")}</Label>
              <Input id="fs-taxname" value={f.taxName} onChange={(e) => setF({ ...f, taxName: e.target.value })} maxLength={20} />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="fs-taxrate">{t("Usual rate %")}</Label>
              <Input id="fs-taxrate" dir="ltr" inputMode="decimal" value={f.taxRate} onChange={(e) => setF({ ...f, taxRate: e.target.value })} aria-invalid={Boolean(errors.taxRate)} />
              <FieldError message={errors.taxRate} />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="fs-taxno">{t("Tax number")}</Label>
              <Input id="fs-taxno" dir="ltr" value={f.taxNumber} onChange={(e) => setF({ ...f, taxNumber: e.target.value })} maxLength={60} />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="fs-default">{t("Default cash account")}</Label>
              <SelectBox id="fs-default" className="h-9 w-full" value={f.defaultMoneyAccountId} onValueChange={(v) => setF({ ...f, defaultMoneyAccountId: v })}>
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </SelectBox>
              <p className="text-xs text-muted-foreground">{t("Used for project expenses, loans and salaries that don't say which account paid them.")}</p>
            </div>
          </div>
          <FieldError message={errors.form} />
          <Button type="submit" className="justify-self-end" disabled={pending}>
            {pending && <Loader2 className="size-4 animate-spin" />}
            {t("Save")}
          </Button>
        </form>
      </Panel>

      <div className="grid gap-6">
        <div id="rates" className="scroll-mt-6">
          <Panel id="fs-rates" title={t("Exchange rates")} icon={ArrowRightLeft} count={rates.length}>
            <div className="grid gap-3 px-5 pb-5">
              {needRates.length > 0 && <p role="alert" className="rounded-lg bg-amber-500/10 px-3 py-2 text-sm text-amber-900 dark:text-amber-200">{t("Needed now: {list}", { list: needRates.join(", ") })}</p>}
              <p className="text-sm text-muted-foreground">{t("For records in other currencies. The latest rate on or before a record's date is used.")}</p>
              <form
                className="flex flex-wrap items-end gap-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  start(async () => {
                    const res = await saveRate(slug, rate);
                    if (!res.ok) return setRateError(res.error);
                    setRateError(undefined);
                    setRate({ ...rate, rate: "" });
                    toast.success(t("Rate saved"));
                  });
                }}
              >
                <div className="grid gap-1.5">
                  <Label htmlFor="rt-cur">{t("Currency")}</Label>
                  <SelectBox id="rt-cur" className="h-9 w-24" value={rate.currency} onValueChange={(v) => setRate({ ...rate, currency: v })}>
                    {[...new Set([...needRates, ...CURRENCIES])].filter((c) => c !== settings.baseCurrency).map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </SelectBox>
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="rt-date">{t("From")}</Label>
                  <Input id="rt-date" type="date" className="w-40" value={rate.date} onChange={(e) => setRate({ ...rate, date: e.target.value })} />
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="rt-mode">{t("Written as")}</Label>
                  <SelectBox id="rt-mode" className="h-9 w-56" value={rate.mode} onValueChange={(v) => setRate({ ...rate, mode: v as "per" | "inverse" })}>
                    <option value="inverse">{t("1 {base} = ? {cur}", { base: settings.baseCurrency, cur: rate.currency })}</option>
                    <option value="per">{t("1 {cur} = ? {base}", { base: settings.baseCurrency, cur: rate.currency })}</option>
                  </SelectBox>
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="rt-rate">{t("Rate")}</Label>
                  <Input id="rt-rate" dir="ltr" inputMode="decimal" className="w-32" value={rate.rate} onChange={(e) => setRate({ ...rate, rate: e.target.value })} aria-invalid={Boolean(rateError)} />
                </div>
                <Button type="submit" variant="outline" disabled={pending}>
                  <Plus className="size-4" />
                  {t("Add")}
                </Button>
              </form>
              <FieldError message={rateError} />
              {rates.length > 0 && (
                <ul className="divide-y rounded-xl border">
                  {rates.map((r) => {
                    const v = Number(r.rate);
                    return (
                      <li key={r.id} className="flex items-center gap-3 px-3 py-2 text-sm">
                        <span className="w-12 font-semibold">{r.currency}</span>
                        <span className="w-28 text-muted-foreground">{formatDate(r.date, t.intl)}</span>
                        <span className="flex-1 tabular-nums" dir="ltr">
                          1 {settings.baseCurrency} = {(1 / v).toLocaleString("en-US", { maximumFractionDigits: 4 })} {r.currency}
                        </span>
                        <Button variant="ghost" size="icon" className="size-8 text-muted-foreground hover:text-destructive" aria-label={t("Delete")} onClick={() => start(async () => void (await deleteRate(slug, r.id)))}>
                          <Trash2 className="size-4" />
                        </Button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </Panel>
        </div>

        <Panel id="fs-lock" title={t("Close the books")} icon={Lock}>
          <div className="grid gap-3 px-5 pb-5">
            <p className="text-sm text-muted-foreground">{t("After a month is checked (or the tax return is filed), close it so nothing dated on or before that day can change.")}</p>
            <p className="text-sm">{settings.lockedUntil ? t("Closed up to {date}.", { date: formatDate(settings.lockedUntil, t.intl) }) : t("Nothing is closed.")}</p>
            <div className="flex flex-wrap items-end gap-2">
              <div className="grid gap-1.5">
                <Label htmlFor="fs-lock-date">{t("Close up to")}</Label>
                <Input id="fs-lock-date" type="date" className="w-44" max={todayISO()} value={lock} onChange={(e) => setLock(e.target.value)} />
              </div>
              <Button
                variant="outline"
                disabled={pending || !lock}
                onClick={() =>
                  start(async () => {
                    const res = await setBooksLock(slug, lock);
                    if (!res.ok) return void toast.error(res.error);
                    toast.success(t("Books closed"));
                  })
                }
              >
                <Lock className="size-4" />
                {t("Close")}
              </Button>
              {settings.lockedUntil && (
                <Button
                  variant="ghost"
                  disabled={pending}
                  onClick={() =>
                    confirm(t("Reopen every closed period?")) &&
                    start(async () => {
                      const res = await setBooksLock(slug, null);
                      if (!res.ok) return void toast.error(res.error);
                      setLock("");
                      toast.success(t("Books reopened"));
                    })
                  }
                >
                  <LockOpen className="size-4" />
                  {t("Reopen")}
                </Button>
              )}
            </div>
          </div>
        </Panel>
      </div>
    </div>
  );
}
