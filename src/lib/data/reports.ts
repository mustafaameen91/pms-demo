import "server-only";
import { and, desc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { weeklyReports } from "@/lib/db/schema";
import type { WeeklyReportData } from "@/lib/weekly-report";

/** A company's weekly reports, newest first. Caller filters what each person may read. */
export async function listReports(workspaceId: string) {
  const rows = await db
    .select({ weekStart: weeklyReports.weekStart, data: weeklyReports.data })
    .from(weeklyReports)
    .where(eq(weeklyReports.workspaceId, workspaceId))
    .orderBy(desc(weeklyReports.weekStart))
    .limit(104);
  return rows.map((r) => ({ weekStart: r.weekStart, data: r.data as unknown as WeeklyReportData }));
}

export async function getReport(workspaceId: string, weekStart: string) {
  const [row] = await db
    .select({ data: weeklyReports.data })
    .from(weeklyReports)
    .where(and(eq(weeklyReports.workspaceId, workspaceId), eq(weeklyReports.weekStart, weekStart)))
    .limit(1);
  return row ? (row.data as unknown as WeeklyReportData) : null;
}
