import { notFound } from "next/navigation";
import { requireWorkspace } from "@/lib/auth/session";
import { getEmployee, listDepartments, listEmployeeDocuments, listEmployeeHistory, listEmployees, listLinkChoices } from "@/lib/data/hr";
import { isWorkspaceAdmin } from "@/lib/permissions";
import { employeeCode, isActive, profileCompleteness } from "@/lib/hr";
import { todayISO } from "@/lib/accomplishment";
import { getT } from "@/i18n/server";
import { PageShell } from "@/components/page/kit";
import { EmployeeProfile } from "@/components/hr/employee-profile";
import { HrTabs } from "@/components/hr/hr-tabs";
import { EmployeeAssetsPanel, EmployeeAttendancePanel, EmployeeContractsPanel, EmployeeLeavePanel, EmployeePayslipsPanel } from "@/components/hr/employee-extras";
import { buildMonth, employeeAssets, listContracts, listEmployeePayslips, listLeaveRequests, listLeaveTypes, listShifts, pendingLeaveCount } from "@/lib/data/hr-ops";
import { leaveBalance, monthOf } from "@/lib/hr-rules";

export async function generateMetadata({ params }: PageProps<"/w/[slug]/hr/[id]">) {
  const { slug, id } = await params;
  const { workspace } = await requireWorkspace(slug);
  const t = await getT();
  const e = isWorkspaceAdmin(workspace.role) ? await getEmployee(workspace.id, id) : null;
  return { title: e ? e.name : t("People|HR") };
}

export default async function EmployeePage({ params }: PageProps<"/w/[slug]/hr/[id]">) {
  const { slug, id } = await params;
  const { workspace } = await requireWorkspace(slug);
  if (!isWorkspaceAdmin(workspace.role)) notFound();
  const employee = await getEmployee(workspace.id, id);
  if (!employee) notFound();
  const today = todayISO();
  const [docs, departments, everyone, links] = await Promise.all([
    listEmployeeDocuments(workspace.id, id),
    listDepartments(workspace.id),
    listEmployees(workspace.id),
    listLinkChoices(workspace.id, id),
  ]);
  const byId = new Map(everyone.map((e) => [e.id, e]));
  const brief = (e: (typeof everyone)[number]) => ({ id: e.id, name: e.name, jobTitle: e.jobTitle, hasPhoto: Boolean(e.photoPath) });
  // Up the chain: manager, their manager… (stops at a loop or someone missing).
  const chain: ReturnType<typeof brief>[] = [];
  const seen = new Set([id]);
  for (let m = employee.managerId ? byId.get(employee.managerId) : undefined; m && !seen.has(m.id); m = m.managerId ? byId.get(m.managerId) : undefined) {
    chain.push(brief(m));
    seen.add(m.id);
  }
  const reports = everyone.filter((e) => e.managerId === id && isActive(e, today)).map(brief);
  const [history, shifts, types, leave, assets, contracts, slips, pending, [month]] = await Promise.all([
    listEmployeeHistory(workspace.id, employeeCode(employee.number)),
    listShifts(workspace.id),
    listLeaveTypes(workspace.id, { includeArchived: true }),
    listLeaveRequests(workspace.id, { employeeId: id }),
    employeeAssets(id),
    listContracts(id),
    listEmployeePayslips(id),
    pendingLeaveCount(workspace.id),
    buildMonth(workspace.id, monthOf(today), [employee]),
  ]);
  const balances = Object.fromEntries(
    types
      .filter((ty) => ty.daysPerYear !== null)
      .map((ty) => [
        ty.id,
        leaveBalance(
          { daysPerYear: Number(ty.daysPerYear), carryOver: Number(ty.carryOver) },
          employee.hireDate,
          today,
          leave.filter((r) => r.request.typeId === ty.id).map((r) => ({ startDate: r.request.startDate, days: Number(r.request.days), status: r.request.status })),
        ),
      ]),
  );
  const employedThisMonth = month.days.some((d) => d.kind !== "not_employed");
  // The overview shows the main leave type's balance: annual leave if there is one, else the first with a balance.
  const counted = types.filter((ty) => !ty.archivedAt && balances[ty.id]);
  const mainLeave = counted.find((ty) => /annual/i.test(ty.name)) ?? counted[0];
  const mainBalance = mainLeave ? balances[mainLeave.id] : null;

  return (
    <PageShell>
      <HrTabs slug={workspace.slug} pendingLeave={pending} />
      <EmployeeProfile
        slug={workspace.slug}
        today={today}
        employee={employee}
        code={employeeCode(employee.number)}
        completeness={profileCompleteness(employee)}
        documents={docs}
        departments={departments.map((d) => ({ id: d.id, name: d.name, color: d.color }))}
        managers={everyone.filter((e) => e.id !== id && isActive(e, today)).map(brief)}
        chain={chain}
        reports={reports}
        links={links}
        history={history}
        shifts={shifts.map((x) => ({ id: x.id, name: x.name, workStart: x.workStart, workEnd: x.workEnd }))}
        counts={{ assetsHeld: assets.filter((x) => !x.a.returnedOn).length }}
        overview={{
          leave: mainLeave && mainBalance ? { name: mainLeave.name, available: mainBalance.available, total: mainBalance.entitlement + mainBalance.carried } : null,
          month: employedThisMonth ? { worked: month.summary.workedDays, absent: month.summary.absentDays, late: month.summary.lateDays, leave: month.summary.paidLeaveDays + month.summary.unpaidLeaveDays } : null,
        }}
        slots={{
          contracts: (
            <EmployeeContractsPanel
              employeeId={id}
              today={today}
              defaults={{ employmentType: employee.employmentType, jobTitle: employee.jobTitle, basicPay: employee.basicPay, startDate: employee.hireDate ?? today }}
              contracts={contracts.map((c) => ({ id: c.id, startDate: c.startDate, endDate: c.endDate, employmentType: c.employmentType, jobTitle: c.jobTitle, basicPay: c.basicPay, currency: c.currency, note: c.note, fileName: c.fileName, hasFile: Boolean(c.filePath) }))}
            />
          ),
          payslips: <EmployeePayslipsPanel slug={workspace.slug} employeeId={id} slips={slips.map((x) => ({ id: x.slip.id, month: x.month, status: x.status, net: x.slip.net, currency: x.slip.currency }))} />,
          attendance: <EmployeeAttendancePanel slug={workspace.slug} month={monthOf(today)} summary={employedThisMonth ? month.summary : null} />,
          leave: (
            <EmployeeLeavePanel
              slug={workspace.slug}
              today={today}
              employee={{ id, name: employee.name, code: employeeCode(employee.number), hasPhoto: Boolean(employee.photoPath) }}
              types={types.map((x) => ({ id: x.id, name: x.name, paid: x.paid, color: x.color, hasBalance: x.daysPerYear !== null, archived: Boolean(x.archivedAt) }))}
              balances={balances}
              requests={leave.map((r) => ({ id: r.request.id, typeId: r.request.typeId, startDate: r.request.startDate, endDate: r.request.endDate, days: Number(r.request.days), status: r.request.status }))}
            />
          ),
          assets: (
            <EmployeeAssetsPanel
              slug={workspace.slug}
              today={today}
              items={assets.map((x) => ({ assignmentId: x.a.id, assetId: x.asset.id, name: x.asset.name, number: x.asset.number, condition: x.asset.condition, assignedOn: x.a.assignedOn, returnedOn: x.a.returnedOn, conditionIn: x.a.conditionIn, holderName: employee.name }))}
            />
          ),
        }}
      />
    </PageShell>
  );
}
