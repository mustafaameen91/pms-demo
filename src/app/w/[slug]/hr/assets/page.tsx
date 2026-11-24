import { notFound } from "next/navigation";
import { eq, inArray } from "drizzle-orm";
import { Package } from "lucide-react";
import { requireWorkspace } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { assetAssignments, employees } from "@/lib/db/schema";
import { listEmployees } from "@/lib/data/hr";
import { listAssets, pendingLeaveCount } from "@/lib/data/hr-ops";
import { employeeCode, isActive } from "@/lib/hr";
import { isWorkspaceAdmin } from "@/lib/permissions";
import { todayISO } from "@/lib/accomplishment";
import { getT } from "@/i18n/server";
import { PageHeader, PageShell } from "@/components/page/kit";
import { HrTabs } from "@/components/hr/hr-tabs";
import { AssetsView } from "@/components/hr/assets-view";

export async function generateMetadata() {
  const t = await getT();
  return { title: t("Assets") };
}

export default async function AssetsPage({ params }: PageProps<"/w/[slug]/hr/assets">) {
  const { slug } = await params;
  const { workspace } = await requireWorkspace(slug);
  if (!isWorkspaceAdmin(workspace.role)) notFound();
  const t = await getT();
  const today = todayISO();
  const [rows, people, pending] = await Promise.all([listAssets(workspace.id), listEmployees(workspace.id), pendingLeaveCount(workspace.id)]);
  const history = rows.length
    ? await db
        .select({ a: assetAssignments, name: employees.name })
        .from(assetAssignments)
        .innerJoin(employees, eq(employees.id, assetAssignments.employeeId))
        .where(inArray(assetAssignments.assetId, rows.map((r) => r.asset.id)))
    : [];
  const currencies = [...new Set(people.map((p) => p.currency))];
  return (
    <PageShell>
      <PageHeader icon={Package} title={t("Assets")} description={t("Laptops, phones, cars and tools the company hands to people: who has what, a signed receipt for each, and what must come back before someone leaves.")}>
        <HrTabs slug={workspace.slug} pendingLeave={pending} />
      </PageHeader>
      <AssetsView
        slug={workspace.slug}
        today={today}
        currency={currencies[0] ?? "USD"}
        people={people.filter((p) => isActive(p, today)).map((p) => ({ id: p.id, name: p.name, code: employeeCode(p.number), hasPhoto: Boolean(p.photoPath) }))}
        assets={rows.map((r) => ({
          ...r.asset,
          holder: r.holder,
          history: history
            .filter((h) => h.a.assetId === r.asset.id)
            .sort((x, y) => y.a.assignedOn.localeCompare(x.a.assignedOn))
            .map((h) => ({ id: h.a.id, name: h.name, assignedOn: h.a.assignedOn, returnedOn: h.a.returnedOn, conditionOut: h.a.conditionOut, conditionIn: h.a.conditionIn })),
        }))}
      />
    </PageShell>
  );
}
