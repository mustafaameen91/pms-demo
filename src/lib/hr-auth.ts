import "server-only";
import { eq } from "drizzle-orm";
import type { z } from "zod";
import { requireWorkspace, requireWorkspaceById } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { employees } from "@/lib/db/schema";
import { isWorkspaceAdmin } from "@/lib/permissions";

/** HR is for owners and admins only: salaries and personal details are private. */
export const ADMINS_ONLY = "Only workspace owners and admins can manage HR.";

export type Result<T = undefined> = { ok: true; data?: T } | { ok: false; error: string; fieldErrors?: Record<string, string> };

export function invalid(error: z.ZodError, t: (s: string) => string): Result<never> {
  const fieldErrors: Record<string, string> = {};
  for (const issue of error.issues) fieldErrors[String(issue.path[0])] ??= t(issue.message);
  return { ok: false, error: t(error.issues[0].message), fieldErrors };
}

/** Owner/admin of the workspace, or null. */
export async function hrAdmin(slug: string) {
  const auth = await requireWorkspace(slug);
  return isWorkspaceAdmin(auth.workspace.role) ? auth : null;
}

/** Owner/admin of a workspace by id, or null. */
export async function hrAdminById(workspaceId: string) {
  const auth = await requireWorkspaceById(workspaceId);
  return isWorkspaceAdmin(auth.role) ? { ...auth, workspaceId } : null;
}

/** The employee, when the caller is an owner/admin of its workspace. */
export async function hrEmployee(id: string) {
  const [row] = await db.select().from(employees).where(eq(employees.id, id)).limit(1);
  if (!row) return null;
  const auth = await requireWorkspaceById(row.workspaceId);
  return isWorkspaceAdmin(auth.role) ? { employee: row, ...auth } : null;
}
