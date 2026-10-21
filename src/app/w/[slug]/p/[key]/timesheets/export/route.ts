import { requireWorkspace } from "@/lib/auth/session";
import { getVisibleProjectByKey } from "@/lib/data/project-access";
import { listTimeEntries } from "@/lib/data/timesheets";
import { canManageProject } from "@/lib/permissions";
import { isISODate } from "@/lib/timesheets";
import { getT } from "@/i18n/server";

const csvCell = (v: unknown) => {
  const s = v === null || v === undefined ? "" : String(v);
  // Quote everything; neutralise spreadsheet formulas.
  return `"${(/^[=+\-@]/.test(s) ? `'${s}` : s).replace(/"/g, '""')}"`;
};

// GET …/timesheets/export?from=YYYY-MM-DD&to=YYYY-MM-DD → CSV of time entries.
export async function GET(request: Request, ctx: RouteContext<"/w/[slug]/p/[key]/timesheets/export">) {
  const { slug, key } = await ctx.params;
  const t = await getT();
  const { user, workspace } = await requireWorkspace(slug);
  const project = await getVisibleProjectByKey(workspace, user.id, key);
  if (!project) return new Response(t("Not found"), { status: 404 });
  const url = new URL(request.url);
  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");
  if (!isISODate(from) || !isISODate(to) || from > to) return new Response(t("Choose a date"), { status: 400 });

  const manager = canManageProject(workspace.role, user.id, project);
  const rows = (await listTimeEntries(project.id, from, to)).filter((e) => manager || e.userId === user.id);
  const status = { approved: t("Approved"), pending: t("Pending"), rejected: t("Rejected") };
  const lines = [
    [t("Date"), t("Person"), t("Type"), t("Task"), t("Amount|time"), t("Unit"), t("Status"), t("Note")],
    ...rows.map((e) => [
      e.date,
      e.personName,
      e.kind === "member" ? t("Member") : t("Worker"),
      e.taskNumber ? `${project.key}-${e.taskNumber} ${e.taskTitle}` : t("Whole project"),
      Number(e.quantity),
      t(e.unit),
      status[e.status],
      e.note ?? "",
    ]),
  ];
  // BOM so Excel opens Arabic text correctly.
  const csv = "﻿" + lines.map((l) => l.map(csvCell).join(",")).join("\r\n");
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${project.key}-timesheet-${from}-to-${to}.csv"`,
      "Cache-Control": "private, no-store",
    },
  });
}
