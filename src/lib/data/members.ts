import "server-only";
import { and, asc, desc, eq, gt } from "drizzle-orm";
import { db } from "@/lib/db";
import { invitation, member, organization, user } from "@/lib/db/schema";

export async function listWorkspaceMembers(workspaceId: string) {
  return db
    .select({
      memberId: member.id,
      userId: user.id,
      name: user.name,
      email: user.email,
      image: user.image,
      role: member.role,
      joinedAt: member.createdAt,
    })
    .from(member)
    .innerJoin(user, eq(user.id, member.userId))
    .where(eq(member.organizationId, workspaceId))
    .orderBy(asc(user.name));
}

export async function listPendingInvitations(workspaceId: string) {
  return db
    .select({
      id: invitation.id,
      email: invitation.email,
      role: invitation.role,
      expiresAt: invitation.expiresAt,
      inviterName: user.name,
    })
    .from(invitation)
    .leftJoin(user, eq(user.id, invitation.inviterId))
    .where(
      and(
        eq(invitation.organizationId, workspaceId),
        eq(invitation.status, "pending"),
        gt(invitation.expiresAt, new Date()),
      ),
    )
    .orderBy(desc(invitation.createdAt));
}

/** Invitation details for the accept page (no workspace membership needed). */
export async function getInvitation(id: string) {
  const [row] = await db
    .select({
      id: invitation.id,
      email: invitation.email,
      role: invitation.role,
      status: invitation.status,
      expiresAt: invitation.expiresAt,
      workspaceName: organization.name,
      workspaceSlug: organization.slug,
      inviterName: user.name,
    })
    .from(invitation)
    .innerJoin(organization, eq(organization.id, invitation.organizationId))
    .leftJoin(user, eq(user.id, invitation.inviterId))
    .where(eq(invitation.id, id))
    .limit(1);
  return row ?? null;
}
