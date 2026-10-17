import { and, eq } from "drizzle-orm";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { member, organization } from "@/lib/db/schema";
import { getWorkspaceAccess } from "@/lib/billing";
import { listAuditEntries } from "@/lib/data/audit";
import { ACTIVITY_GROUPS, activityGroup, describeActivity, type ActivityGroup } from "@/lib/activity-text";

/** Escapes a CSV cell; also neutralises spreadsheet formulas (=, +, -, @). */
function cell(value: string) {
  const safe = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  return `"${safe.replace(/"/g, '""')}"`;
}

export async function GET(request: Request, ctx: RouteContext<"/w/[slug]/audit/export">) {
  const { slug } = await ctx.params;
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return new Response("Unauthorized", { status: 401 });
  const [ws] = await db
    .select({ id: organization.id, role: member.role })
    .from(organization)
    .innerJoin(member, and(eq(member.organizationId, organization.id), eq(member.userId, session.user.id)))
    .where(eq(organization.slug, slug))
    .limit(1);
  if (!ws || (ws.role !== "owner" && ws.role !== "admin")) return new Response("Not found", { status: 404 });
  if (!(await getWorkspaceAccess(ws.id)).allowed) return new Response("Subscription not active", { status: 402 });

  const url = new URL(request.url);
  const group = (Object.keys(ACTIVITY_GROUPS) as ActivityGroup[]).find((g) => g === url.searchParams.get("group"));
  const entries = await listAuditEntries(ws.id, {
    group,
    actorId: url.searchParams.get("actor") || undefined,
    limit: 10_000,
  });
  const rows = [
    ["Date (UTC)", "Person", "Area", "What happened", "Project"],
    ...entries.map((e) => [
      new Date(e.createdAt).toISOString().replace("T", " ").slice(0, 19),
      e.actorName ?? "System",
      ACTIVITY_GROUPS[activityGroup(e.type)],
      describeActivity(e.type, e.data, e.projectKey && e.taskNumber ? `${e.projectKey}-${e.taskNumber}` : null),
      e.projectName ?? "",
    ]),
  ];
  // BOM so Excel opens UTF-8 (Arabic names etc.) correctly.
  const csv = "﻿" + rows.map((r) => r.map(cell).join(",")).join("\r\n");
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="audit-log-${slug}.csv"`,
      "Cache-Control": "private, no-store",
    },
  });
}
