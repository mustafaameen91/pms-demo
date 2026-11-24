import Link from "next/link";
import { and, eq, isNull } from "drizzle-orm";
import { BookOpen } from "lucide-react";
import { db } from "@/lib/db";
import { projects } from "@/lib/db/schema";
import { financePage } from "@/lib/finance/page";
import { listAccounts, postedLines } from "@/lib/finance/ledger";
import { journal } from "@/lib/data/finance";
import { balances, natural } from "@/lib/finance/reports";
import { cents } from "@/lib/finance/core";
import { sourceHref } from "@/lib/finance/links";
import { cn } from "@/lib/utils";
import { getT } from "@/i18n/server";
import { PageHeader, PageShell } from "@/components/page/kit";
import { FinanceTabs } from "@/components/finance/finance-tabs";
import { ChartOfAccounts, Journal } from "@/components/finance/books";

export async function generateMetadata() {
  const t = await getT();
  return { title: t("Books") };
}

export default async function BooksPage({ params, searchParams }: PageProps<"/w/[slug]/finance/books">) {
  const [{ slug }, q] = await Promise.all([params, searchParams]);
  const { workspace, settings, base } = await financePage(slug);
  const t = await getT();
  const view = q.view === "journal" ? "journal" : "chart";
  const [accounts, lines] = await Promise.all([listAccounts(workspace.id), postedLines(workspace.id)]);
  const b = balances(lines);
  const tab = (v: string, label: string) => (
    <Link href={`${base}/books${v === "chart" ? "" : "?view=journal"}`} aria-current={view === v ? "page" : undefined} className={cn("rounded-md px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground", view === v && "bg-primary/10 font-medium text-primary")}>
      {label}
    </Link>
  );
  return (
    <PageShell>
      <PageHeader icon={BookOpen} title={t("Books")} description={t("The chart of accounts and every entry. Tamm writes most entries itself from your records.")}>
        <FinanceTabs slug={workspace.slug} />
      </PageHeader>
      <nav aria-label={t("Books")} className="inline-flex w-fit rounded-lg border bg-card p-0.5">
        {tab("chart", t("Chart of accounts"))}
        {tab("journal", t("Journal"))}
      </nav>
      {view === "chart" ? (
        <ChartOfAccounts
          slug={workspace.slug}
          currency={settings.baseCurrency}
          accounts={accounts.map((a) => ({
            id: a.id,
            code: a.code,
            name: a.name,
            type: a.type,
            system: Boolean(a.systemKey),
            money: Boolean(a.moneyKind),
            archived: Boolean(a.archivedAt),
            balance: natural(a, b.get(a.id) ?? 0),
            description: a.description,
          }))}
        />
      ) : (
        await JournalView()
      )}
    </PageShell>
  );

  async function JournalView() {
    const [entries, projs] = await Promise.all([journal(workspace.id, { limit: 300 }), db.select({ id: projects.id, name: projects.name }).from(projects).where(and(eq(projects.workspaceId, workspace.id), isNull(projects.archivedAt)))]);
    return (
      <Journal
        slug={workspace.slug}
        currency={settings.baseCurrency}
        projects={projs}
        accounts={accounts.filter((a) => !a.archivedAt).map((a) => ({ id: a.id, code: a.code, name: a.name }))}
        entries={entries.map((e) => ({
          id: e.entry.id,
          number: e.entry.number,
          date: e.entry.date,
          memo: e.entry.memo,
          source: e.entry.source,
          href: sourceHref(base, e.entry.source, e.entry.sourceId, workspace.slug),
          locked: Boolean(settings.lockedUntil && e.entry.date <= settings.lockedUntil),
          lines: e.lines
            .sort((x, y) => cents(y.l.debit) - cents(x.l.debit))
            .map((l) => ({ id: l.l.id, accountId: l.l.accountId, account: l.account, code: l.code, debit: cents(l.l.debit), credit: cents(l.l.credit), contact: l.contact, project: l.project, description: l.l.description })),
        }))}
      />
    );
  }
}
