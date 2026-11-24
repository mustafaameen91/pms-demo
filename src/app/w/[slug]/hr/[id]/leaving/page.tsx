import { notFound } from "next/navigation";
import { requireWorkspace } from "@/lib/auth/session";
import { getEmployee } from "@/lib/data/hr";
import { computeSettlement, pendingLeaveCount } from "@/lib/data/hr-ops";
import { isWorkspaceAdmin } from "@/lib/permissions";
import { employeeCode } from "@/lib/hr";
import { getT } from "@/i18n/server";
import { PageShell } from "@/components/page/kit";
import { HrTabs } from "@/components/hr/hr-tabs";
import { LeavingView } from "@/components/hr/leaving-view";

export async function generateMetadata() {
  const t = await getT();
  return { title: t("Leaving & final settlement") };
}

export default async function LeavingPage({ params, searchParams }: PageProps<"/w/[slug]/hr/[id]/leaving">) {
  const [{ slug, id }, q] = await Promise.all([params, searchParams]);
  const { workspace } = await requireWorkspace(slug);
  if (!isWorkspaceAdmin(workspace.role)) notFound();
  const e = await getEmployee(workspace.id, id);
  if (!e) notFound();
  const pay = typeof q.pay === "string" ? q.pay.split(",").filter(Boolean) : undefined;
  const [s, pending] = await Promise.all([computeSettlement(workspace.id, e, pay), pendingLeaveCount(workspace.id)]);
  return (
    <PageShell>
      <LeavingView
        tabs={<HrTabs slug={workspace.slug} pendingLeave={pending} />}
        slug={workspace.slug}
        employee={{ id: e.id, name: e.name, code: employeeCode(e.number), hasPhoto: Boolean(e.photoPath), jobTitle: e.jobTitle, hireDate: e.hireDate, endDate: e.endDate, endReason: e.endReason, offboarding: e.offboarding, hasLogin: Boolean(e.userId) }}
        settlement={s}
        pay={pay ?? s.leave.filter((l) => l.included).map((l) => l.typeId)}
      />
    </PageShell>
  );
}
