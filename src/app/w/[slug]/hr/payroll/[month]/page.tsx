import { notFound } from "next/navigation";
import { and, eq, gte, inArray, lte } from "drizzle-orm";
import { Wallet } from "lucide-react";
import { requireWorkspace } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { employees, projects, timeEntries } from "@/lib/db/schema";
import { getPayrollRun, openLoansFor, pendingLeaveCount } from "@/lib/data/hr-ops";
import { isWorkspaceAdmin } from "@/lib/permissions";
import { monthDays } from "@/lib/hr-rules";
import { getT } from "@/i18n/server";
import { PageHeader, PageShell } from "@/components/page/kit";
import { HrTabs } from "@/components/hr/hr-tabs";
import { PayrollMonth } from "@/components/hr/payroll-view";
import { getFinanceSettings, listAccounts } from "@/lib/finance/ledger";

export async function generateMetadata({ params }: PageProps<"/w/[slug]/hr/payroll/[month]">) {
  const { month } = await params;
  const t = await getT();
  return { title: `${t("Payroll")} ${month}` };
}

export default async function PayrollMonthPage({ params }: PageProps<"/w/[slug]/hr/payroll/[month]">) {
  const { slug, month } = await params;
  const { workspace } = await requireWorkspace(slug);
  if (!isWorkspaceAdmin(workspace.role) || !/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) notFound();
  const t = await getT();
  const data = await getPayrollRun(workspace.id, month);
  if (!data) notFound();
  const pending = await pendingLeaveCount(workspace.id);
  const finance = await getFinanceSettings(workspace.id);
  const moneyAccounts = finance ? (await listAccounts(workspace.id)).filter((a) => a.moneyKind && !a.archivedAt).map((a) => ({ id: a.id, name: a.name, isDefault: a.id === finance.defaultMoneyAccountId })) : [];
  const people = data.slips.length ? await db.select().from(employees).where(inArray(employees.id, data.slips.map((s) => s.employeeId))) : [];
  const owed = new Map(await Promise.all(people.map(async (e) => [e.id, (await openLoansFor(workspace.id, e)).reduce((s, l) => s + Number(l.balance), 0)] as const)));

  // Labour cost per project: each linked person's cost (pay + company social security) split by their approved project time this month.
  const days = monthDays(month);
  const entries = await db
    .select({ projectId: timeEntries.projectId, userId: timeEntries.userId, resourceId: timeEntries.resourceId, quantity: timeEntries.quantity, unit: timeEntries.unit, name: projects.name, key: projects.key })
    .from(timeEntries)
    .innerJoin(projects, eq(projects.id, timeEntries.projectId))
    .where(and(eq(timeEntries.workspaceId, workspace.id), gte(timeEntries.date, days[0]), lte(timeEntries.date, days.at(-1)!), eq(timeEntries.status, "approved")));
  const byProject = new Map<string, { name: string; key: string; costs: Map<string, number> }>();
  for (const s of data.slips) {
    const e = people.find((p) => p.id === s.employeeId);
    if (!e || (!e.userId && !e.resourceId)) continue;
    const mine = entries.filter((x) => (e.userId && x.userId === e.userId) || (e.resourceId && x.resourceId === e.resourceId));
    const hours = (x: (typeof mine)[number]) => Number(x.quantity) * (/day|يوم/i.test(x.unit) ? 8 : 1);
    const total = mine.reduce((a, x) => a + hours(x), 0);
    if (total === 0) continue;
    const cost = Number(s.gross) + Number(s.ssEmployer);
    for (const x of mine) {
      const p = byProject.get(x.projectId) ?? { name: x.name, key: x.key, costs: new Map() };
      p.costs.set(s.currency, (p.costs.get(s.currency) ?? 0) + (cost * hours(x)) / total);
      byProject.set(x.projectId, p);
    }
  }

  return (
    <PageShell>
      <PageHeader icon={Wallet} title={t("Payroll · {month}", { month: new Date(Number(month.slice(0, 4)), Number(month.slice(5)) - 1, 1).toLocaleDateString(t.intl, { month: "long", year: "numeric" }) })}>
        <HrTabs slug={workspace.slug} pendingLeave={pending} />
      </PageHeader>
      <PayrollMonth
        slug={workspace.slug}
        run={{ id: data.run.id, month, status: data.run.status, approvedAt: data.run.approvedAt, paidAt: data.run.paidAt }}
        slips={data.slips.map((s) => ({ ...s, owed: owed.get(s.employeeId) ?? 0, hasPhoto: Boolean(people.find((p) => p.id === s.employeeId)?.photoPath) }))}
        moneyAccounts={moneyAccounts}
        projects={[...byProject].map(([id, p]) => ({ id, name: p.name, key: p.key, costs: [...p.costs].map(([currency, amount]) => ({ currency, amount })) }))}
      />
    </PageShell>
  );
}
