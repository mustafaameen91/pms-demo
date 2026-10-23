import { json, requireMobileWorkspace } from "@/lib/mobile/api";
import { listLoanRequests, listLoans } from "@/lib/data/loans";
import { CURRENCIES } from "@/lib/constants";

/** GET → my loans and cash advances (with what's left), and my loan requests. */
export async function GET(request: Request, ctx: RouteContext<"/api/mobile/v1/w/[slug]/loans">) {
  const authed = await requireMobileWorkspace(request, (await ctx.params).slug);
  if (authed instanceof Response) return authed;
  const { user, workspace } = authed;
  const [loans, requests] = await Promise.all([
    listLoans(workspace.id, { borrowerUserId: user.id }),
    listLoanRequests(workspace.id, { userId: user.id }),
  ]);
  return json({
    currencies: CURRENCIES,
    loans: loans.map((l) => ({
      id: l.id,
      amount: l.amount,
      currency: l.currency,
      issuedOn: l.issuedOn,
      reason: l.reason,
      project: l.projectId ? { id: l.projectId, key: l.projectKey, name: l.projectName } : null,
      returned: l.returned,
      spent: l.spent,
      pending: l.pending,
      balance: l.balance,
      paidPct: l.paidPct,
      paidOff: l.paidOff,
    })),
    requests: requests.map((r) => ({
      id: r.id,
      amount: r.amount,
      currency: r.currency,
      reason: r.reason,
      status: r.status,
      decisionNote: r.decisionNote,
      decidedBy: r.deciderName,
      createdAt: r.createdAt,
    })),
  });
}
