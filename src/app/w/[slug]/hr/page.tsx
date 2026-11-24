import { notFound } from "next/navigation";
import { Download, FileWarning, UserCheck, UserPlus, Users, Wallet } from "lucide-react";
import { requireWorkspace } from "@/lib/auth/session";
import { listDepartments, listDocumentExpiries, listEmployees, listImportCandidates } from "@/lib/data/hr";
import { attentionList, employeeCode, grossPay, isActive, profileCompleteness, upcomingCelebrations } from "@/lib/hr";
import { isWorkspaceAdmin } from "@/lib/permissions";
import { todayISO } from "@/lib/accomplishment";
import { daysBetween } from "@/lib/schedule";
import { formatMoney } from "@/lib/utils";
import { getT } from "@/i18n/server";
import { Button } from "@/components/ui/button";
import { EmptyState, PageHeader, PageShell, StatTile } from "@/components/page/kit";
import { DepartmentsButton, ImportPeopleButton, NewEmployeeButton } from "@/components/hr/people-dialogs";
import { PeopleView, type PersonRow } from "@/components/hr/people-view";
import { AttentionPanel, CelebrationsPanel, DepartmentsPanel } from "@/components/hr/people-panels";
import { HrTabs } from "@/components/hr/hr-tabs";
import { pendingLeaveCount } from "@/lib/data/hr-ops";

export async function generateMetadata() {
  const t = await getT();
  return { title: t("People|HR") };
}

export default async function PeoplePage({ params }: PageProps<"/w/[slug]/hr">) {
  const { slug } = await params;
  const { workspace } = await requireWorkspace(slug);
  if (!isWorkspaceAdmin(workspace.role)) notFound();
  const t = await getT();
  const today = todayISO();
  const [employees, departments, expiries, candidates, pendingLeave] = await Promise.all([
    listEmployees(workspace.id),
    listDepartments(workspace.id),
    listDocumentExpiries(workspace.id),
    listImportCandidates(workspace.id),
    pendingLeaveCount(workspace.id),
  ]);
  const base = `/w/${workspace.slug}/hr`;
  const byId = new Map(employees.map((e) => [e.id, e]));
  const depById = new Map(departments.map((d) => [d.id, d]));
  const active = employees.filter((e) => isActive(e, today));
  const attention = attentionList(employees, expiries, today);
  const docAlerts = attention.filter((a) => a.kind === "doc_expired" || a.kind === "doc_expiring");
  const newHires = active.filter((e) => e.hireDate && e.hireDate <= today && daysBetween(e.hireDate, today) <= 30).length;
  // Currency most of the company is paid in: the default for new people.
  const currencyCounts = new Map<string, number>();
  for (const e of employees) currencyCounts.set(e.currency, (currencyCounts.get(e.currency) ?? 0) + 1);
  const mainCurrency = [...currencyCounts].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "USD";
  const monthly = new Map<string, number>();
  for (const e of active) if (e.payBasis === "monthly" && e.basicPay) monthly.set(e.currency, (monthly.get(e.currency) ?? 0) + grossPay(e));
  const payTotals = [...monthly].sort((a, b) => b[1] - a[1]);

  const rows: PersonRow[] = employees.map((e) => {
    const dep = e.departmentId ? depById.get(e.departmentId) : undefined;
    const flags = attention.filter((a) => a.employeeId === e.id && a.kind !== "incomplete");
    return {
      id: e.id,
      code: employeeCode(e.number),
      name: e.name,
      nameAlt: e.nameAlt,
      jobTitle: e.jobTitle,
      department: dep ? { id: dep.id, name: dep.name, color: dep.color } : null,
      manager: e.managerId ? (byId.get(e.managerId)?.name ?? null) : null,
      employmentType: e.employmentType,
      hireDate: e.hireDate,
      endDate: e.endDate,
      probationEndDate: e.probationEndDate,
      hasPhoto: Boolean(e.photoPath),
      hasLogin: Boolean(e.userId),
      phone: e.phone,
      completeness: profileCompleteness(e).percent,
      alerts: flags.length,
      worstAlert: flags[0]?.kind ?? null,
    };
  });
  const person = (id: string) => {
    const e = byId.get(id)!;
    return { id: e.id, name: e.name, jobTitle: e.jobTitle, hasPhoto: Boolean(e.photoPath) };
  };
  const deptRows = departments.map((d) => ({ id: d.id, name: d.name, color: d.color, count: active.filter((e) => e.departmentId === d.id).length }));
  const noDept = active.filter((e) => !e.departmentId).length;

  if (employees.length === 0)
    return (
      <PageShell>
        <PageHeader icon={Users} title={t("People|HR")} description={t("Everyone who works for the company: their job, pay, documents and who they report to.")}>
          <HrTabs slug={workspace.slug} pendingLeave={pendingLeave} />
        </PageHeader>
        <EmptyState
          icon={UserPlus}
          title={t("Your company's HR starts here")}
          action={
            <div className="flex flex-wrap justify-center gap-2">
              <ImportPeopleButton slug={workspace.slug} candidates={candidates} prominent />
              <NewEmployeeButton slug={workspace.slug} departments={deptRows} currency={mainCurrency} variant={candidates.members.length + candidates.workers.length ? "outline" : "default"} />
            </div>
          }
        >
          {candidates.members.length + candidates.workers.length > 0
            ? t("You already have {members} members and {workers} workers in Tamm. Add them all in one click, then fill in their details.", {
                members: candidates.members.length,
                workers: candidates.workers.length,
              })
            : t("Add your first employee. Each one gets a file with their job, pay, documents and expiry reminders.")}
        </EmptyState>
      </PageShell>
    );

  return (
    <PageShell>
      <PageHeader
        icon={Users}
        title={t("People|HR")}
        description={t("Everyone who works for the company: their job, pay, documents and who they report to.")}
        actions={
          <>
            <DepartmentsButton slug={workspace.slug} departments={deptRows} />
            <ImportPeopleButton slug={workspace.slug} candidates={candidates} />
            <Button variant="outline" size="icon" asChild>
              <a href={`${base}/export`} aria-label={t("Download Excel")} title={t("Download Excel")}>
                <Download className="size-4" />
              </a>
            </Button>
            <NewEmployeeButton slug={workspace.slug} departments={deptRows} currency={mainCurrency} />
          </>
        }
      >
        <HrTabs slug={workspace.slug} pendingLeave={pendingLeave} />
      </PageHeader>

      <dl className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile
          icon={Users}
          label={t("Headcount")}
          value={active.length}
          hint={employees.length > active.length ? t.plural(employees.length - active.length, "{count} has left", "{count} have left") : t("Everyone currently working")}
        />
        <StatTile icon={UserCheck} label={t("New in the last 30 days")} value={newHires} hint={t("By hire date")} />
        <StatTile
          icon={FileWarning}
          tone={docAlerts.length ? "bad" : "good"}
          label={t("Documents to renew")}
          value={docAlerts.length}
          hint={docAlerts.length ? t("Expired or expiring within 30 days") : t("Nothing expiring in the next 30 days")}
        />
        <StatTile
          icon={Wallet}
          label={t("Monthly pay")}
          value={payTotals.length ? formatMoney(payTotals[0][1], payTotals[0][0], t.intl) : "—"}
          hint={
            payTotals.length > 1
              ? payTotals.slice(1).map(([c, v]) => formatMoney(v, c, t.intl)).join(" · ")
              : t("Basic + allowances, monthly-paid staff")
          }
        />
      </dl>

      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <PeopleView slug={workspace.slug} rows={rows} departments={deptRows} today={today} />
        <div className="grid gap-6">
          <AttentionPanel
            slug={workspace.slug}
            today={today}
            items={attention.slice(0, 12).map((a) => ({ ...a, person: person(a.employeeId) }))}
            more={Math.max(0, attention.length - 12)}
          />
          <CelebrationsPanel slug={workspace.slug} items={upcomingCelebrations(employees, today).slice(0, 8).map((c) => ({ ...c, person: person(c.employeeId) }))} />
          <DepartmentsPanel departments={deptRows} noDepartment={noDept} total={active.length} />
        </div>
      </div>
    </PageShell>
  );
}
