import { and, asc, desc, eq, isNull, sql } from "drizzle-orm";
import { requireWorkspace } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { projects } from "@/lib/db/schema";
import { listBorrowers, listLoanRequests, listLoans } from "@/lib/data/loans";
import { totalsByCurrency } from "@/lib/loans";
import { isWorkspaceAdmin } from "@/lib/permissions";
import { todayISO } from "@/lib/accomplishment";
import { getT } from "@/i18n/server";
import { LoansView } from "@/components/loans/loans-view";

export async function generateMetadata() {
  const t = await getT();
  return { title: t("Loans") };
}

/** The currency the workspace uses most in its projects (a sensible default for new loans). */
async function usualCurrency(workspaceId: string) {
  const [row] = await db
    .select({ currency: projects.currency })
    .from(projects)
    .where(eq(projects.workspaceId, workspaceId))
    .groupBy(projects.currency)
    .orderBy(desc(sql`count(*)`))
    .limit(1);
  return row?.currency ?? "USD";
}

export default async function LoansPage({ params, searchParams }: PageProps<"/w/[slug]/loans">) {
  const [{ slug }, query] = await Promise.all([params, searchParams]);
  const { user, workspace } = await requireWorkspace(slug);
  const isAdmin = isWorkspaceAdmin(workspace.role);
  // Admins see every loan; members only their own.
  const [loans, requests, borrowers, currency, projectChoices] = await Promise.all([
    listLoans(workspace.id, isAdmin ? {} : { borrowerUserId: user.id }),
    listLoanRequests(workspace.id, isAdmin ? { status: "pending" } : { userId: user.id }),
    isAdmin ? listBorrowers(workspace.id) : { people: [], workers: [] },
    usualCurrency(workspace.id),
    // Projects an advance can come out of.
    isAdmin
      ? db
          .select({ id: projects.id, name: projects.name, key: projects.key, currency: projects.currency })
          .from(projects)
          .where(and(eq(projects.workspaceId, workspace.id), isNull(projects.archivedAt)))
          .orderBy(asc(projects.name))
      : [],
  ]);
  const filter = query.show === "paid" || query.show === "all" ? query.show : "active";

  return (
    <div className="w-full px-4 py-6 sm:px-6 lg:py-8">
      <LoansView
        slug={workspace.slug}
        isAdmin={isAdmin}
        defaultCurrency={currency}
        today={todayISO()}
        loans={loans.map((l) => ({
          id: l.id,
          borrowerName: l.borrowerName,
          borrowerKind: l.borrowerKind,
          amount: l.amount,
          paid: l.paid,
          balance: l.balance,
          paidPct: l.paidPct,
          paidOff: l.paidOff,
          currency: l.currency,
          issuedOn: l.issuedOn,
          reason: l.reason,
          lastPaidOn: l.lastPaidOn,
          project: l.projectId ? { name: l.projectName ?? "", key: l.projectKey ?? "" } : null,
        }))}
        projects={projectChoices}
        requests={requests}
        totals={totalsByCurrency(loans)}
        borrowers={borrowers}
        filter={filter}
      />
    </div>
  );
}
