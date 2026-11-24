"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertTriangle, CalendarCheck, CalendarDays, ChevronLeft, ChevronRight, ClipboardList, History, Loader2, Users } from "lucide-react";
import { toast } from "sonner";
import { saveSiteLog } from "@/lib/actions/timesheets";
import { WEATHER, addDays } from "@/lib/timesheets";
import { cn, formatDate } from "@/lib/utils";
import { useT } from "@/i18n/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { FieldError } from "@/components/projects/project-fields";
import { nativeSelectClass } from "@/components/resources/resource-fields";
import { qtyLabel } from "./timesheets-view";
import { SelectBox } from "@/components/ui/select-box";
import { EmptyState, GradientIcon, Panel, StatTile } from "@/components/page/kit";

type Log = {
  weather: string | null;
  temperature: number | null;
  deliveries: string | null;
  problems: string | null;
  notes: string | null;
  updatedAt: Date;
  updatedByName: string | null;
} | null;

type Props = {
  projectId: string;
  basePath: string;
  date: string;
  today: string;
  log: Log;
  onSite: { personKey: string; personName: string; kind: "member" | "worker"; quantity: number; unit: string; pending: boolean }[];
  recent: { date: string; weather: string | null; hasProblems: string | null }[];
};

const weatherLabel = (v: string | null) => WEATHER.find((w) => w.value === v)?.label;

export function SiteLogView(props: Props) {
  const t = useT();
  const router = useRouter();
  const { date, today, basePath } = props;
  const dayHref = (d: string) => `${basePath}/site-log?date=${d}`;
  const problemDays = props.recent.filter((r) => r.hasProblems).length;
  const lastLogged = props.recent[0]?.date ?? null;
  const longDate = new Intl.DateTimeFormat(t.intl, { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(
    new Date(`${date}T00:00:00Z`),
  );

  return (
    <div className="grid grid-cols-1 gap-6">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex min-w-0 items-center gap-4">
          <GradientIcon icon={ClipboardList} />
          <div className="min-w-0">
            <h2 className="text-xl font-bold tracking-tight">{t("Site log")}</h2>
            <p className="mt-0.5 max-w-2xl text-sm text-muted-foreground">
              {t("A short diary for each day on site: the weather, what was delivered, any problems, and who was there.")}
            </p>
          </div>
        </div>
        <nav aria-label={t("Choose day")} className="flex flex-wrap items-center gap-1">
          <Button asChild variant="ghost" size="sm">
            <Link href={dayHref(addDays(date, -1))}>
              <ChevronLeft className="size-4 rtl:-scale-x-100" aria-hidden />
              {t("Previous day")}
            </Link>
          </Button>
          <Label htmlFor="log-day" className="sr-only">
            {t("Day")}
          </Label>
          <Input id="log-day" type="date" value={date} max={today} onChange={(e) => e.target.value && router.push(dayHref(e.target.value))} className="h-8 w-40" />
          {date < today && (
            <Button asChild variant="ghost" size="sm">
              <Link href={dayHref(addDays(date, 1))}>
                {t("Next day")}
                <ChevronRight className="size-4 rtl:-scale-x-100" aria-hidden />
              </Link>
            </Button>
          )}
        </nav>
      </header>

      <dl className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile label={t("Days logged")} value={props.recent.length} icon={CalendarDays} hint={t("Recent days (up to 30)")} />
        <StatTile
          label={t("Last log")}
          value={<span className="text-2xl">{lastLogged ? formatDate(lastLogged, t.intl) : "—"}</span>}
          icon={CalendarCheck}
          tone={lastLogged === today ? "good" : "default"}
          hint={lastLogged === today ? t("Today is logged") : t("Latest day with a log")}
        />
        <StatTile
          label={t("Days with problems")}
          value={problemDays}
          icon={AlertTriangle}
          tone={problemDays ? "bad" : "good"}
          hint={t("Among recent days")}
          share={props.recent.length ? problemDays / props.recent.length : 0}
          shareLabel={t("Share of recent days with problems")}
        />
        <StatTile label={t("On site this day")} value={props.onSite.length} icon={Users} hint={formatDate(date, t.intl)} />
      </dl>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_20rem]">
        <div className="grid content-start gap-6">
          <LogForm key={date} {...props} longDate={longDate} />

          <Panel id="onsite-heading" title={t("Who was on site")} icon={Users} count={props.onSite.length}>
            {props.onSite.length === 0 ? (
              <p className="border-t px-5 py-6 text-sm text-muted-foreground">
                {t("No time logged for this day.")}{" "}
                <Link href={`${basePath}/timesheets?week=${date}`} className="text-primary underline-offset-4 hover:underline">
                  {t("Timesheets")}
                </Link>
              </p>
            ) : (
              <ul className="divide-y border-t text-sm">
                {props.onSite.map((p) => (
                  <li key={`${p.personKey}-${p.unit}`} className="flex items-center justify-between gap-3 px-5 py-3 transition-colors hover:bg-accent/60">
                    <span className="flex items-center gap-2">
                      <span className="font-medium">{p.personName}</span>
                      <span className="rounded-full border px-1.5 py-0.5 text-[11px] text-muted-foreground">{p.kind === "member" ? t("Member") : t("Worker")}</span>
                    </span>
                    <span className="tabular-nums">
                      {qtyLabel(p.quantity, p.unit, t)}
                      {p.pending && <span className="ms-1 text-xs text-amber-800 dark:text-amber-300">({t("waiting for approval")})</span>}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>

        <Panel id="recent-logs-heading" title={t("Recent days")} icon={History} count={props.recent.length} className="h-fit">
          {props.recent.length === 0 ? (
            <div className="border-t p-4">
              <EmptyState icon={ClipboardList} title={t("No site logs yet.")} className="border-0 py-8" />
            </div>
          ) : (
            <ul className="divide-y border-t text-sm">
              {props.recent.map((r) => (
                <li key={r.date}>
                  <Link
                    href={dayHref(r.date)}
                    aria-current={r.date === date ? "page" : undefined}
                    className={cn(
                      "relative flex items-center justify-between gap-2 px-5 py-2.5 transition-colors hover:bg-accent/60 aria-[current=page]:bg-accent aria-[current=page]:font-semibold",
                      r.date === date && "before:absolute before:inset-y-0 before:start-0 before:w-1 before:bg-primary",
                    )}
                  >
                    <span className="tabular-nums">{formatDate(r.date, t.intl)}</span>
                    <span className="flex items-center gap-2 text-xs text-muted-foreground">
                      {r.weather && t(weatherLabel(r.weather) ?? r.weather)}
                      {r.hasProblems && (
                        <span className="flex items-center gap-0.5 text-amber-800 dark:text-amber-300">
                          <AlertTriangle className="size-3.5" aria-hidden />
                          {t("Problems")}
                        </span>
                      )}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>
    </div>
  );
}

function LogForm({ projectId, date, log, longDate }: Props & { longDate: string }) {
  const t = useT();
  const [form, setForm] = useState({
    weather: log?.weather ?? "",
    temperature: log?.temperature === null || log?.temperature === undefined ? "" : String(log.temperature),
    deliveries: log?.deliveries ?? "",
    problems: log?.problems ?? "",
    notes: log?.notes ?? "",
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [pending, startTransition] = useTransition();
  const set = (patch: Partial<typeof form>) => setForm((f) => ({ ...f, ...patch }));
  return (
    <form
      aria-labelledby="log-heading"
      className="grid gap-4 rounded-2xl border bg-card p-5"
      onSubmit={(e) => {
        e.preventDefault();
        setErrors({});
        startTransition(async () => {
          const res = await saveSiteLog(projectId, { date, ...form });
          if (!res.ok) return setErrors(res.fieldErrors ?? { form: res.error });
          toast.success(t("Site log saved"));
        });
      }}
    >
      <div>
        <h3 id="log-heading" className="flex items-center gap-2 font-semibold">
          <CalendarDays className="size-4 text-muted-foreground" aria-hidden />
          {longDate}
        </h3>
        {log?.updatedByName && (
          <p className="text-xs text-muted-foreground">{t("Last saved by {name}", { name: log.updatedByName })}</p>
        )}
      </div>
      <div className="grid items-start gap-4 sm:grid-cols-[1fr_8rem]">
        <div className="grid gap-1.5">
          <Label htmlFor="log-weather">{t("Weather")}</Label>
          <SelectBox id="log-weather" value={form.weather} onValueChange={(v) => set({ weather: v })} className={nativeSelectClass}>
            <option value="">{t("Not recorded")}</option>
            {WEATHER.map((w) => (
              <option key={w.value} value={w.value}>
                {t(w.label)}
              </option>
            ))}
          </SelectBox>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="log-temp">{t("Temperature (°C)")}</Label>
          <Input id="log-temp" inputMode="numeric" value={form.temperature} onChange={(e) => set({ temperature: e.target.value })} className="tabular-nums" aria-invalid={Boolean(errors.temperature)} />
          <FieldError message={errors.temperature} />
        </div>
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="log-deliveries">{t("Deliveries")}</Label>
        <Textarea id="log-deliveries" dir="auto" rows={2} value={form.deliveries} onChange={(e) => set({ deliveries: e.target.value })} placeholder={t("20 tons of steel from Al-Rafidain")} maxLength={2000} />
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="log-problems">{t("Problems or incidents")}</Label>
        <Textarea id="log-problems" dir="auto" rows={2} value={form.problems} onChange={(e) => set({ problems: e.target.value })} placeholder={t("Concrete pump broke down at 11:00")} maxLength={2000} />
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="log-notes">{t("Notes")}</Label>
        <Textarea id="log-notes" dir="auto" rows={3} value={form.notes} onChange={(e) => set({ notes: e.target.value })} maxLength={4000} />
      </div>
      <FieldError message={errors.form ?? errors.date} />
      <div className="flex justify-end">
        <Button type="submit" disabled={pending}>
          {pending && <Loader2 className="size-4 animate-spin" />}
          {t("Save site log")}
        </Button>
      </div>
    </form>
  );
}
