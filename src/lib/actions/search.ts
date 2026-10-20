"use server";

import { and, eq, ilike, inArray, isNull, or, sql } from "drizzle-orm";
import { requireWorkspace } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { member, projects, resources, taskStatuses, tasks, user } from "@/lib/db/schema";
import { visibleProjectIds } from "@/lib/data/project-access";

export type SearchResults = {
  tasks: { key: string; title: string; projectKey: string; projectName: string; statusName: string; done: boolean }[];
  projects: { key: string; name: string; client: string | null; color: string }[];
  resources: { name: string; role: string | null; type: string }[];
  people: { name: string; email: string }[];
};

const EMPTY: SearchResults = { tasks: [], projects: [], resources: [], people: [] };

/** "%" and "_" are literal in user text. */
const like = (q: string) => `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;

/** Searches the workspace the user is a member of. */
export async function searchWorkspace(slug: string, query: string): Promise<SearchResults> {
  const q = query.trim().slice(0, 100);
  if (q.length < 2) return EMPTY;
  const { user: me, workspace } = await requireWorkspace(slug);
  const only = await visibleProjectIds(workspace.id, me.id, workspace.role);
  if (only && only.size === 0) return { ...EMPTY, people: [], resources: [] };
  const pattern = like(q);
  const keyMatch = /^([a-z][a-z0-9]{1,5})-(\d{1,7})$/i.exec(q);

  const taskCols = {
    number: tasks.number,
    title: tasks.title,
    projectKey: projects.key,
    projectName: projects.name,
    statusName: taskStatuses.name,
    category: taskStatuses.category,
  };
  // Members only find what's in their own projects.
  const mine = only ? inArray(projects.id, [...only]) : undefined;
  const live = and(eq(tasks.workspaceId, workspace.id), isNull(tasks.deletedAt), isNull(projects.archivedAt), mine);

  const [byKey, byText, projectRows, resourceRows, peopleRows] = await Promise.all([
    keyMatch
      ? db
          .select(taskCols)
          .from(tasks)
          .innerJoin(projects, eq(projects.id, tasks.projectId))
          .innerJoin(taskStatuses, eq(taskStatuses.id, tasks.statusId))
          .where(and(live, eq(projects.key, keyMatch[1].toUpperCase()), eq(tasks.number, Number(keyMatch[2]))))
          .limit(1)
      : [],
    db
      .select(taskCols)
      .from(tasks)
      .innerJoin(projects, eq(projects.id, tasks.projectId))
      .innerJoin(taskStatuses, eq(taskStatuses.id, tasks.statusId))
      .where(and(live, or(ilike(tasks.title, pattern), ilike(tasks.description, pattern))))
      // Title matches first, then open before finished.
      .orderBy(
        sql`case when ${tasks.title} ilike ${pattern} then 0 else 1 end`,
        sql`case when ${taskStatuses.category} in ('done','canceled') then 1 else 0 end`,
        tasks.number,
      )
      .limit(8),
    db
      .select({ key: projects.key, name: projects.name, client: projects.client, color: projects.color })
      .from(projects)
      .where(
        and(
          eq(projects.workspaceId, workspace.id),
          isNull(projects.archivedAt),
          mine,
          or(ilike(projects.name, pattern), ilike(projects.key, pattern), ilike(projects.client, pattern)),
        ),
      )
      .limit(5),
    db
      .select({ name: resources.name, role: resources.role, type: resources.type })
      .from(resources)
      .where(
        and(
          eq(resources.workspaceId, workspace.id),
          isNull(resources.archivedAt),
          or(ilike(resources.name, pattern), ilike(resources.role, pattern)),
        ),
      )
      .limit(5),
    db
      .select({ name: user.name, email: user.email })
      .from(member)
      .innerJoin(user, eq(user.id, member.userId))
      .where(and(eq(member.organizationId, workspace.id), or(ilike(user.name, pattern), ilike(user.email, pattern))))
      .limit(5),
  ]);

  const seen = new Set<string>();
  const taskResults = [...byKey, ...byText].flatMap((t) => {
    const key = `${t.projectKey}-${t.number}`;
    if (seen.has(key)) return [];
    seen.add(key);
    return [{ key, title: t.title, projectKey: t.projectKey, projectName: t.projectName, statusName: t.statusName, done: t.category === "done" || t.category === "canceled" }];
  });
  return { tasks: taskResults, projects: projectRows, resources: resourceRows, people: peopleRows };
}
