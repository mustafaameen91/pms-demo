import "server-only";
import { cache } from "react";
import { headers } from "next/headers";
import { redirect, notFound } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { member, organization } from "@/lib/db/schema";

export type WorkspaceRole = "owner" | "admin" | "member";

/** Current session, or null. Deduplicated per request. */
export const getSession = cache(async () => {
  return auth.api.getSession({ headers: await headers() });
});

/** Current user; redirects to /login when signed out. */
export async function requireUser() {
  const session = await getSession();
  if (!session) redirect("/login");
  return session.user;
}

/** Workspaces the user belongs to, oldest first. */
export const getUserWorkspaces = cache(async (userId: string) => {
  return db
    .select({
      id: organization.id,
      name: organization.name,
      slug: organization.slug,
      role: member.role,
    })
    .from(member)
    .innerJoin(organization, eq(member.organizationId, organization.id))
    .where(eq(member.userId, userId))
    .orderBy(member.createdAt);
});

/**
 * Resolves a workspace by slug and verifies the signed-in user is a member.
 * Use in every page and server action that touches workspace data.
 */
export const requireWorkspace = cache(async (slug: string) => {
  const user = await requireUser();
  const [row] = await db
    .select({
      id: organization.id,
      name: organization.name,
      slug: organization.slug,
      role: member.role,
    })
    .from(organization)
    .innerJoin(
      member,
      and(eq(member.organizationId, organization.id), eq(member.userId, user.id)),
    )
    .where(eq(organization.slug, slug))
    .limit(1);
  // Same response for "doesn't exist" and "not a member" so slugs can't be probed.
  if (!row) notFound();
  return { user, workspace: { ...row, role: row.role as WorkspaceRole } };
});

/** Like requireWorkspace, but by id — for server actions that receive ids. */
export async function requireWorkspaceById(workspaceId: string) {
  const user = await requireUser();
  const [row] = await db
    .select({ role: member.role, slug: organization.slug })
    .from(member)
    .innerJoin(organization, eq(member.organizationId, organization.id))
    .where(and(eq(member.organizationId, workspaceId), eq(member.userId, user.id)))
    .limit(1);
  if (!row) throw new Error("Not a member of this workspace");
  return { user, role: row.role as WorkspaceRole, slug: row.slug };
}
