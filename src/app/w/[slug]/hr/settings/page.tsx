import { notFound } from "next/navigation";
import { Settings2 } from "lucide-react";
import { requireWorkspace } from "@/lib/auth/session";
import { getHrRules, listHolidays, listLeaveTypes, listShifts, pendingLeaveCount } from "@/lib/data/hr-ops";
import { listEmployees } from "@/lib/data/hr";
import { isWorkspaceAdmin } from "@/lib/permissions";
import { getT } from "@/i18n/server";
import { PageHeader, PageShell } from "@/components/page/kit";
import { HrTabs } from "@/components/hr/hr-tabs";
import { HrSettingsView } from "@/components/hr/hr-settings";

export async function generateMetadata() {
  const t = await getT();
  return { title: t("HR settings") };
}

export default async function HrSettingsPage({ params }: PageProps<"/w/[slug]/hr/settings">) {
  const { slug } = await params;
  const { workspace } = await requireWorkspace(slug);
  if (!isWorkspaceAdmin(workspace.role)) notFound();
  const t = await getT();
  const [rules, shifts, holidays, leaveTypes, pending, people] = await Promise.all([
    getHrRules(workspace.id),
    listShifts(workspace.id),
    listHolidays(workspace.id),
    listLeaveTypes(workspace.id, { includeArchived: true }),
    pendingLeaveCount(workspace.id),
    listEmployees(workspace.id),
  ]);
  return (
    <PageShell>
      <PageHeader icon={Settings2} title={t("HR settings")} description={t("Your company's rules: work week, hours, overtime, social security, end of service, leave and holidays. Every number can be changed.")}>
        <HrTabs slug={workspace.slug} pendingLeave={pending} />
      </PageHeader>
      <HrSettingsView
        slug={workspace.slug}
        rules={rules}
        shifts={shifts.map((s) => ({ ...s, people: people.filter((p) => p.shiftId === s.id).length }))}
        holidays={holidays.map((h) => ({ id: h.id, date: h.date, name: h.name }))}
        leaveTypes={leaveTypes.map((l) => ({ id: l.id, name: l.name, paid: l.paid, daysPerYear: l.daysPerYear, carryOver: l.carryOver, color: l.color, archived: Boolean(l.archivedAt) }))}
      />
    </PageShell>
  );
}
