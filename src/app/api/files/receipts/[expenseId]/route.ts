import { and, eq } from "drizzle-orm";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { expenses, member, projects } from "@/lib/db/schema";
import { readStoredFile } from "@/lib/uploads";
import { getWorkspaceAccess } from "@/lib/billing";
import { getT } from "@/i18n/server";
import { canViewProject } from "@/lib/data/project-access";
import type { WorkspaceRole } from "@/lib/auth/session";

// Receipts are only served to members of the expense's workspace.
export async function GET(_request: Request, ctx: RouteContext<"/api/files/receipts/[expenseId]">) {
  const { expenseId } = await ctx.params;
  const t = await getT();
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return new Response(t("Unauthorized"), { status: 401 });

  const [row] = await db
    .select({
      path: expenses.receiptPath,
      name: expenses.receiptName,
      type: expenses.receiptType,
      workspaceId: expenses.workspaceId,
      role: member.role,
      projectId: expenses.projectId,
    })
    .from(expenses)
    .innerJoin(
      member,
      and(eq(member.organizationId, expenses.workspaceId), eq(member.userId, session.user.id)),
    )
    .where(eq(expenses.id, expenseId))
    .limit(1);
  if (!row?.path || !row.type) return new Response(t("Not found"), { status: 404 });
  // Only people who can see the project see its receipts.
  const [project] = await db.select({ id: projects.id, leadId: projects.leadId }).from(projects).where(eq(projects.id, row.projectId));
  if (!project || !(await canViewProject(row.role as WorkspaceRole, session.user.id, project))) {
    return new Response(t("Not found"), { status: 404 });
  }
  if (!(await getWorkspaceAccess(row.workspaceId)).allowed) {
    return new Response(t("This workspace's subscription isn't active."), { status: 402 });
  }

  const file = await readStoredFile(row.path).catch(() => null);
  if (!file) return new Response(t("Not found"), { status: 404 });

  const filename = (row.name ?? "receipt").replace(/["\r\n]/g, "");
  return new Response(new Uint8Array(file), {
    headers: {
      "Content-Type": row.type,
      "Content-Length": String(file.length),
      "Content-Disposition": `inline; filename="${filename}"`,
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "private, no-store",
      // Types are verified from file contents on upload (no SVG/HTML). Images get a strict
      // policy too; PDFs can't, as Chrome won't open a PDF in a sandboxed document.
      ...(row.type !== "application/pdf" && {
        "Content-Security-Policy": "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; sandbox",
      }),
    },
  });
}
