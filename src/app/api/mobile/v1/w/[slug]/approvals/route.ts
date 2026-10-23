import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/lib/db";
import { projects } from "@/lib/db/schema";
import { json, requireMobileWorkspace } from "@/lib/mobile/api";
import { listPendingApprovals } from "@/lib/data/expenses";
import { listPendingHours } from "@/lib/data/approvals";
import { listLoanRequests } from "@/lib/data/loans";
import { isWorkspaceAdmin } from "@/lib/permissions";

/**
 * GET → what's waiting for my decision: expenses (as on the website's Approvals page),
 * team members' hours in the projects I manage, and loan requests (owners and admins).
 */
export async function GET(request: Request, ctx: RouteContext<"/api/mobile/v1/w/[slug]/approvals">) {
  const authed = await requireMobileWorkspace(request, (await ctx.params).slug);
  if (authed instanceof Response) return authed;
  const { user, workspace } = authed;
  const admin = isWorkspaceAdmin(workspace.role);
  const managed = await db
    .select({ id: projects.id })
    .from(projects)
    .where(and(eq(projects.workspaceId, workspace.id), isNull(projects.archivedAt), admin ? undefined : eq(projects.leadId, user.id)));
  const [expenses, hours, loans] = await Promise.all([
    listPendingApprovals(workspace.id, user.id, admin),
    listPendingHours(managed.map((p) => p.id)),
    admin ? listLoanRequests(workspace.id, { status: "pending" }) : [],
  ]);
  return json({
    canLoans: admin,
    expenses: expenses.map((e) => ({
      id: e.id,
      date: e.date,
      amount: e.amount,
      currency: e.currency,
      description: e.description,
      payee: e.payee,
      requester: e.requesterName,
      project: { key: e.projectKey, name: e.projectName },
      advance: e.loanId !== null,
      // Nobody approves their own expense.
      mine: e.requesterId === user.id,
      createdAt: e.createdAt,
    })),
    hours: hours
      .filter((h) => h.userId !== user.id)
      .map((h) => ({
        id: h.id,
        date: h.date,
        hours: h.quantity,
        note: h.note,
        person: h.userName,
        project: { id: h.projectId, key: h.projectKey, name: h.projectName },
        task: h.taskNumber ? { key: `${h.projectKey}-${h.taskNumber}`, title: h.taskTitle } : null,
      })),
    loans: loans.map((r) => ({ id: r.id, amount: r.amount, currency: r.currency, reason: r.reason, person: r.requesterName, createdAt: r.createdAt })),
  });
}
