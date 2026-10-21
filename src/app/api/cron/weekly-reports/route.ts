import { timingSafeEqual } from "node:crypto";
import { db } from "@/lib/db";
import { organization } from "@/lib/db/schema";
import { getWorkspaceAccess } from "@/lib/billing";
import { ensureWeeklyReport } from "@/lib/weekly-report-server";

/**
 * For the server's timer (e.g. cron every Saturday at 07:00):
 *   curl -H "Authorization: Bearer $CRON_SECRET" https://your-domain/api/cron/weekly-reports
 * Makes last week's report for every active company, so managers get it even if
 * nobody opens the app. Off until CRON_SECRET is set.
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  const given = request.headers.get("authorization")?.replace(/^Bearer /, "") ?? "";
  if (!secret || given.length !== secret.length || !timingSafeEqual(Buffer.from(given), Buffer.from(secret))) {
    return new Response(null, { status: 404 });
  }
  const workspaces = await db.select({ id: organization.id }).from(organization);
  let created = 0;
  for (const w of workspaces) {
    if (!(await getWorkspaceAccess(w.id)).allowed) continue;
    if (await ensureWeeklyReport(w.id)) created += 1;
  }
  return Response.json({ created, checked: workspaces.length });
}
