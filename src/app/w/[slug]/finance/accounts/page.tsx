import { Landmark } from "lucide-react";
import { financePage } from "@/lib/finance/page";
import { listAccounts, postedLines } from "@/lib/finance/ledger";
import { moneyBalances } from "@/lib/finance/overview";
import { listTransfers } from "@/lib/data/finance";
import { getT } from "@/i18n/server";
import { PageHeader, PageShell } from "@/components/page/kit";
import { FinanceTabs } from "@/components/finance/finance-tabs";
import { MoneyAccounts } from "@/components/finance/accounts";

export async function generateMetadata() {
  const t = await getT();
  return { title: t("Cash & bank") };
}

export default async function AccountsPage({ params }: PageProps<"/w/[slug]/finance/accounts">) {
  const { slug } = await params;
  const { workspace, settings, today } = await financePage(slug);
  const t = await getT();
  const [accounts, lines, trs] = await Promise.all([listAccounts(workspace.id), postedLines(workspace.id), listTransfers(workspace.id)]);
  const balances = moneyBalances(accounts, lines, settings.baseCurrency, today);
  const name = new Map(accounts.map((a) => [a.id, a]));
  return (
    <PageShell>
      <PageHeader icon={Landmark} title={t("Cash & bank")} description={t("What's in each cash box, bank account and wallet right now, worked out from every payment, expense, salary and transfer.")}>
        <FinanceTabs slug={workspace.slug} />
      </PageHeader>
      <MoneyAccounts
        slug={workspace.slug}
        baseCurrency={settings.baseCurrency}
        accounts={balances.map((b) => ({
          id: b.account.id,
          code: b.account.code,
          name: b.account.name,
          kind: b.account.moneyKind!,
          currency: b.currency,
          bankName: b.account.bankName,
          accountNumber: b.account.accountNumber,
          own: b.own,
          base: b.base,
          isDefault: b.account.id === settings.defaultMoneyAccountId,
          archived: Boolean(b.account.archivedAt),
        }))}
        transfers={trs.map((tr) => ({
          id: tr.id,
          date: tr.date,
          from: name.get(tr.fromAccountId)?.name ?? "",
          to: name.get(tr.toAccountId)?.name ?? "",
          amount: tr.amount,
          fromCurrency: name.get(tr.fromAccountId)?.currency ?? settings.baseCurrency,
          note: tr.note,
          locked: Boolean(settings.lockedUntil && tr.date <= settings.lockedUntil),
        }))}
      />
    </PageShell>
  );
}
