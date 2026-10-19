"use server";

import { headers } from "next/headers";
import { refresh } from "next/cache";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { requireWorkspace } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { activities, member, user as userTable } from "@/lib/db/schema";
import { getT } from "@/i18n/server";

type Result = { ok: true } | { ok: false; error: string };
const ROLES = ["owner", "admin", "member"] as const;

/** Better Auth throws APIError with a readable message; surface it. */
function errorMessage(error: unknown, fallback: string) {
  if (error && typeof error === "object" && "body" in error) {
    const body = (error as { body?: { message?: string } }).body;
    if (body?.message) return body.message;
  }
  return error instanceof Error && error.message ? error.message : fallback;
}

async function requireAdmin(slug: string) {
  const ctx = await requireWorkspace(slug);
  if (ctx.workspace.role !== "owner" && ctx.workspace.role !== "admin") {
    const t = await getT();
    throw new Error(t("Only workspace owners and admins can manage members."));
  }
  return ctx;
}

const inviteSchema = z.object({
  email: z.string().trim().toLowerCase().email("Enter a valid email address"),
  role: z.enum(["admin", "member"]),
});

export async function inviteMember(slug: string, input: z.input<typeof inviteSchema>): Promise<Result> {
  const t = await getT();
  const parsed = inviteSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: t(parsed.error.issues[0].message) };
  const { workspace, user } = await requireAdmin(slug);
  try {
    await auth.api.createInvitation({
      body: { email: parsed.data.email, role: parsed.data.role, organizationId: workspace.id, resend: true },
      headers: await headers(),
    });
  } catch (error) {
    return { ok: false, error: t(errorMessage(error, "Could not send the invitation.")) };
  }
  await audit(workspace.id, user.id, "member.invited", { email: parsed.data.email, role: parsed.data.role });
  refresh();
  return { ok: true };
}

export async function cancelInvitation(slug: string, invitationId: string): Promise<Result> {
  const t = await getT();
  const { workspace, user } = await requireAdmin(slug);
  try {
    await auth.api.cancelInvitation({ body: { invitationId }, headers: await headers() });
  } catch (error) {
    return { ok: false, error: t(errorMessage(error, "Could not cancel the invitation.")) };
  }
  await audit(workspace.id, user.id, "member.invitation_cancelled", { invitationId });
  refresh();
  return { ok: true };
}

async function ownerCount(workspaceId: string) {
  const rows = await db
    .select({ id: member.id })
    .from(member)
    .where(and(eq(member.organizationId, workspaceId), eq(member.role, "owner")));
  return rows.length;
}

async function loadMember(workspaceId: string, memberId: string) {
  const [row] = await db
    .select()
    .from(member)
    .where(and(eq(member.id, memberId), eq(member.organizationId, workspaceId)))
    .limit(1);
  return row ?? null;
}

export async function changeMemberRole(slug: string, memberId: string, role: string): Promise<Result> {
  const t = await getT();
  if (!ROLES.includes(role as (typeof ROLES)[number])) return { ok: false, error: t("Invalid role") };
  const { workspace, user } = await requireAdmin(slug);
  const target = await loadMember(workspace.id, memberId);
  if (!target) return { ok: false, error: t("Member not found") };
  if ((role === "owner" || target.role === "owner") && workspace.role !== "owner") {
    return { ok: false, error: t("Only owners can add or remove owners.") };
  }
  if (target.role === "owner" && role !== "owner" && (await ownerCount(workspace.id)) <= 1) {
    return { ok: false, error: t("A workspace needs at least one owner. Make someone else owner first.") };
  }
  try {
    await auth.api.updateMemberRole({
      body: { memberId, role: role as (typeof ROLES)[number], organizationId: workspace.id },
      headers: await headers(),
    });
  } catch (error) {
    return { ok: false, error: t(errorMessage(error, "Could not change the role.")) };
  }
  await audit(workspace.id, user.id, "member.role_changed", { email: await emailOf(target.userId), from: target.role, to: role });
  refresh();
  return { ok: true };
}

export async function removeMember(slug: string, memberId: string): Promise<Result> {
  const t = await getT();
  const { workspace, user } = await requireAdmin(slug);
  const target = await loadMember(workspace.id, memberId);
  if (!target) return { ok: false, error: t("Member not found") };
  if (target.userId === user.id) return { ok: false, error: t("You can't remove yourself.") };
  if (target.role === "owner" && workspace.role !== "owner") {
    return { ok: false, error: t("Only owners can remove an owner.") };
  }
  if (target.role === "owner" && (await ownerCount(workspace.id)) <= 1) {
    return { ok: false, error: t("You can't remove the last owner.") };
  }
  try {
    await auth.api.removeMember({
      body: { memberIdOrEmail: memberId, organizationId: workspace.id },
      headers: await headers(),
    });
  } catch (error) {
    return { ok: false, error: t(errorMessage(error, "Could not remove the member.")) };
  }
  await audit(workspace.id, user.id, "member.removed", { email: await emailOf(target.userId), role: target.role });
  refresh();
  return { ok: true };
}

async function audit(workspaceId: string, actorId: string, type: string, data: Record<string, unknown>) {
  await db.insert(activities).values({ workspaceId, actorId, type, data });
}

async function emailOf(userId: string) {
  const [row] = await db.select({ email: userTable.email }).from(userTable).where(eq(userTable.id, userId)).limit(1);
  return row?.email ?? null;
}
