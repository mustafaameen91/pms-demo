import "server-only";
import { and, eq, inArray, sql } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { member, organization, projects } from "@/lib/db/schema";
import { getWorkspaceAccess } from "@/lib/billing";
import { unreadCount } from "@/lib/data/notifications";
import { canManageProject, isWorkspaceAdmin } from "@/lib/permissions";
import { canViewProject } from "@/lib/data/project-access";
import { SUBSCRIPTION_INACTIVE } from "@/lib/auth/session";
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

/**
 * The language to answer in: the app's (it sends Accept-Language, and has its own
 * language switch), else the account's. The website's actions called from here
 * read the same header, so every message comes back in one language.
 */
export function mobileT(request: Request, locale?: string | null) {
  const header = request.headers.get("accept-language");
  return tFor(header ? localeFromHeader(header) : isLocale(locale) ? locale : null);
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
export type InWorkspace = Authed & { workspace: { id: string; slug: string; name: string; role: WorkspaceRole } };

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

type ActionResult =
  | { ok: true; data?: unknown; warning?: string; info?: string; pending?: boolean }
  | { ok: false; error: string; fieldErrors?: Record<string, string> };

/**
 * Runs one of the website's own actions — the same code and the same rules —
 * and answers in the API's shape: 200 { ok, warning?, info?, pending?, data? }
 * or 400 { error: { code: "invalid", message, fields } }.
 */
export async function runAction(t: T, action: () => Promise<ActionResult | void>, status = 200): Promise<Response> {
  try {
    const result = await action();
    if (!result) return json({ ok: true }, status);
    if (!result.ok) return json({ error: { code: "invalid", message: result.error, fields: result.fieldErrors ?? {} } }, 400);
    const { ok, ...rest } = result;
    return json({ ok, ...rest }, status);
  } catch (error) {
    const digest = (error as { digest?: unknown })?.digest;
    // redirect("/login") / notFound() from the shared session helpers.
    if (typeof digest === "string" && digest.startsWith("NEXT_REDIRECT")) return fail(401, "unauthorized", t("Please sign in again."));
    if (typeof digest === "string" && digest.includes("404")) return fail(404, "not_found", t("Not found"));
    const message = error instanceof Error ? error.message : "";
    if (message === t(SUBSCRIPTION_INACTIVE)) return fail(402, "locked", t("This workspace's subscription isn't active."));
    if (message === t("Not a member of this workspace")) return fail(404, "not_found", t("Not found"));
    console.error("mobile action failed", error);
    return fail(500, "server", t("Something went wrong on the server. Try again in a moment."));
  }
}

/** A project in this company the person can see, or null (→ 404). */
export async function mobileProject(ctx: InWorkspace, projectId: string) {
  const [project] = await db
    .select()
    .from(projects)
    .where(and(eq(projects.id, projectId), eq(projects.workspaceId, ctx.workspace.id)))
    .limit(1);
  if (!project || !(await canViewProject(ctx.workspace.role, ctx.user.id, project))) return null;
  return { project, manager: canManageProject(ctx.workspace.role, ctx.user.id, project) };
}

/** JSON body of a request, or {} when it isn't JSON. */
export async function readJson(request: Request): Promise<Record<string, unknown>> {
  try {
    const body = await request.json();
    return body && typeof body === "object" && !Array.isArray(body) ? (body as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

/** Where a notification's website link points, for the app to open the right screen. */
export function appTarget(link: string | null): { type: "task"; key: string } | null {
  const m = link?.match(/[?&]task=([A-Z0-9]+-\d+)/i);
  return m ? { type: "task", key: m[1].toUpperCase() } : null;
}
