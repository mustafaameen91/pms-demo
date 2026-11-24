import "server-only";
import { and, asc, desc, eq, isNotNull, isNull, like, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { activities, departments, employeeDocuments, employees, member, resources, user } from "@/lib/db/schema";

export type Employee = typeof employees.$inferSelect;
export type EmployeeDocument = typeof employeeDocuments.$inferSelect;
export type Department = typeof departments.$inferSelect;

export async function listDepartments(workspaceId: string) {
  return db.select().from(departments).where(eq(departments.workspaceId, workspaceId)).orderBy(asc(departments.name));
}

/** Everyone, including people who left (the page filters). */
export async function listEmployees(workspaceId: string) {
  return db.select().from(employees).where(eq(employees.workspaceId, workspaceId)).orderBy(asc(employees.name));
}

export async function getEmployee(workspaceId: string, id: string) {
  const [row] = await db
    .select()
    .from(employees)
    .where(and(eq(employees.workspaceId, workspaceId), eq(employees.id, id)))
    .limit(1);
  return row ?? null;
}

export async function listEmployeeDocuments(workspaceId: string, employeeId?: string) {
  return db
    .select()
    .from(employeeDocuments)
    .where(and(eq(employeeDocuments.workspaceId, workspaceId), employeeId ? eq(employeeDocuments.employeeId, employeeId) : undefined))
    .orderBy(asc(employeeDocuments.expiryDate));
}

/** Only dates, for the "needs attention" list. */
export async function listDocumentExpiries(workspaceId: string) {
  return db
    .select({ employeeId: employeeDocuments.employeeId, type: employeeDocuments.type, expiryDate: employeeDocuments.expiryDate })
    .from(employeeDocuments)
    .where(and(eq(employeeDocuments.workspaceId, workspaceId), isNotNull(employeeDocuments.expiryDate)));
}

/** Members and workers who don't have an HR file yet (to add them in one go). */
export async function listImportCandidates(workspaceId: string) {
  const [members, workers] = await Promise.all([
    db
      .select({ id: user.id, name: user.name, email: user.email, linked: employees.id })
      .from(member)
      .innerJoin(user, eq(user.id, member.userId))
      .leftJoin(employees, and(eq(employees.workspaceId, workspaceId), eq(employees.userId, user.id)))
      .where(eq(member.organizationId, workspaceId))
      .orderBy(asc(user.name)),
    db
      .select({
        id: resources.id,
        name: resources.name,
        role: resources.role,
        phone: resources.phone,
        unit: resources.unit,
        unitCost: resources.unitCost,
        currency: resources.currency,
        linked: employees.id,
      })
      .from(resources)
      .leftJoin(employees, and(eq(employees.workspaceId, workspaceId), eq(employees.resourceId, resources.id)))
      .where(and(eq(resources.workspaceId, workspaceId), eq(resources.type, "labor"), isNull(resources.archivedAt)))
      .orderBy(asc(resources.name)),
  ]);
  return {
    members: members.filter((m) => !m.linked).map((m) => ({ id: m.id, name: m.name, email: m.email })),
    workers: workers
      .filter((w) => !w.linked)
      .map((w) => ({ id: w.id, name: w.name, role: w.role, phone: w.phone, unit: w.unit, unitCost: w.unitCost, currency: w.currency })),
  };
}

/** Members and workers an employee can be linked to (free ones, plus its own). */
export async function listLinkChoices(workspaceId: string, employeeId?: string) {
  const [members, workers, taken] = await Promise.all([
    db
      .select({ id: user.id, name: user.name, email: user.email })
      .from(member)
      .innerJoin(user, eq(user.id, member.userId))
      .where(eq(member.organizationId, workspaceId))
      .orderBy(asc(user.name)),
    db
      .select({ id: resources.id, name: resources.name, role: resources.role })
      .from(resources)
      .where(and(eq(resources.workspaceId, workspaceId), eq(resources.type, "labor"), isNull(resources.archivedAt)))
      .orderBy(asc(resources.name)),
    db.select({ id: employees.id, userId: employees.userId, resourceId: employees.resourceId }).from(employees).where(eq(employees.workspaceId, workspaceId)),
  ]);
  const others = taken.filter((e) => e.id !== employeeId);
  const usedUsers = new Set(others.map((e) => e.userId));
  const usedWorkers = new Set(others.map((e) => e.resourceId));
  return { members: members.filter((m) => !usedUsers.has(m.id)), workers: workers.filter((w) => !usedWorkers.has(w.id)) };
}

/** What was changed on one person's file, newest first. */
export async function listEmployeeHistory(workspaceId: string, code: string, limit = 20) {
  return db
    .select({ id: activities.id, type: activities.type, data: activities.data, at: activities.createdAt, actor: user.name })
    .from(activities)
    .leftJoin(user, eq(user.id, activities.actorId))
    .where(and(eq(activities.workspaceId, workspaceId), like(activities.type, "employee.%"), sql`${activities.data}->>'code' = ${code}`))
    .orderBy(desc(activities.createdAt))
    .limit(limit);
}
