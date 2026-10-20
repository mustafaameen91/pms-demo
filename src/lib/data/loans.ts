import "server-only";
import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { db } from "@/lib/db";
import { loanRepayments, loanRequests, loans, member, resources, user } from "@/lib/db/schema";
import { loanBalance } from "@/lib/loans";

const decider = alias(user, "decider");

/** Loans of a workspace (or only one member's), with borrower and balance. Caller authorizes. */
export async function listLoans(workspaceId: string, { borrowerUserId }: { borrowerUserId?: string } = {}) {
  const rows = await db
    .select({
      id: loans.id,
      amount: loans.amount,
      currency: loans.currency,
      issuedOn: loans.issuedOn,
      reason: loans.reason,
      paidOffAt: loans.paidOffAt,
      borrowerUserId: loans.borrowerUserId,
      borrowerResourceId: loans.borrowerResourceId,
      userName: user.name,
      workerName: resources.name,
      workerRole: resources.role,
      paid: sql<string>`coalesce((select sum(${loanRepayments.amount}) from ${loanRepayments} where ${loanRepayments.loanId} = ${loans.id}), 0)`,
      lastPaidOn: sql<string | null>`(select max(${loanRepayments.paidOn}) from ${loanRepayments} where ${loanRepayments.loanId} = ${loans.id})`,
    })
    .from(loans)
    .leftJoin(user, eq(user.id, loans.borrowerUserId))
    .leftJoin(resources, eq(resources.id, loans.borrowerResourceId))
    .where(and(eq(loans.workspaceId, workspaceId), borrowerUserId ? eq(loans.borrowerUserId, borrowerUserId) : undefined))
    .orderBy(desc(loans.issuedOn), desc(loans.createdAt));
  return rows.map((r) => {
    const b = loanBalance(r.amount, [{ amount: r.paid }]);
    return {
      ...r,
      borrowerName: r.userName ?? r.workerName ?? "",
      borrowerKind: r.borrowerUserId ? ("member" as const) : ("worker" as const),
      ...b,
    };
  });
}
export type LoanRow = Awaited<ReturnType<typeof listLoans>>[number];

/** One loan with its repayment history (oldest first). */
export async function getLoan(workspaceId: string, loanId: string) {
  const [loan] = (await listLoans(workspaceId)).filter((l) => l.id === loanId);
  if (!loan) return null;
  const repayments = await db
    .select({
      id: loanRepayments.id,
      amount: loanRepayments.amount,
      paidOn: loanRepayments.paidOn,
      method: loanRepayments.method,
      note: loanRepayments.note,
      recordedBy: user.name,
    })
    .from(loanRepayments)
    .leftJoin(user, eq(user.id, loanRepayments.recordedById))
    .where(eq(loanRepayments.loanId, loanId))
    .orderBy(asc(loanRepayments.paidOn), asc(loanRepayments.createdAt));
  return { ...loan, repayments };
}

/** Loan requests (all, or one member's), newest first. */
export async function listLoanRequests(workspaceId: string, { userId, status }: { userId?: string; status?: "pending" } = {}) {
  return db
    .select({
      id: loanRequests.id,
      userId: loanRequests.userId,
      amount: loanRequests.amount,
      currency: loanRequests.currency,
      reason: loanRequests.reason,
      status: loanRequests.status,
      decisionNote: loanRequests.decisionNote,
      decidedAt: loanRequests.decidedAt,
      createdAt: loanRequests.createdAt,
      requesterName: user.name,
      deciderName: decider.name,
    })
    .from(loanRequests)
    .innerJoin(user, eq(user.id, loanRequests.userId))
    .leftJoin(decider, eq(decider.id, loanRequests.decidedById))
    .where(
      and(
        eq(loanRequests.workspaceId, workspaceId),
        userId ? eq(loanRequests.userId, userId) : undefined,
        status ? eq(loanRequests.status, status) : undefined,
      ),
    )
    .orderBy(desc(loanRequests.createdAt));
}

export async function pendingLoanRequestCount(workspaceId: string) {
  const [row] = await db
    .select({ n: sql<number>`count(*)`.mapWith(Number) })
    .from(loanRequests)
    .where(and(eq(loanRequests.workspaceId, workspaceId), eq(loanRequests.status, "pending")));
  return row?.n ?? 0;
}

/** Who can borrow: workspace members and active workers from the resource library. */
export async function listBorrowers(workspaceId: string) {
  const [people, workers] = await Promise.all([
    db
      .select({ id: user.id, name: user.name })
      .from(member)
      .innerJoin(user, eq(user.id, member.userId))
      .where(eq(member.organizationId, workspaceId))
      .orderBy(asc(user.name)),
    db
      .select({ id: resources.id, name: resources.name, role: resources.role })
      .from(resources)
      .where(and(eq(resources.workspaceId, workspaceId), inArray(resources.type, ["labor"]), sql`${resources.archivedAt} is null`))
      .orderBy(asc(resources.name)),
  ]);
  return { people, workers };
}
