import { notFound } from "next/navigation";
import { Wallet } from "lucide-react";
import { requireWorkspace } from "@/lib/auth/session";
import { listPayrollRuns, pendingLeaveCount } from "@/lib/data/hr-ops";
import { isWorkspaceAdmin } from "@/lib/permissions";
import { todayISO } from "@/lib/accomplishment";
import { monthOf } from "@/lib/hr-rules";
import { getT } from "@/i18n/server";
import { PageHeader, PageShell } from "@/components/page/kit";
import { HrTabs } from "@/components/hr/hr-tabs";
import { PayrollRuns } from "@/components/hr/payroll-view";

export async function generateMetadata() {
  const t = await getT();
  return { title: t("Payroll") };
}

export default async function PayrollPage({ params }: PageProps<"/w/[slug]/hr/payroll">) {
  const { slug } = await params;
  const { workspace } = await requireWorkspace(slug);
  if (!isWorkspaceAdmin(workspace.role)) notFound();
  const t = await getT();
  const [runs, pending] = await Promise.all([listPayrollRuns(workspace.id), pendingLeaveCount(workspace.id)]);
  return (
    <PageShell>
      <PageHeader icon={Wallet} title={t("Payroll")} description={t("Each month: pay worked out from attendance, leave and loans, checked, approved and paid. Payslips print on your letterhead.")}>
        <HrTabs slug={workspace.slug} pendingLeave={pending} />
      </PageHeader>
      <PayrollRuns
        slug={workspace.slug}
        thisMonth={monthOf(todayISO())}
        runs={runs.map((r) => ({ id: r.run.id, month: r.run.month, status: r.run.status, people: r.people, totals: r.totals, approvedAt: r.run.approvedAt, paidAt: r.run.paidAt }))}
      />
    </PageShell>
  );
}
