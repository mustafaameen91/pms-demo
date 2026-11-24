import { notFound } from "next/navigation";
import { Network } from "lucide-react";
import { requireWorkspace } from "@/lib/auth/session";
import { listDepartments, listEmployees } from "@/lib/data/hr";
import { buildOrgTree, isActive } from "@/lib/hr";
import { isWorkspaceAdmin } from "@/lib/permissions";
import { todayISO } from "@/lib/accomplishment";
import { getT } from "@/i18n/server";
import { EmptyState, PageHeader, PageShell } from "@/components/page/kit";
import { OrgChart, type OrgPerson } from "@/components/hr/org-chart";
import { HrTabs } from "@/components/hr/hr-tabs";
import { pendingLeaveCount } from "@/lib/data/hr-ops";

export async function generateMetadata() {
  const t = await getT();
  return { title: t("Org chart") };
}

export default async function OrgChartPage({ params }: PageProps<"/w/[slug]/hr/org">) {
  const { slug } = await params;
  const { workspace } = await requireWorkspace(slug);
  if (!isWorkspaceAdmin(workspace.role)) notFound();
  const t = await getT();
  const today = todayISO();
  const [employees, departments, pending] = await Promise.all([listEmployees(workspace.id), listDepartments(workspace.id), pendingLeaveCount(workspace.id)]);
  const dep = new Map(departments.map((d) => [d.id, d]));
  const people: OrgPerson[] = employees
    .filter((e) => isActive(e, today))
    .map((e) => {
      const d = e.departmentId ? dep.get(e.departmentId) : undefined;
      return { id: e.id, name: e.name, jobTitle: e.jobTitle, managerId: e.managerId, hasPhoto: Boolean(e.photoPath), department: d ? { name: d.name, color: d.color } : null };
    });
  const tree = buildOrgTree(people);
  const unplaced = tree.filter((n) => n.reports.length === 0).length;

  return (
    <PageShell>
      <PageHeader
        icon={Network}
        title={t("Org chart")}
        description={
          people.length
            ? t("Who reports to whom, drawn from each person's “Reports to”. {count} people.", { count: people.length })
            : t("Who reports to whom, drawn from each person's “Reports to”.")
        }
      >
        <HrTabs slug={workspace.slug} pendingLeave={pending} />
      </PageHeader>
      {people.length === 0 ? (
        <EmptyState icon={Network} title={t("No one to show yet.")}>
          {t("Add employees and set who they report to.")}
        </EmptyState>
      ) : (
        <OrgChart slug={workspace.slug} tree={tree} unplaced={tree.length > 1 ? unplaced : 0} />
      )}
    </PageShell>
  );
}
