import { notFound } from "next/navigation";
import { Plane } from "lucide-react";
import { requireWorkspace } from "@/lib/auth/session";
import { listEmployees } from "@/lib/data/hr";
import { listHolidays, listLeaveRequests, listLeaveTypes } from "@/lib/data/hr-ops";
import { employeeCode, isActive } from "@/lib/hr";
import { leaveBalance, monthDays, monthOf } from "@/lib/hr-rules";
import { isWorkspaceAdmin } from "@/lib/permissions";
import { todayISO } from "@/lib/accomplishment";
import { getT } from "@/i18n/server";
import { PageHeader, PageShell } from "@/components/page/kit";
import { HrTabs } from "@/components/hr/hr-tabs";
import { LeaveView } from "@/components/hr/leave-view";

export async function generateMetadata() {
  const t = await getT();
  return { title: t("Leave") };
}

export default async function LeavePage({ params, searchParams }: PageProps<"/w/[slug]/hr/leave">) {
  const [{ slug }, q] = await Promise.all([params, searchParams]);
  const { workspace } = await requireWorkspace(slug);
  if (!isWorkspaceAdmin(workspace.role)) notFound();
  const t = await getT();
  const today = todayISO();
  const month = typeof q.month === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(q.month) ? q.month : monthOf(today);
  const [employees, types, requests, holidays] = await Promise.all([
    listEmployees(workspace.id),
    listLeaveTypes(workspace.id, { includeArchived: true }),
    listLeaveRequests(workspace.id),
    listHolidays(workspace.id, `${month}-01`, monthDays(month).at(-1)!),
  ]);
  const active = employees.filter((e) => isActive(e, today));
  const pending = requests.filter((r) => r.request.status === "pending");
  const balances = active.map((e) => ({
    employeeId: e.id,
    values: Object.fromEntries(
      types
        .filter((ty) => ty.daysPerYear !== null && !ty.archivedAt)
        .map((ty) => [
          ty.id,
          leaveBalance(
            { daysPerYear: Number(ty.daysPerYear), carryOver: Number(ty.carryOver) },
            e.hireDate,
            today,
            requests.filter((r) => r.request.employeeId === e.id && r.request.typeId === ty.id).map((r) => ({ startDate: r.request.startDate, days: Number(r.request.days), status: r.request.status })),
          ),
        ]),
    ),
  }));

  return (
    <PageShell>
      <PageHeader icon={Plane} title={t("Leave")} description={t("Record and approve leave, see who is off and how many days each person has left.")}>
        <HrTabs slug={workspace.slug} pendingLeave={pending.length} />
      </PageHeader>
      <LeaveView
        slug={workspace.slug}
        today={today}
        month={month}
        holidays={holidays.map((h) => ({ date: h.date, name: h.name }))}
        people={active.map((e) => ({ id: e.id, name: e.name, code: employeeCode(e.number), hasPhoto: Boolean(e.photoPath), linked: Boolean(e.userId) }))}
        types={types.map((ty) => ({ id: ty.id, name: ty.name, paid: ty.paid, color: ty.color, hasBalance: ty.daysPerYear !== null, archived: Boolean(ty.archivedAt) }))}
        requests={requests.map((r) => ({
          id: r.request.id,
          employeeId: r.request.employeeId,
          name: r.employeeName,
          hasPhoto: Boolean(r.employeePhoto),
          typeId: r.request.typeId,
          startDate: r.request.startDate,
          endDate: r.request.endDate,
          days: Number(r.request.days),
          reason: r.request.reason,
          status: r.request.status,
          decidedBy: r.decidedBy,
          decisionNote: r.request.decisionNote,
        }))}
        balances={balances}
      />
    </PageShell>
  );
}
