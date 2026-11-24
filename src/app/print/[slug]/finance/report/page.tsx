import { notFound } from "next/navigation";
import { requireWorkspace } from "@/lib/auth/session";
import { isWorkspaceAdmin } from "@/lib/permissions";
import { getCompanyProfile } from "@/lib/data/company";
import { ensureLedger, getFinanceSettings } from "@/lib/finance/ledger";
import { PERIODS, REPORTS, periodRange, reportData, type Period, type ReportKey } from "@/lib/finance/report-data";
import { todayISO } from "@/lib/accomplishment";
import { formatDate } from "@/lib/utils";
import { getT, tFor } from "@/i18n/server";
import { DocTitle, HrPrintShell, Sheet } from "@/components/hr/hr-print";
import { ReportBody } from "@/components/finance/report-body";

export async function generateMetadata() {
  const t = await getT();
  return { title: t("Reports") };
}

const isDay = (v: unknown): v is string => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v);

export default async function PrintReport({ params, searchParams }: PageProps<"/print/[slug]/finance/report">) {
  const [{ slug }, q, t] = await Promise.all([params, searchParams, getT()]);
  const { workspace } = await requireWorkspace(slug);
  if (!isWorkspaceAdmin(workspace.role)) notFound();
  const settings = await getFinanceSettings(workspace.id);
  if (!settings) notFound();
  await ensureLedger(workspace.id);
  const today = todayISO();
  const key = (REPORTS.find((r) => r.key === q.r)?.key ?? "pl") as ReportKey;
  const period = (PERIODS.find((p) => p === q.p) ?? "this_year") as Period;
  const range = periodRange(period, today, settings.fiscalYearStart, isDay(q.from) ? q.from : undefined, isDay(q.to) ? q.to : undefined);
  const [data, profile] = await Promise.all([reportData(workspace.id, settings, key, range.from, range.to, today), getCompanyProfile(workspace.id)]);
  const lang = q.lang === "en" || q.lang === "ar" ? q.lang : profile.defaultLanguage === "en" ? "en" : "ar";
  const tr = tFor(lang);
  const asOf = key === "bs" || key === "tb" || key === "ar" || key === "ap";
  const sp = new URLSearchParams(Object.entries(q).filter(([, v]) => typeof v === "string") as [string, string][]);
  sp.set("lang", lang === "ar" ? "en" : "ar");
  return (
    <HrPrintShell back={`/w/${workspace.slug}/finance/reports?r=${key}`} backLabel={t("← Back")} switchHref={`?${sp}`} switchLabel={lang === "ar" ? "English" : "العربية"}>
      <Sheet profile={profile} lang={lang}>
        <DocTitle
          title={tr(REPORTS.find((r) => r.key === key)!.label)}
          subtitle={asOf ? tr("As of {date}", { date: formatDate(range.to, tr.intl) }) : tr("{from} to {to}", { from: formatDate(range.from, tr.intl), to: formatDate(range.to, tr.intl) })}
        />
        <div className="text-[10pt]">
          <ReportBody data={data} t={tr} currency={settings.baseCurrency} />
        </div>
      </Sheet>
    </HrPrintShell>
  );
}
