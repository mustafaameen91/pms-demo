import Link from "next/link";
import { BadgeCheck, CalendarClock, Hourglass, Receipt, UserRound, Wallet } from "lucide-react";
import { requireWorkspace } from "@/lib/auth/session";
import { listPendingApprovals } from "@/lib/data/expenses";
import { formatDate, formatMoney } from "@/lib/utils";
import { todayISO } from "@/lib/accomplishment";
import { daysBetween } from "@/lib/schedule";
import { DecisionButtons } from "@/components/expenses/approval";
import { EmptyState, PageHeader, PageShell, Panel, StatTile } from "@/components/page/kit";
import { getT } from "@/i18n/server";

export async function generateMetadata() {
  const t = await getT();
  return { title: t("Approvals") };
}

export default async function ApprovalsPage({ params }: PageProps<"/w/[slug]/approvals">) {
  const [{ slug }, t] = await Promise.all([params, getT()]);
  const { user, workspace } = await requireWorkspace(slug);
  const isAdmin = workspace.role === "owner" || workspace.role === "admin";
  const items = await listPendingApprovals(workspace.id, user.id, isAdmin);

  const mine = items.filter((e) => e.requesterId !== user.id);
  // Money can't be added across currencies: one total per currency.
  const totals = new Map<string, number>();
  for (const e of mine) totals.set(e.currency, (totals.get(e.currency) ?? 0) + Number(e.amount));
  const oldest = items[0];
  const waitDays = oldest ? Math.max(0, daysBetween(new Date(oldest.createdAt).toISOString().slice(0, 10), todayISO())) : null;

  return (
    <PageShell>
      <PageHeader
        icon={BadgeCheck}
        title={t("Approvals")}
        description={
          isAdmin ? t("Expenses waiting for your decision across all projects.") : t("Expenses waiting for your decision in the projects you manage.")
        }
      />

      {items.length > 0 && (
        <dl className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatTile icon={Receipt} label={t("Waiting for your decision")} value={mine.length} tone={mine.length ? "bad" : "good"} hint={t("Expenses you can approve")} />
          <StatTile
            icon={Wallet}
            label={t("Amount waiting")}
            value={totals.size ? [...totals].map(([c, v]) => formatMoney(v, c, t.intl)).join(" · ") : "—"}
            hint={t("Across the expenses you decide")}
          />
          <StatTile icon={UserRound} label={t("Your own requests")} value={items.length - mine.length} hint={t("Another approver decides these")} />
          <StatTile
            icon={Hourglass}
            label={t("Oldest wait")}
            value={waitDays === null ? "—" : t.plural(waitDays, "{count} days", "{count} days")}
            tone={waitDays !== null && waitDays >= 3 ? "bad" : "default"}
            hint={oldest ? t("Since {date}", { date: formatDate(oldest.date, t.intl) }) : undefined}
          />
        </dl>
      )}

      {items.length === 0 ? (
        <EmptyState icon={BadgeCheck} title={t("Nothing waiting")}>
          {t("Set an approval limit in a project's Settings; expenses above it will appear here.")}
        </EmptyState>
      ) : (
        <Panel id="approvals-list" title={t("Waiting for approval")} icon={CalendarClock} count={items.length}>
          <ul className="grid gap-3 border-t p-4 sm:p-5">
            {items.map((e) => (
              <li key={e.id} className="flex flex-wrap items-center gap-4 rounded-2xl border bg-background/60 p-4 transition-colors hover:bg-accent">
                <Initials name={e.requesterName ?? "?"} />
                <div className="min-w-0 flex-1">
                  <p className="font-semibold">{e.description}</p>
                  <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                    <Link
                      href={`/w/${workspace.slug}/p/${e.projectKey}/expenses`}
                      className="rounded-full bg-primary/10 px-2 py-0.5 font-medium text-primary hover:bg-primary/15"
                    >
                      {e.projectName}
                    </Link>
                    <span>{formatDate(e.date, t.intl)}</span>
                    <span>· {t("requested by {name}", { name: e.requesterName ?? t("someone") })}</span>
                    {e.threshold && <span>· {t("limit {amount}", { amount: formatMoney(e.threshold, e.currency, t.intl) })}</span>}
                  </p>
                </div>
                <p className="text-xl font-bold tracking-tight tabular-nums">{formatMoney(e.amount, e.currency, t.intl)}</p>
                {e.requesterId === user.id ? (
                  <span className="rounded-full bg-muted px-2.5 py-1 text-xs text-muted-foreground">{t("Your own request — another approver decides")}</span>
                ) : (
                  <DecisionButtons expenseId={e.id} label={e.description} />
                )}
              </li>
            ))}
          </ul>
        </Panel>
      )}
    </PageShell>
  );
}

/** The requester's initials in a brand-tinted circle. */
function Initials({ name }: { name: string }) {
  const words = name.trim().split(/\s+/).filter(Boolean);
  const text = words.length > 1 ? `${words[0][0]}${words[words.length - 1][0]}` : (words[0]?.[0] ?? "?");
  return (
    <span aria-hidden className="grid size-11 shrink-0 place-items-center rounded-full bg-primary/10 text-sm font-semibold text-primary uppercase">
      {text}
    </span>
  );
}
