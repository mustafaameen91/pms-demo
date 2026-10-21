"use server";

import { refresh } from "next/cache";
import { and, eq, inArray, notInArray } from "drizzle-orm";
import { z } from "zod";
import { requireWorkspace, requireWorkspaceById } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { activities, portfolios, projects } from "@/lib/db/schema";
import { isWorkspaceAdmin } from "@/lib/permissions";
import { isHexColor } from "@/lib/branding";
import { getT } from "@/i18n/server";

type Result<T = undefined> = { ok: true; data?: T } | { ok: false; error: string; fieldErrors?: Record<string, string> };
const ADMINS_ONLY = "Only workspace owners and admins can manage portfolios.";

const portfolioSchema = z.object({
  name: z.string().trim().min(2, "Give the portfolio a name").max(80),
  description: z.string().trim().max(500).optional().transform((v) => v || null),
  color: z.string().refine(isHexColor, "Choose a colour"),
});
export type PortfolioInput = z.input<typeof portfolioSchema>;

function invalid(error: z.ZodError, t: (s: string) => string): Result<never> {
  const fieldErrors: Record<string, string> = {};
  for (const issue of error.issues) fieldErrors[String(issue.path[0])] ??= t(issue.message);
  return { ok: false, error: t(error.issues[0].message), fieldErrors };
}

async function adminPortfolio(id: string) {
  const [row] = await db.select().from(portfolios).where(eq(portfolios.id, id)).limit(1);
  if (!row) return null;
  const auth = await requireWorkspaceById(row.workspaceId);
  return isWorkspaceAdmin(auth.role) ? { portfolio: row, ...auth } : null;
}

export async function createPortfolio(slug: string, input: PortfolioInput): Promise<Result<{ id: string }>> {
  const t = await getT();
  const { user, workspace } = await requireWorkspace(slug);
  if (!isWorkspaceAdmin(workspace.role)) return { ok: false, error: t(ADMINS_ONLY) };
  const parsed = portfolioSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error, t);
  const [row] = await db
    .insert(portfolios)
    .values({ ...parsed.data, workspaceId: workspace.id, createdById: user.id })
    .returning({ id: portfolios.id });
  await db.insert(activities).values({ workspaceId: workspace.id, actorId: user.id, type: "portfolio.created", data: { name: parsed.data.name } });
  refresh();
  return { ok: true, data: { id: row.id } };
}

export async function updatePortfolio(id: string, input: PortfolioInput): Promise<Result> {
  const t = await getT();
  const auth = await adminPortfolio(id);
  if (!auth) return { ok: false, error: t(ADMINS_ONLY) };
  const parsed = portfolioSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error, t);
  await db.update(portfolios).set({ ...parsed.data, updatedAt: new Date() }).where(eq(portfolios.id, id));
  refresh();
  return { ok: true };
}

/** Its projects stay; they're just no longer grouped. */
export async function deletePortfolio(id: string): Promise<Result> {
  const t = await getT();
  const auth = await adminPortfolio(id);
  if (!auth) return { ok: false, error: t(ADMINS_ONLY) };
  await db.delete(portfolios).where(eq(portfolios.id, id));
  await db.insert(activities).values({ workspaceId: auth.portfolio.workspaceId, actorId: auth.user.id, type: "portfolio.deleted", data: { name: auth.portfolio.name } });
  refresh();
  return { ok: true };
}

/**
 * Exactly these projects are in the portfolio. A project moved here leaves its
 * old portfolio (a project is in at most one).
 */
export async function setPortfolioProjects(id: string, projectIds: string[]): Promise<Result> {
  const t = await getT();
  const auth = await adminPortfolio(id);
  if (!auth) return { ok: false, error: t(ADMINS_ONLY) };
  const workspaceId = auth.portfolio.workspaceId;
  const ids = [...new Set(projectIds)].slice(0, 500);
  await db.transaction(async (tx) => {
    await tx
      .update(projects)
      .set({ portfolioId: null })
      .where(and(eq(projects.portfolioId, id), ids.length ? notInArray(projects.id, ids) : undefined));
    if (ids.length) {
      await tx
        .update(projects)
        .set({ portfolioId: id })
        .where(and(eq(projects.workspaceId, workspaceId), inArray(projects.id, ids)));
    }
    await tx.insert(activities).values({
      workspaceId,
      actorId: auth.user.id,
      type: "portfolio.projects_changed",
      data: { name: auth.portfolio.name, count: ids.length },
    });
  });
  refresh();
  return { ok: true };
}
