import "server-only";
import { cache } from "react";
import { and, eq, gte, isNotNull, isNull, lte, or, gt } from "drizzle-orm";
import { db } from "@/lib/db";
import { employeeDocuments, employees, member, notifications, organization, user } from "@/lib/db/schema";
import { EMPLOYEE_DOC_TYPES, EXPIRY_WARNING_DAYS, labelOf } from "@/lib/hr";
import { todayISO } from "@/lib/accomplishment";
import { formatDate } from "@/lib/utils";
import { tFor } from "@/i18n/server";

const addDays = (iso: string, days: number) => {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
};

/** Documents of people still working here that expired or expire within the warning window. */
async function expiringDocuments(workspaceId: string, today: string) {
  return db
    .select({
      id: employeeDocuments.id,
      type: employeeDocuments.type,
      title: employeeDocuments.title,
      expiryDate: employeeDocuments.expiryDate,
      employeeId: employees.id,
      name: employees.name,
    })
    .from(employeeDocuments)
    .innerJoin(employees, eq(employees.id, employeeDocuments.employeeId))
    .where(
      and(
        eq(employeeDocuments.workspaceId, workspaceId),
        isNotNull(employeeDocuments.expiryDate),
        lte(employeeDocuments.expiryDate, addDays(today, EXPIRY_WARNING_DAYS)),
        // Expired a long time ago and still on file: shown on the HR page, not re-notified forever.
        gte(employeeDocuments.expiryDate, addDays(today, -90)),
        or(isNull(employees.endDate), gt(employees.endDate, today)),
      ),
    );
}

/** For the sidebar badge (owners/admins). */
export const hrAlertCount = cache(async (workspaceId: string) => (await expiringDocuments(workspaceId, todayISO())).length);

/**
 * One inbox reminder per document per expiry date for this owner/admin, when
 * the app is opened (there's no background scheduler, like late tasks).
 */
export async function syncHrExpiryNotifications(userId: string, workspaceId: string, today = todayISO()) {
  const soon = addDays(today, EXPIRY_WARNING_DAYS);
  const [docs, ending] = await Promise.all([
    expiringDocuments(workspaceId, today),
    db
      .select({ id: employees.id, name: employees.name, probation: employees.probationEndDate, contract: employees.contractEndDate })
      .from(employees)
      .where(
        and(
          eq(employees.workspaceId, workspaceId),
          or(isNull(employees.endDate), gt(employees.endDate, today)),
          or(and(gte(employees.probationEndDate, today), lte(employees.probationEndDate, soon)), and(gte(employees.contractEndDate, today), lte(employees.contractEndDate, soon))),
        ),
      ),
  ]);
  if (docs.length === 0 && ending.length === 0) return;
  const [me] = await db
    .select({ locale: user.locale, slug: organization.slug, role: member.role })
    .from(member)
    .innerJoin(user, eq(user.id, member.userId))
    .innerJoin(organization, eq(organization.id, member.organizationId))
    .where(and(eq(member.userId, userId), eq(member.organizationId, workspaceId)));
  if (!me || (me.role !== "owner" && me.role !== "admin")) return;
  const tr = tFor(me.locale);
  const dates = ending.flatMap((e) => [
    ...(e.probation && e.probation >= today && e.probation <= soon
      ? [{ kind: "probation", e, date: e.probation, title: tr("{name}'s probation ends on {date}", { name: e.name, date: formatDate(e.probation, tr.intl) }) }]
      : []),
    ...(e.contract && e.contract >= today && e.contract <= soon
      ? [{ kind: "contract", e, date: e.contract, title: tr("{name}'s contract ends on {date}", { name: e.name, date: formatDate(e.contract, tr.intl) }) }]
      : []),
  ]);
  if (dates.length)
    await db
      .insert(notifications)
      .values(
        dates.map((d) => ({
          workspaceId,
          userId,
          type: "hr.expiry",
          title: d.title,
          body: d.kind === "probation" ? tr("Decide whether to confirm them.") : tr("Renew the contract or record their last day."),
          link: `/w/${me.slug}/hr/${d.e.id}`,
          dedupeKey: `hr-${d.kind}:${d.e.id}:${d.date}`,
        })),
      )
      .onConflictDoNothing();
  if (docs.length === 0) return;
  await db
    .insert(notifications)
    .values(
      docs.map((d) => {
        const doc = d.title || tr(labelOf(EMPLOYEE_DOC_TYPES, d.type));
        const expired = d.expiryDate! < today;
        return {
          workspaceId,
          userId,
          type: "hr.expiry",
          title: expired ? tr("{name}'s {doc} has expired", { name: d.name, doc }) : tr("{name}'s {doc} expires soon", { name: d.name, doc }),
          body: tr("Expiry date: {date}.", { date: formatDate(d.expiryDate, tr.intl) }),
          link: `/w/${me.slug}/hr/${d.employeeId}?tab=documents`,
          dedupeKey: `hr-expiry:${d.id}:${d.expiryDate}`,
        };
      }),
    )
    .onConflictDoNothing();
}
