import { notFound } from "next/navigation";
import { CalendarCheck } from "lucide-react";
import { requireWorkspace } from "@/lib/auth/session";
import { listDepartments, listEmployees } from "@/lib/data/hr";
import { buildMonth, getHrRules, pendingLeaveCount } from "@/lib/data/hr-ops";
import { listLeaveTypes } from "@/lib/data/hr-ops";
import { employeeCode, isActive } from "@/lib/hr";
import { monthDays, monthOf } from "@/lib/hr-rules";
import { isWorkspaceAdmin } from "@/lib/permissions";
import { todayISO } from "@/lib/accomplishment";
import { getT } from "@/i18n/server";
import { PageHeader, PageShell } from "@/components/page/kit";
import { HrTabs } from "@/components/hr/hr-tabs";
import { AttendanceDay, AttendanceMonth } from "@/components/hr/attendance-view";

export async function generateMetadata() {
  const t = await getT();
  return { title: t("Attendance") };
}

const isDay = (v: unknown): v is string => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v));
const isMonth = (v: unknown): v is string => typeof v === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(v);

export default async function AttendancePage({ params, searchParams }: PageProps<"/w/[slug]/hr/attendance">) {
  const [{ slug }, q] = await Promise.all([params, searchParams]);
  const { workspace } = await requireWorkspace(slug);
  if (!isWorkspaceAdmin(workspace.role)) notFound();
  const t = await getT();
  const today = todayISO();
  const view = q.view === "month" ? "month" : "day";
  const date = isDay(q.date) && q.date <= today ? q.date : today;
  const month = isMonth(q.month) ? q.month : monthOf(date);
  const [everyone, departments, rules, pending, types] = await Promise.all([
    listEmployees(workspace.id),
    listDepartments(workspace.id),
    getHrRules(workspace.id),
    pendingLeaveCount(workspace.id),
    listLeaveTypes(workspace.id, { includeArchived: true }),
  ]);
  const shownMonth = view === "month" ? month : monthOf(date);
  const days = monthDays(shownMonth);
  // Anyone employed at some point in the month.
  const people = everyone.filter((e) => (!e.hireDate || e.hireDate <= days.at(-1)!) && (!e.endDate || e.endDate >= days[0]));
  const months = await buildMonth(workspace.id, shownMonth, people);
  const dep = new Map(departments.map((d) => [d.id, d]));
  const typeName = new Map(types.map((x) => [x.id, x.name]));
  const person = (e: (typeof people)[number]) => ({
    id: e.id,
    name: e.name,
    code: employeeCode(e.number),
    jobTitle: e.jobTitle,
    hasPhoto: Boolean(e.photoPath),
    department: e.departmentId ? (dep.get(e.departmentId)?.name ?? null) : null,
    linked: Boolean(e.userId || e.resourceId),
  });

  return (
    <PageShell>
      <PageHeader icon={CalendarCheck} title={t("Attendance")} description={t("Who came in, who was late or absent, and overtime. Days you don't record count as worked, so tracking is optional.")}>
        <HrTabs slug={workspace.slug} pendingLeave={pending} />
      </PageHeader>
      {view === "day" ? (
        <AttendanceDay
          slug={workspace.slug}
          date={date}
          today={today}
          graceMinutes={rules.graceMinutes}
          rows={months
            .filter((m) => isActive(m.employee, date) && (!m.employee.hireDate || m.employee.hireDate <= date))
            .map((m) => {
              const d = m.days.find((x) => x.date === date)!;
              return {
                person: person(m.employee),
                schedule: { start: m.schedule.start, end: m.schedule.end, shift: m.schedule.shiftName },
                kind: d.kind,
                leaveType: d.leaveTypeId ? (typeName.get(d.leaveTypeId) ?? null) : null,
                holiday: d.holidayName ?? null,
                record: d.record ?? null,
              };
            })}
        />
      ) : (
        <AttendanceMonth
          slug={workspace.slug}
          month={shownMonth}
          today={today}
          rows={months.map((m) => ({ person: person(m.employee), days: m.days.map((d) => ({ date: d.date, kind: d.kind, leavePaid: d.leavePaid ?? null, overtime: d.record?.overtimeHours ?? 0, late: d.record?.lateMinutes ?? 0 })), summary: m.summary }))}
        />
      )}
    </PageShell>
  );
}
