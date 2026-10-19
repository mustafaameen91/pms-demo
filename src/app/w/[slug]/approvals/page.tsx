import Link from "next/link";
import type { Metadata } from "next";
import { BadgeCheck } from "lucide-react";
import { requireWorkspace } from "@/lib/auth/session";
import { listPendingApprovals } from "@/lib/data/expenses";
import { formatDate, formatMoney } from "@/lib/utils";
import { DecisionButtons } from "@/components/expenses/approval";

export const metadata: Metadata = { title: "Approvals" };

export default async function ApprovalsPage({ params }: PageProps<"/w/[slug]/approvals">) {
  const { slug } = await params;
  const { user, workspace } = await requireWorkspace(slug);
  const isAdmin = workspace.role === "owner" || workspace.role === "admin";
  const items = await listPendingApprovals(workspace.id, user.id, isAdmin);

  return (
    <div className="mx-auto grid w-full max-w-4xl grid-cols-1 gap-5 px-4 py-6 sm:px-6 lg:py-8">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Approvals</h1>
        <p className="text-sm text-muted-foreground">
          Expenses waiting for your decision{isAdmin ? " across all projects" : " in the projects you manage"}.
        </p>
      </div>
      {items.length === 0 ? (
        <div className="rounded-xl border border-dashed px-6 py-14 text-center">
          <BadgeCheck className="mx-auto mb-3 size-8 text-muted-foreground" aria-hidden />
          <p className="font-medium">Nothing waiting</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Set an approval limit in a project&apos;s Settings; expenses above it will appear here.
          </p>
        </div>
      ) : (
        <ul className="divide-y overflow-hidden rounded-xl border bg-card">
          {items.map((e) => (
            <li key={e.id} className="flex flex-wrap items-center gap-3 px-4 py-3 text-sm">
              <div className="min-w-0 flex-1">
                <p className="font-medium">
                  {e.description} · <span className="tabular-nums">{formatMoney(e.amount, e.currency)}</span>
                </p>
                <p className="text-xs text-muted-foreground">
                  <Link href={`/w/${workspace.slug}/p/${e.projectKey}/expenses`} className="hover:underline">
                    {e.projectName}
                  </Link>{" "}
                  · {formatDate(e.date)} · requested by {e.requesterName ?? "someone"}
                  {e.threshold && ` · limit ${formatMoney(e.threshold, e.currency)}`}
                </p>
              </div>
              {e.requesterId === user.id ? (
                <span className="text-xs text-muted-foreground">Your own request — another approver decides</span>
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
