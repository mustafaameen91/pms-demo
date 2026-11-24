import { Settings2 } from "lucide-react";
import { financePage } from "@/lib/finance/page";
import { listAccounts } from "@/lib/finance/ledger";
import { listIssues, listRates } from "@/lib/data/finance";
import { getT } from "@/i18n/server";
import { PageHeader, PageShell } from "@/components/page/kit";
import { FinanceTabs } from "@/components/finance/finance-tabs";
import { FinanceSettingsView } from "@/components/finance/settings";

export async function generateMetadata() {
  const t = await getT();
  return { title: t("Finance settings") };
}

export default async function FinanceSettingsPage({ params }: PageProps<"/w/[slug]/finance/settings">) {
  const { slug } = await params;
  const { workspace, settings } = await financePage(slug);
  const t = await getT();
  const [accounts, rates, issues] = await Promise.all([listAccounts(workspace.id), listRates(workspace.id), listIssues(workspace.id)]);
  return (
    <PageShell>
      <PageHeader icon={Settings2} title={t("Finance settings")}>
        <FinanceTabs slug={workspace.slug} />
      </PageHeader>
      <FinanceSettingsView
        slug={workspace.slug}
        settings={{ ...settings, defaultMoneyAccountId: settings.defaultMoneyAccountId ?? "" }}
        accounts={accounts.filter((a) => a.moneyKind && !a.archivedAt).map((a) => ({ id: a.id, name: a.name }))}
        rates={rates.map((r) => ({ id: r.id, currency: r.currency, date: r.date, rate: r.rate }))}
        needRates={[...new Set(issues.filter((i) => i.kind === "rate").map((i) => String(i.detail.currency)))]}
      />
    </PageShell>
  );
}
