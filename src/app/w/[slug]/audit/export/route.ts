import { and, eq } from "drizzle-orm";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { member, organization } from "@/lib/db/schema";
import { getWorkspaceAccess } from "@/lib/billing";
import { listAuditEntries } from "@/lib/data/audit";
import { ACTIVITY_GROUPS, activityGroup, describeActivity, type ActivityGroup } from "@/lib/activity-text";
import { getT } from "@/i18n/server";

/** Escapes a CSV cell; also neutralises spreadsheet formulas (=, +, -, @). */
function cell(value: string) {
  const safe = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  return `"${safe.replace(/"/g, '""')}"`;
}

export async function GET(request: Request, ctx: RouteContext<"/w/[slug]/audit/export">) {
  const [{ slug }, t] = await Promise.all([ctx.params, getT()]);
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return new Response(t("Unauthorized"), { status: 401 });
  const [ws] = await db
    .select({ id: organization.id, role: member.role })
    .from(organization)
    .innerJoin(member, and(eq(member.organizationId, organization.id), eq(member.userId, session.user.id)))
    .where(eq(organization.slug, slug))
    .limit(1);
  if (!ws || (ws.role !== "owner" && ws.role !== "admin")) return new Response(t("Not found"), { status: 404 });
  if (!(await getWorkspaceAccess(ws.id)).allowed) return new Response(t("Subscription not active"), { status: 402 });

  // "System" alone is already the theme option ("حسب النظام"); the actor needs its own entry.
  const systemActor = t.locale === "en" ? "System" : t("System (actor)");
  const url = new URL(request.url);
  const group = (Object.keys(ACTIVITY_GROUPS) as ActivityGroup[]).find((g) => g === url.searchParams.get("group"));
  const entries = await listAuditEntries(ws.id, {
    group,
    actorId: url.searchParams.get("actor") || undefined,
    limit: 10_000,
  });
  const rows = [
    [t("Date (UTC)"), t("Person"), t("Area"), t("What happened"), t("Project")],
    ...entries.map((e) => [
      new Date(e.createdAt).toISOString().replace("T", " ").slice(0, 19),
      e.actorName ?? (e.data.automation ? t("Automation") : systemActor),
      t(ACTIVITY_GROUPS[activityGroup(e.type)]),
      describeActivity(e.type, e.data, e.projectKey && e.taskNumber ? `${e.projectKey}-${e.taskNumber}` : null, t),
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
