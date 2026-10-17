"use server";

import { headers } from "next/headers";
import { refresh } from "next/cache";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { requireWorkspace } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { member } from "@/lib/db/schema";

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
    throw new Error("Only workspace owners and admins can manage members.");
  }
  return ctx;
}

const inviteSchema = z.object({
  email: z.string().trim().toLowerCase().email("Enter a valid email address"),
  role: z.enum(["admin", "member"]),
});

export async function inviteMember(slug: string, input: z.input<typeof inviteSchema>): Promise<Result> {
  const parsed = inviteSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
  const { workspace } = await requireAdmin(slug);
  try {
    await auth.api.createInvitation({
      body: { email: parsed.data.email, role: parsed.data.role, organizationId: workspace.id, resend: true },
      headers: await headers(),
    });
  } catch (error) {
    return { ok: false, error: errorMessage(error, "Could not send the invitation.") };
  }
  refresh();
  return { ok: true };
}

export async function cancelInvitation(slug: string, invitationId: string): Promise<Result> {
  await requireAdmin(slug);
  try {
    await auth.api.cancelInvitation({ body: { invitationId }, headers: await headers() });
  } catch (error) {
    return { ok: false, error: errorMessage(error, "Could not cancel the invitation.") };
  }
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
  if (!ROLES.includes(role as (typeof ROLES)[number])) return { ok: false, error: "Invalid role" };
  const { workspace } = await requireAdmin(slug);
  const target = await loadMember(workspace.id, memberId);
  if (!target) return { ok: false, error: "Member not found" };
  if ((role === "owner" || target.role === "owner") && workspace.role !== "owner") {
    return { ok: false, error: "Only owners can add or remove owners." };
  }
  if (target.role === "owner" && role !== "owner" && (await ownerCount(workspace.id)) <= 1) {
    return { ok: false, error: "A workspace needs at least one owner. Make someone else owner first." };
  }
  try {
    await auth.api.updateMemberRole({
      body: { memberId, role: role as (typeof ROLES)[number], organizationId: workspace.id },
      headers: await headers(),
    });
  } catch (error) {
    return { ok: false, error: errorMessage(error, "Could not change the role.") };
  }
  refresh();
  return { ok: true };
}

export async function removeMember(slug: string, memberId: string): Promise<Result> {
  const { workspace, user } = await requireAdmin(slug);
  const target = await loadMember(workspace.id, memberId);
  if (!target) return { ok: false, error: "Member not found" };
  if (target.userId === user.id) return { ok: false, error: "You can't remove yourself." };
  if (target.role === "owner" && workspace.role !== "owner") {
    return { ok: false, error: "Only owners can remove an owner." };
  }
  if (target.role === "owner" && (await ownerCount(workspace.id)) <= 1) {
    return { ok: false, error: "You can't remove the last owner." };
  }
  try {
    await auth.api.removeMember({
      body: { memberIdOrEmail: memberId, organizationId: workspace.id },
      headers: await headers(),
    });
  } catch (error) {
    return { ok: false, error: errorMessage(error, "Could not remove the member.") };
  }
  refresh();
  return { ok: true };
}
