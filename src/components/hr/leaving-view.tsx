"use client";

import { useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertTriangle, Check, ClipboardCheck, HandCoins, Landmark, Package, Printer } from "lucide-react";
import { toast } from "sonner";
import { setOffboardingItem } from "@/lib/actions/hr-ops";
import { LEAVING_REASONS, OFFBOARDING_ITEMS } from "@/lib/hr-rules";
import { labelOf } from "@/lib/hr";
import type { Settlement } from "@/lib/data/hr-ops";
import { cn, formatDate, formatMoney } from "@/lib/utils";
import { useT } from "@/i18n/client";
import { Button } from "@/components/ui/button";
import { PageHeader, Panel } from "@/components/page/kit";
import { PersonAvatar } from "./hr-ui";

type Person = { id: string; name: string; code: string; hasPhoto: boolean; jobTitle: string | null; hireDate: string | null; endDate: string | null; endReason: string | null; offboarding: Record<string, boolean>; hasLogin: boolean };

export function LeavingView({
  slug,
  employee: e,
  settlement: s,
  pay,
  tabs,
}: {
  slug: string;
  employee: Person;
  settlement: Settlement;
  pay: string[];
  /** The HR section tabs, shown under the title. */
  tabs?: React.ReactNode;
}) {
  const t = useT();
  const router = useRouter();
  const [pending, start] = useTransition();
  const m = (v: string | number) => formatMoney(v, s.currency, t.intl);
  const years = Math.floor(s.years);
  const months = Math.round((s.years - years) * 12);
  // Assets and loans are checked from the real data, not just ticked.
  const auto: Record<string, boolean | undefined> = { assets: s.assetsHeld.length === 0, loans: s.loansOwed === 0 };
  const done = OFFBOARDING_ITEMS.filter((i) => auto[i.key] ?? e.offboarding[i.key]).length;
  const togglePay = (typeId: string) => {
    const next = pay.includes(typeId) ? pay.filter((x) => x !== typeId) : [...pay, typeId];
    router.replace(`?pay=${next.join(",")}`, { scroll: false });
  };
  const printHref = `/print/${slug}/hr/settlement/${e.id}?pay=${pay.join(",")}`;

  return (
    <>
      <PageHeader
        back={{ href: `/w/${slug}/hr/${e.id}`, label: e.name }}
        mark={<PersonAvatar id={e.id} name={e.name} hasPhoto={e.hasPhoto} size="lg" className="ring-2 ring-white/40" />}
        title={t("Leaving & final settlement")}
        description={
          <span dir="auto">
            {e.name} · {e.code}
            {e.jobTitle && ` · ${e.jobTitle}`}
          </span>
        }
        actions={
          <Button asChild>
            <a href={printHref} target="_blank" rel="noopener">
              <Printer className="size-4" />
              {t("Print settlement")}
            </a>
          </Button>
        }
      >
        {tabs}
      </PageHeader>

      {!e.endDate && (
        <p className="flex items-center gap-2 rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-900 dark:text-amber-200">
          <AlertTriangle className="size-4 shrink-0" aria-hidden />
          {t("No leaving date recorded yet, so this is worked out as if they left today. Use “Record leaving” on their file first.")}
        </p>
      )}

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="grid gap-6">
          <Panel id="settle-summary" title={t("What they're owed")} icon={Landmark}>
            <div className="grid gap-4 px-5 pb-5">
              <dl className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-3">
                <div>
                  <dt className="text-xs text-muted-foreground">{t("Service")}</dt>
                  <dd className="font-medium">
                    {e.hireDate
                      ? [t.plural(years, "{count} year", "{count} years"), months ? t.plural(months, "{count} month", "{count} months") : ""].filter(Boolean).join(t(" and "))
                      : t("No hire date: add it on their file")}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">{t("Last working day")}</dt>
                  <dd className="font-medium">{formatDate(s.end, t.intl)}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">{t("Reason")}</dt>
                  <dd className="font-medium">{e.endReason ? t(labelOf(LEAVING_REASONS, e.endReason)) : "—"}</dd>
                </div>
              </dl>
              <ul className="grid gap-2 border-t pt-4 text-sm">
                <li className="flex flex-wrap items-baseline justify-between gap-2">
                  <span>
                    {t("End-of-service pay")}
                    <span className="block text-xs text-muted-foreground">
                      {s.eos.days > 0
                        ? t("{days} days × {wage} a day", { days: s.eos.days, wage: m(s.eos.dailyWage) }) + (s.eos.percent < 100 ? ` · ${t("{percent}% because they resigned", { percent: s.eos.percent })}` : "")
                        : t("Not enough service for end-of-service pay")}
                    </span>
                  </span>
                  <span className="font-semibold tabular-nums">{m(s.eos.amount)}</span>
                </li>
                {s.leave.map((l) => (
                  <li key={l.typeId} className="flex flex-wrap items-center justify-between gap-2">
                    <label className="flex cursor-pointer items-start gap-2">
                      <input type="checkbox" className="mt-1 size-4 accent-primary" checked={l.included} onChange={() => togglePay(l.typeId)} />
                      <span>
                        {t("Unused {type}: {days} days", { type: t(l.name), days: l.days })}
                        <span className="block text-xs text-muted-foreground">{l.included ? t("Paid out at {wage} a day", { wage: m(s.dayWage) }) : t("Not paid out")}</span>
                      </span>
                    </label>
                    <span className={cn("tabular-nums", l.included ? "font-semibold" : "text-muted-foreground")}>{m(l.amount)}</span>
                  </li>
                ))}
                {s.loansOwed > 0 && (
                  <li className="flex flex-wrap items-baseline justify-between gap-2 text-destructive">
                    <span>{t("Loans still owed (deducted)")}</span>
                    <span className="font-semibold tabular-nums">−{m(s.loansOwed)}</span>
                  </li>
                )}
                <li className="flex flex-wrap items-baseline justify-between gap-2 border-t pt-3 text-base">
                  <span className="font-semibold">{t("Net owed to them")}</span>
                  <span className="text-2xl font-bold tabular-nums">{m(s.net)}</span>
                </li>
              </ul>
              <p className="text-xs text-muted-foreground">{t("Their last month's pay goes through that month's payroll. The rules come from HR settings.")}</p>
            </div>
          </Panel>

          {s.assetsHeld.length > 0 && (
            <Panel id="settle-assets" title={t("Assets still with them")} icon={Package} count={s.assetsHeld.length} tone="danger">
              <ul className="divide-y border-t">
                {s.assetsHeld.map((a) => (
                  <li key={a.id} className="flex items-center justify-between gap-3 px-5 py-2.5 text-sm">
                    <span dir="auto">
                      {a.name} <span className="text-xs text-muted-foreground">{a.code}</span>
                    </span>
                    <span className="text-xs text-muted-foreground">{a.value ? formatMoney(a.value, a.currency, t.intl) : ""}</span>
                  </li>
                ))}
              </ul>
              <p className="px-5 py-3 text-sm">
                <Link href={`/w/${slug}/hr/${e.id}`} className="text-primary hover:underline">
                  {t("Take them back from their file")}
                </Link>
              </p>
            </Panel>
          )}

          {s.loans.length > 0 && (
            <Panel id="settle-loans" title={t("Open loans")} icon={HandCoins} count={s.loans.length}>
              <ul className="divide-y border-t">
                {s.loans.map((l) => (
                  <li key={l.id} className="flex items-center justify-between gap-3 px-5 py-2.5 text-sm">
                    <Link href={`/w/${slug}/loans/${l.id}`} className="hover:text-primary">
                      {t("Loan of {amount} on {date}", { amount: formatMoney(l.amount, l.currency, t.intl), date: formatDate(l.issuedOn, t.intl) })}
                    </Link>
                    <span className="font-medium tabular-nums">{t("{amount} left", { amount: formatMoney(l.balance, l.currency, t.intl) })}</span>
                  </li>
                ))}
              </ul>
            </Panel>
          )}
        </div>

        <Panel id="settle-checklist" title={t("Leaving checklist")} icon={ClipboardCheck} count={done}>
          <ul className="grid gap-1 px-3 pb-4">
            {OFFBOARDING_ITEMS.map((i) => {
              const fixed = auto[i.key];
              const on = fixed ?? Boolean(e.offboarding[i.key]);
              return (
                <li key={i.key}>
                  <label className={cn("flex items-start gap-3 rounded-lg px-2 py-2 text-sm", fixed === undefined && "cursor-pointer hover:bg-muted/50")}>
                    {fixed === undefined ? (
                      <input
                        type="checkbox"
                        className="mt-0.5 size-4 accent-primary"
                        checked={on}
                        disabled={pending}
                        onChange={(ev) =>
                          start(async () => {
                            const res = await setOffboardingItem(e.id, i.key, ev.target.checked);
                            if (!res.ok) toast.error(res.error);
                          })
                        }
                      />
                    ) : (
                      <span aria-hidden className={cn("mt-0.5 grid size-4 place-items-center rounded", on ? "bg-green-600 text-white" : "border-2 border-destructive")}>
                        {on && <Check className="size-3" />}
                      </span>
                    )}
                    <span className={cn(on && "text-muted-foreground line-through decoration-muted-foreground/40")}>
                      {t(i.label)}
                      {fixed !== undefined && <span className="block text-xs text-muted-foreground no-underline">{on ? t("Checked automatically") : i.key === "assets" ? t.plural(s.assetsHeld.length, "{count} asset not returned", "{count} assets not returned") : t("{amount} still owed", { amount: m(s.loansOwed) })}</span>}
                      {i.key === "access" && e.hasLogin && !on && (
                        <Link href={`/w/${slug}/members`} className="block text-xs text-primary hover:underline">
                          {t("Remove them in Members")}
                        </Link>
                      )}
                    </span>
                  </label>
                </li>
              );
            })}
          </ul>
          <p className="px-5 pb-5 text-xs text-muted-foreground">{t.plural(done, "{count} of 5 done", "{count} of 5 done")}</p>
        </Panel>
      </div>
    </>
  );
}
