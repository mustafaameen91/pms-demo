import { notFound } from "next/navigation";
import { requireWorkspace } from "@/lib/auth/session";
import { getLoan } from "@/lib/data/loans";
import { isWorkspaceAdmin } from "@/lib/permissions";
import { todayISO } from "@/lib/accomplishment";
import { getT } from "@/i18n/server";
import { LoanDetail } from "@/components/loans/loan-detail";

export async function generateMetadata() {
  const t = await getT();
  return { title: t("Loan") };
}

export default async function LoanPage({ params }: PageProps<"/w/[slug]/loans/[id]">) {
  const { slug, id } = await params;
  const { user, workspace } = await requireWorkspace(slug);
  const isAdmin = isWorkspaceAdmin(workspace.role);
  const loan = await getLoan(workspace.id, id);
  // Members only see loans they borrowed.
  if (!loan || (!isAdmin && loan.borrowerUserId !== user.id)) notFound();

  return (
    <div className="w-full px-4 py-6 sm:px-6 lg:py-8">
      <LoanDetail
        isAdmin={isAdmin}
        backHref={`/w/${workspace.slug}/loans`}
        today={todayISO()}
        loan={{
          id: loan.id,
          borrowerName: loan.borrowerName,
          borrowerKind: loan.borrowerKind,
          amount: loan.amount,
          paid: loan.paid,
          balance: loan.balance,
          paidPct: loan.paidPct,
          paidOff: loan.paidOff,
          currency: loan.currency,
          issuedOn: loan.issuedOn,
          reason: loan.reason,
          repayments: loan.repayments,
        }}
      />
    </div>
  );
}
