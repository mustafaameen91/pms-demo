import "server-only";
import { desc, eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { member, organization, payments, projects, subscriptions, user } from "@/lib/db/schema";

/** Every workspace on the platform, for the admin panel. */
export async function listAllWorkspaces() {
  return db
    .select({
      id: organization.id,
      name: organization.name,
      slug: organization.slug,
      createdAt: organization.createdAt,
      status: subscriptions.status,
      paidUntil: subscriptions.paidUntil,
      owners: sql<string>`(
        select string_agg(u.email, ', ') from ${member} m join ${user} u on u.id = m.user_id
        where m.organization_id = "organization"."id" and m.role = 'owner'
      )`,
      members: sql<number>`(select count(*) from ${member} m where m.organization_id = "organization"."id")`.mapWith(Number),
      projectCount: sql<number>`(select count(*) from ${projects} p where p.workspace_id = "organization"."id")`.mapWith(Number),
      lastPayment: sql<string | null>`(select max(created_at)::date::text from ${payments} pa where pa.workspace_id = "organization"."id")`,
    })
    .from(organization)
    .leftJoin(subscriptions, eq(subscriptions.workspaceId, organization.id))
    .orderBy(desc(organization.createdAt));
}

export type AdminWorkspace = Awaited<ReturnType<typeof listAllWorkspaces>>[number];

export async function recentPayments(limit = 20) {
  return db
    .select({
      id: payments.id,
      workspaceName: organization.name,
      amount: payments.amount,
      currency: payments.currency,
      method: payments.method,
      reference: payments.reference,
      coversUntil: payments.coversUntil,
      createdAt: payments.createdAt,
      recordedBy: user.name,
    })
    .from(payments)
    .innerJoin(organization, eq(organization.id, payments.workspaceId))
    .leftJoin(user, eq(user.id, payments.recordedById))
    .orderBy(desc(payments.createdAt))
    .limit(limit);
}
