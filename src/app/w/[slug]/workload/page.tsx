import { and, eq, gte, inArray, isNotNull, isNull, lte } from "drizzle-orm";
import { requireWorkspace } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { employees, leaveRequests, projects, taskStatuses, tasks } from "@/lib/db/schema";
import { listWorkspaceMembers } from "@/lib/data/members";
import { todayISO } from "@/lib/accomplishment";
import { addDaysISO, buildWorkload, workloadColumns } from "@/lib/workload";
import { WorkloadGrid } from "@/components/workload/workload-grid";
import { getT } from "@/i18n/server";
import { visibleProjectIds } from "@/lib/data/project-access";
import { PageShell } from "@/components/page/kit";

export async function generateMetadata() {
  const t = await getT();
  return { title: t("Workload") };
}

export default async function WorkloadPage({ params, searchParams }: PageProps<"/w/[slug]/workload">) {
  const [{ slug }, query] = await Promise.all([params, searchParams]);
  const { user, workspace } = await requireWorkspace(slug);
  // Members see the workload of their own projects only.
  const only = await visibleProjectIds(workspace.id, user.id, workspace.role);
  const tr = await getT();
  const limit = Math.min(50, Math.max(1, Number(query.limit) || 5));
  const today = todayISO();
  const columns = workloadColumns(today, 6);

  const [members, rows] = await Promise.all([
    listWorkspaceMembers(workspace.id),
    db
      .select({
        id: tasks.id,
        number: tasks.number,
        title: tasks.title,
        assigneeId: tasks.assigneeId,
        dueDate: tasks.dueDate,
        isMilestone: tasks.isMilestone,
        category: taskStatuses.category,
        projectKey: projects.key,
        projectName: projects.name,
      })
      .from(tasks)
      .innerJoin(taskStatuses, eq(taskStatuses.id, tasks.statusId))
      .innerJoin(projects, eq(projects.id, tasks.projectId))
      .where(
        and(
          eq(tasks.workspaceId, workspace.id),
          isNull(tasks.deletedAt),
          isNull(projects.archivedAt),
          only ? inArray(projects.id, only.size ? [...only] : [""]) : undefined,
        ),
      ),
  ]);
  const grid = buildWorkload(rows, today, columns);
  // Approved leave of people with a login (linked HR files), counted per week column.
  const weeks = columns.filter((c) => c.start);
  const lastDay = addDaysISO(weeks.at(-1)!.start!, 6);
  const leaveRows = await db
    .select({ userId: employees.userId, startDate: leaveRequests.startDate, endDate: leaveRequests.endDate, days: leaveRequests.days })
    .from(leaveRequests)
    .innerJoin(employees, eq(employees.id, leaveRequests.employeeId))
    .where(and(eq(leaveRequests.workspaceId, workspace.id), eq(leaveRequests.status, "approved"), lte(leaveRequests.startDate, lastDay), gte(leaveRequests.endDate, weeks[0].start!), isNotNull(employees.userId)));
  const leave: Record<string, Record<string, number>> = {};
  for (const l of leaveRows) {
    for (const w of weeks) {
      const from = l.startDate > w.start! ? l.startDate : w.start!;
      const end = addDaysISO(w.start!, 6);
      const to = l.endDate < end ? l.endDate : end;
      if (from > to) continue;
      // Calendar days in this week, capped by the working days the request used.
      const n = Math.min(Number(l.days), Math.round((Date.parse(to) - Date.parse(from)) / 86_400_000) + 1);
      leave[l.userId!] ??= {};
      leave[l.userId!][w.key] = (leave[l.userId!][w.key] ?? 0) + n;
    }
  }
  const byId = new Map(rows.map((r) => [r.id, r]));
  const people = [
    ...members.map((m) => ({ id: m.userId, name: m.name, image: m.image })),
    ...(grid.has("") ? [{ id: "", name: tr("Unassigned"), image: null }] : []),
  ];

  return (
    <PageShell>
      <WorkloadGrid
        slug={workspace.slug}
        leave={leave}
        limit={limit}
        columns={columns}
        people={people}
        cells={Object.fromEntries(
          people.map((p) => [
            p.id,
            Object.fromEntries(
              columns.map((c) => [
                c.key,
                (grid.get(p.id)?.get(c.key) ?? []).map((id) => {
                  const t = byId.get(id)!;
                  return { key: `${t.projectKey}-${t.number}`, title: t.title, projectKey: t.projectKey, projectName: t.projectName, dueDate: t.dueDate };
                }),
              ]),
            ),
          ]),
        )}
      />
    </PageShell>
  );
}
