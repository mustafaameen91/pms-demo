import "server-only";
import { and, eq, inArray, sql } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { member, organization, projects } from "@/lib/db/schema";
import { getWorkspaceAccess } from "@/lib/billing";
import { unreadCount } from "@/lib/data/notifications";
import { isWorkspaceAdmin } from "@/lib/permissions";
import { isLocale, localeFromHeader } from "@/i18n/config";
import { tFor } from "@/i18n/server";
import type { WorkspaceRole } from "@/lib/auth/session";
import type { T } from "@/i18n/translate";

/**
 * Helpers for the phone app's JSON API (/api/mobile/v1/…). The app signs in
 * for a token and sends "Authorization: Bearer <token>"; every rule is checked
 * here on the server, exactly like the website.
 */

export const API_VERSION = 1;

const NO_STORE = { "Cache-Control": "private, no-store" };

export const json = (data: unknown, status = 200) => Response.json(data, { status, headers: NO_STORE });

/** { error: { code, message } } — `message` is ready to show, in the person's language. */
export const fail = (status: number, code: string, message: string) => json({ error: { code, message } }, status);

/** The person's language: their account's, else the phone's (Accept-Language). */
export function mobileT(request: Request, locale?: string | null) {
  return tFor(isLocale(locale) ? locale : localeFromHeader(request.headers.get("accept-language")));
}

export type MobileUser = { id: string; name: string; email: string; image: string | null; locale: string };

/** The signed-in person from the bearer token, or null. */
export async function mobileUser(request: Request): Promise<MobileUser | null> {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) return null;
  const u = session.user as typeof session.user & { locale?: string | null };
  return { id: u.id, name: u.name, email: u.email, image: u.image ?? null, locale: isLocale(u.locale) ? u.locale : "en" };
}

type Authed = { user: MobileUser; t: T };
type InWorkspace = Authed & { workspace: { id: string; slug: string; name: string; role: WorkspaceRole } };

/** Signed in, or a 401 the app answers by showing the login screen. */
export async function requireMobileUser(request: Request): Promise<Authed | Response> {
  const user = await mobileUser(request);
  if (!user) return fail(401, "unauthorized", mobileT(request)("Please sign in again."));
  return { user, t: mobileT(request, user.locale) };
}

/** Signed in, a member of this company, and its subscription active. */
export async function requireMobileWorkspace(request: Request, slug: string): Promise<InWorkspace | Response> {
  const authed = await requireMobileUser(request);
  if (authed instanceof Response) return authed;
  const { user, t } = authed;
  const [row] = await db
    .select({ id: organization.id, slug: organization.slug, name: organization.name, role: member.role })
    .from(organization)
    .innerJoin(member, and(eq(member.organizationId, organization.id), eq(member.userId, user.id)))
    .where(eq(organization.slug, slug))
    .limit(1);
  if (!row) return fail(404, "not_found", t("Not found"));
  if (!(await getWorkspaceAccess(row.id)).allowed) return fail(402, "locked", t("This workspace's subscription isn't active."));
  return { user, t, workspace: { ...row, role: row.role as WorkspaceRole } };
}

/** Who I am: my companies, my role in each, and whether I manage anything there. */
export async function buildMe(user: MobileUser) {
  const memberships = await db
    .select({ id: organization.id, slug: organization.slug, name: organization.name, role: member.role })
    .from(member)
    .innerJoin(organization, eq(organization.id, member.organizationId))
    .where(eq(member.userId, user.id))
    .orderBy(member.createdAt);
  const ids = memberships.map((m) => m.id);
  const led = ids.length
    ? await db
        .select({ workspaceId: projects.workspaceId, n: sql<number>`count(*)`.mapWith(Number) })
        .from(projects)
        .where(and(inArray(projects.workspaceId, ids), eq(projects.leadId, user.id)))
        .groupBy(projects.workspaceId)
    : [];
  const workspaces = await Promise.all(
    memberships.map(async (m) => {
      const role = m.role as WorkspaceRole;
      const access = await getWorkspaceAccess(m.id);
      const leads = led.find((l) => l.workspaceId === m.id)?.n ?? 0;
      return {
        id: m.id,
        slug: m.slug,
        name: m.name,
        role,
        // Which home the app opens: "manager" for owners, admins and project managers.
        view: isWorkspaceAdmin(role) || leads > 0 ? ("manager" as const) : ("member" as const),
        managesProjects: leads,
        access: { allowed: access.allowed, kind: access.kind },
        unread: access.allowed ? await unreadCount(user.id, m.id) : 0,
      };
    }),
  );
  return { apiVersion: API_VERSION, user, workspaces };
}
