import type { Metadata } from "next";
import { and, eq, isNull } from "drizzle-orm";
import { requireWorkspace } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { projects, taskStatuses, tasks } from "@/lib/db/schema";
import { listWorkspaceMembers } from "@/lib/data/members";
import { todayISO } from "@/lib/accomplishment";
import { buildWorkload, workloadColumns } from "@/lib/workload";
import { WorkloadGrid } from "@/components/workload/workload-grid";

export const metadata: Metadata = { title: "Workload" };

export default async function WorkloadPage({ params, searchParams }: PageProps<"/w/[slug]/workload">) {
  const [{ slug }, query] = await Promise.all([params, searchParams]);
  const { workspace } = await requireWorkspace(slug);
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
      .where(and(eq(tasks.workspaceId, workspace.id), isNull(tasks.deletedAt), isNull(projects.archivedAt))),
  ]);
  const grid = buildWorkload(rows, today, columns);
  const byId = new Map(rows.map((r) => [r.id, r]));
  const people = [
    ...members.map((m) => ({ id: m.userId, name: m.name, image: m.image })),
    ...(grid.has("") ? [{ id: "", name: "Unassigned", image: null }] : []),
  ];

  return (
    <div className="mx-auto grid w-full max-w-6xl grid-cols-1 gap-5 px-4 py-6 sm:px-6 lg:py-8">
      <WorkloadGrid
        slug={workspace.slug}
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
    </div>
  );
}
