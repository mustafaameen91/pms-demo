import { and, eq } from "drizzle-orm";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { bills, employeeContracts, employeeDocuments, employees, member } from "@/lib/db/schema";
import { readStoredFile } from "@/lib/uploads";
import { getWorkspaceAccess } from "@/lib/billing";
import { isWorkspaceAdmin } from "@/lib/permissions";
import { getT } from "@/i18n/server";
import type { WorkspaceRole } from "@/lib/auth/session";

// HR files (an employee's photo, documents or contract scans): owners and admins only.
export async function GET(_request: Request, ctx: RouteContext<"/api/files/hr/[kind]/[id]">) {
  const { kind, id } = await ctx.params;
  const t = await getT();
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return new Response(t("Unauthorized"), { status: 401 });

  const row =
    kind === "photo"
      ? (
          await db
            .select({ path: employees.photoPath, type: employees.photoType, name: employees.name, workspaceId: employees.workspaceId })
            .from(employees)
            .where(eq(employees.id, id))
            .limit(1)
        )[0]
      : kind === "document"
        ? (
            await db
              .select({ path: employeeDocuments.filePath, type: employeeDocuments.fileType, name: employeeDocuments.fileName, workspaceId: employeeDocuments.workspaceId })
              .from(employeeDocuments)
              .where(eq(employeeDocuments.id, id))
              .limit(1)
          )[0]
        : kind === "contract"
          ? (
              await db
                .select({ path: employeeContracts.filePath, type: employeeContracts.fileType, name: employeeContracts.fileName, workspaceId: employeeContracts.workspaceId })
                .from(employeeContracts)
                .where(eq(employeeContracts.id, id))
                .limit(1)
            )[0]
          : kind === "bill"
            ? (
                await db
                  .select({ path: bills.filePath, type: bills.fileType, name: bills.fileName, workspaceId: bills.workspaceId })
                  .from(bills)
                  .where(eq(bills.id, id))
                  .limit(1)
              )[0]
            : undefined;
  if (!row?.path || !row.type) return new Response(t("Not found"), { status: 404 });

  const [m] = await db
    .select({ role: member.role })
    .from(member)
    .where(and(eq(member.organizationId, row.workspaceId), eq(member.userId, session.user.id)))
    .limit(1);
  if (!m || !isWorkspaceAdmin(m.role as WorkspaceRole)) return new Response(t("Not found"), { status: 404 });
  if (!(await getWorkspaceAccess(row.workspaceId)).allowed) {
    return new Response(t("This workspace's subscription isn't active."), { status: 402 });
  }

  const file = await readStoredFile(row.path).catch(() => null);
  if (!file) return new Response(t("Not found"), { status: 404 });
  const filename = (row.name ?? kind).replace(/["\r\n]/g, "");
  return new Response(new Uint8Array(file), {
    headers: {
      "Content-Type": row.type,
      "Content-Length": String(file.length),
      "Content-Disposition": `inline; filename="${encodeURIComponent(filename)}"`,
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "private, no-store",
      ...(row.type !== "application/pdf" && {
        "Content-Security-Policy": "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; sandbox",
      }),
    },
  });
}
