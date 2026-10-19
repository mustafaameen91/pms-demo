import Link from "next/link";
import { BadgeCheck } from "lucide-react";
import { requireWorkspace } from "@/lib/auth/session";
import { listPendingApprovals } from "@/lib/data/expenses";
import { formatDate, formatMoney } from "@/lib/utils";
import { DecisionButtons } from "@/components/expenses/approval";
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

  return (
    <div className="grid w-full grid-cols-1 gap-5 px-4 py-6 sm:px-6 lg:py-8">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">{t("Approvals")}</h1>
        <p className="text-sm text-muted-foreground">
          {isAdmin
            ? t("Expenses waiting for your decision across all projects.")
            : t("Expenses waiting for your decision in the projects you manage.")}
        </p>
      </div>
      {items.length === 0 ? (
        <div className="rounded-xl border border-dashed px-6 py-14 text-center">
          <BadgeCheck className="mx-auto mb-3 size-8 text-muted-foreground" aria-hidden />
          <p className="font-medium">{t("Nothing waiting")}</p>
          <p className="mt-1 text-sm text-muted-foreground">
            {t("Set an approval limit in a project's Settings; expenses above it will appear here.")}
          </p>
        </div>
      ) : (
        <ul className="divide-y overflow-hidden rounded-xl border bg-card">
          {items.map((e) => (
            <li key={e.id} className="flex flex-wrap items-center gap-3 px-4 py-3 text-sm">
              <div className="min-w-0 flex-1">
                <p className="font-medium">
                  {e.description} · <span className="tabular-nums">{formatMoney(e.amount, e.currency, t.intl)}</span>
                </p>
                <p className="text-xs text-muted-foreground">
                  <Link href={`/w/${workspace.slug}/p/${e.projectKey}/expenses`} className="hover:underline">
                    {e.projectName}
                  </Link>{" "}
                  · {formatDate(e.date, t.intl)} · {t("requested by {name}", { name: e.requesterName ?? t("someone") })}
                  {e.threshold && ` · ${t("limit {amount}", { amount: formatMoney(e.threshold, e.currency, t.intl) })}`}
                </p>
              </div>
              {e.requesterId === user.id ? (
                <span className="text-xs text-muted-foreground">{t("Your own request — another approver decides")}</span>
              ) : (
                <DecisionButtons expenseId={e.id} label={e.description} />
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
