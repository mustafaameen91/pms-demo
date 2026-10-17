import { and, eq } from "drizzle-orm";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { member, organization } from "@/lib/db/schema";
import { getProjectReport } from "@/lib/data/report";
import { buildProjectWorkbook } from "@/lib/excel";

// GET /w/[slug]/p/[key]/export → project report as an Excel file (members only).
export async function GET(_request: Request, ctx: RouteContext<"/w/[slug]/p/[key]/export">) {
  const { slug, key } = await ctx.params;
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return new Response("Unauthorized", { status: 401 });

  const [workspace] = await db
    .select({ id: organization.id })
    .from(organization)
    .innerJoin(member, and(eq(member.organizationId, organization.id), eq(member.userId, session.user.id)))
    .where(eq(organization.slug, slug))
    .limit(1);
  if (!workspace) return new Response("Not found", { status: 404 });

  const report = await getProjectReport(workspace.id, key);
  if (!report) return new Response("Not found", { status: 404 });

  const file = await buildProjectWorkbook(report);
  const filename = `${report.project.key}-report-${report.today}.xlsx`;
  return new Response(new Uint8Array(file), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
