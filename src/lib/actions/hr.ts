"use server";

import { refresh } from "next/cache";
import { and, eq, inArray, max, ne, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import { activities, departments, employeeDocuments, employees, member, resources, shifts, user } from "@/lib/db/schema";
import { ADMINS_ONLY, hrAdmin, hrEmployee, invalid, type Result } from "@/lib/hr-auth";
import { isHexColor } from "@/lib/branding";
import { deleteStoredFile, saveImage, saveReceipt } from "@/lib/uploads";
import { EMPLOYEE_DOC_TYPES, EMPLOYMENT_TYPES, GENDERS, MARITAL_STATUSES, PAY_BASES, employeeCode, wouldCreateLoop } from "@/lib/hr";
import { todayISO } from "@/lib/accomplishment";
import { LEAVING_REASONS } from "@/lib/hr-rules";
import { getT } from "@/i18n/server";

const enumOf = <L extends readonly { value: string }[]>(list: L) => z.enum(list.map((o) => o.value) as [L[number]["value"], ...L[number]["value"][]]);
const text = (max: number) => z.string().trim().max(max).optional().nullable().transform((v) => v || null);
const day = z
  .string()
  .optional()
  .nullable()
  .transform((v) => v || null)
  .refine((v) => v === null || /^\d{4}-\d{2}-\d{2}$/.test(v), "Enter a valid date");
const money = z
  .string()
  .trim()
  .optional()
  .nullable()
  .transform((v) => (v ? v.replace(/,/g, "") : null))
  .refine((v) => v === null || (/^\d{1,12}(\.\d{1,2})?$/.test(v) && Number(v) >= 0), "Enter an amount like 1500 or 1500.50");
const optionalEnum = <L extends readonly { value: string }[]>(list: L) =>
  z
    .string()
    .optional()
    .nullable()
    .transform((v) => v || null)
    .refine((v) => v === null || list.some((o) => o.value === v), "Choose one of the options");

const employeeSchema = z
  .object({
    name: z.string().trim().min(2, "Enter the person's name").max(120),
    nameAlt: text(120),
    jobTitle: text(120),
    departmentId: text(64),
    managerId: text(64),
    employmentType: enumOf(EMPLOYMENT_TYPES),
    workLocation: text(160),
    hireDate: day,
    probationEndDate: day,
    contractEndDate: day,
    birthDate: day,
    gender: optionalEnum(GENDERS),
    nationality: text(80),
    nationalId: text(80),
    maritalStatus: optionalEnum(MARITAL_STATUSES),
    phone: text(60),
    email: text(160).refine((v) => v === null || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v), "Enter a valid email address"),
    address: text(300),
    emergencyName: text(120),
    emergencyPhone: text(60),
    payBasis: enumOf(PAY_BASES),
    basicPay: money,
    allowances: z
      .array(z.object({ name: z.string().trim().max(80), amount: money }))
      .max(20)
      .default([])
      .transform((list) => list.filter((a) => a.name && a.amount).map((a) => ({ name: a.name, amount: a.amount! }))),
    currency: z.string().trim().toUpperCase().regex(/^[A-Z]{3}$/, "Use a 3-letter currency code, e.g. USD"),
    bankName: text(120),
    bankAccount: text(80),
    notes: text(2000),
    userId: text(64),
    resourceId: text(64),
    shiftId: text(64),
  })
  .superRefine((v, ctx) => {
    if (v.hireDate && v.probationEndDate && v.probationEndDate < v.hireDate)
      ctx.addIssue({ code: "custom", path: ["probationEndDate"], message: "Probation can't end before the hire date" });
    if (v.hireDate && v.contractEndDate && v.contractEndDate < v.hireDate)
      ctx.addIssue({ code: "custom", path: ["contractEndDate"], message: "The contract can't end before the hire date" });
    if (v.birthDate && v.birthDate > todayISO()) ctx.addIssue({ code: "custom", path: ["birthDate"], message: "The date of birth can't be in the future" });
  });
export type EmployeeInput = z.input<typeof employeeSchema>;

/** Links, department and manager must belong to this company; no manager loops. */
async function checkReferences(workspaceId: string, d: z.output<typeof employeeSchema>, employeeId: string | null, t: (s: string) => string) {
  const errors: Record<string, string> = {};
  if (d.departmentId) {
    const [dep] = await db.select({ id: departments.id }).from(departments).where(and(eq(departments.id, d.departmentId), eq(departments.workspaceId, workspaceId)));
    if (!dep) errors.departmentId = t("Choose one of the options");
  }
  if (d.managerId) {
    const all = await db.select({ id: employees.id, managerId: employees.managerId }).from(employees).where(eq(employees.workspaceId, workspaceId));
    if (!all.some((e) => e.id === d.managerId)) errors.managerId = t("Choose one of the options");
    else if (employeeId && wouldCreateLoop(all, employeeId, d.managerId)) errors.managerId = t("That person reports to this one, so they can't be their manager.");
  }
  if (d.shiftId) {
    const [sh] = await db.select({ id: shifts.id }).from(shifts).where(and(eq(shifts.id, d.shiftId), eq(shifts.workspaceId, workspaceId)));
    if (!sh) errors.shiftId = t("Choose one of the options");
  }
  if (d.userId) {
    const [m] = await db.select({ id: member.id }).from(member).where(and(eq(member.organizationId, workspaceId), eq(member.userId, d.userId)));
    const [used] = await db
      .select({ id: employees.id })
      .from(employees)
      .where(and(eq(employees.workspaceId, workspaceId), eq(employees.userId, d.userId), employeeId ? ne(employees.id, employeeId) : undefined));
    if (!m) errors.userId = t("Choose one of the options");
    else if (used) errors.userId = t("This member already has an HR file.");
  }
  if (d.resourceId) {
    const [w] = await db
      .select({ id: resources.id })
      .from(resources)
      .where(and(eq(resources.id, d.resourceId), eq(resources.workspaceId, workspaceId), eq(resources.type, "labor")));
    const [used] = await db
      .select({ id: employees.id })
      .from(employees)
      .where(and(eq(employees.workspaceId, workspaceId), eq(employees.resourceId, d.resourceId), employeeId ? ne(employees.id, employeeId) : undefined));
    if (!w) errors.resourceId = t("Choose one of the options");
    else if (used) errors.resourceId = t("This worker already has an HR file.");
  }
  const first = Object.values(errors)[0];
  return first ? ({ ok: false, error: first, fieldErrors: errors } as const) : null;
}

/** Next EMP number, inside the transaction that uses it. Unique index catches a race. */
async function nextNumber(tx: Pick<typeof db, "select">, workspaceId: string) {
  const [row] = await tx.select({ n: max(employees.number) }).from(employees).where(eq(employees.workspaceId, workspaceId));
  return (row?.n ?? 0) + 1;
}

export async function createEmployee(slug: string, input: EmployeeInput): Promise<Result<{ id: string }>> {
  const t = await getT();
  const auth = await hrAdmin(slug);
  if (!auth) return { ok: false, error: t(ADMINS_ONLY) };
  const parsed = employeeSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error, t);
  const bad = await checkReferences(auth.workspace.id, parsed.data, null, t);
  if (bad) return bad;
  const row = await db.transaction(async (tx) => {
    const number = await nextNumber(tx, auth.workspace.id);
    const [r] = await tx
      .insert(employees)
      .values({ ...parsed.data, number, workspaceId: auth.workspace.id, createdById: auth.user.id })
      .returning({ id: employees.id });
    await tx.insert(activities).values({
      workspaceId: auth.workspace.id,
      actorId: auth.user.id,
      type: "employee.created",
      data: { name: parsed.data.name, code: employeeCode(number) },
    });
    return r;
  });
  refresh();
  return { ok: true, data: { id: row.id } };
}

const FIELD_NAMES: Record<keyof z.output<typeof employeeSchema>, string> = {
  name: "name",
  nameAlt: "name",
  jobTitle: "job title",
  departmentId: "department",
  managerId: "manager",
  employmentType: "employment type",
  workLocation: "work location",
  hireDate: "dates",
  probationEndDate: "dates",
  contractEndDate: "dates",
  birthDate: "personal details",
  gender: "personal details",
  nationality: "personal details",
  nationalId: "personal details",
  maritalStatus: "personal details",
  phone: "contact details",
  email: "contact details",
  address: "contact details",
  emergencyName: "emergency contact",
  emergencyPhone: "emergency contact",
  payBasis: "pay",
  basicPay: "pay",
  allowances: "allowances",
  currency: "pay",
  bankName: "bank details",
  bankAccount: "bank details",
  notes: "notes",
  userId: "links",
  resourceId: "links",
  shiftId: "shift",
};

export async function updateEmployee(id: string, input: EmployeeInput): Promise<Result> {
  const t = await getT();
  const auth = await hrEmployee(id);
  if (!auth) return { ok: false, error: t(ADMINS_ONLY) };
  const parsed = employeeSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error, t);
  const bad = await checkReferences(auth.employee.workspaceId, parsed.data, id, t);
  if (bad) return bad;
  const before = auth.employee as Record<string, unknown>;
  const changed = [
    ...new Set(
      (Object.keys(parsed.data) as (keyof typeof parsed.data)[])
        .filter((k) => JSON.stringify(before[k] ?? null) !== JSON.stringify(parsed.data[k] ?? null))
        .map((k) => FIELD_NAMES[k]),
    ),
  ];
  await db.update(employees).set({ ...parsed.data, updatedAt: new Date() }).where(eq(employees.id, id));
  if (changed.length)
    await db.insert(activities).values({
      workspaceId: auth.employee.workspaceId,
      actorId: auth.user.id,
      type: "employee.updated",
      data: { name: parsed.data.name, code: employeeCode(auth.employee.number), fields: changed },
    });
  refresh();
  return { ok: true };
}

/** A new photo, or `remove` to clear it. */
export async function setEmployeePhoto(id: string, formData: FormData): Promise<Result> {
  const t = await getT();
  const auth = await hrEmployee(id);
  if (!auth) return { ok: false, error: t(ADMINS_ONLY) };
  const file = formData.get("photo");
  let next: { photoPath: string | null; photoType: string | null } = { photoPath: null, photoType: null };
  if (file instanceof File && file.size > 0) {
    const saved = await saveImage(auth.employee.workspaceId, file, t);
    if ("error" in saved) return { ok: false, error: saved.error };
    next = { photoPath: saved.path, photoType: saved.type };
  } else if (formData.get("remove") !== "1") {
    return { ok: false, error: t("Choose a photo.") };
  }
  await db.update(employees).set(next).where(eq(employees.id, id));
  await deleteStoredFile(auth.employee.photoPath);
  refresh();
  return { ok: true };
}

/** Marks someone as having left (kept in HR), or brings them back (`endDate` null). */
export async function setEmployeeLeft(id: string, endDate: string | null, reason: string | null, note?: string | null): Promise<Result> {
  const t = await getT();
  const auth = await hrEmployee(id);
  if (!auth) return { ok: false, error: t(ADMINS_ONLY) };
  if (endDate !== null && !/^\d{4}-\d{2}-\d{2}$/.test(endDate)) return { ok: false, error: t("Enter a valid date"), fieldErrors: { endDate: t("Enter a valid date") } };
  if (endDate && auth.employee.hireDate && endDate < auth.employee.hireDate) {
    const msg = t("The last day can't be before the hire date.");
    return { ok: false, error: msg, fieldErrors: { endDate: msg } };
  }
  if (reason !== null && !LEAVING_REASONS.some((r) => r.value === reason)) return { ok: false, error: t("Choose one of the options") };
  await db.transaction(async (tx) => {
    await tx
      .update(employees)
      .set({ endDate, endReason: endDate ? reason : null, endNote: endDate ? note?.trim().slice(0, 500) || null : null, ...(endDate ? {} : { offboarding: {} }) })
      .where(eq(employees.id, id));
    // People who reported to someone who left now report to that person's manager.
    if (endDate && endDate <= todayISO())
      await tx.update(employees).set({ managerId: auth.employee.managerId }).where(eq(employees.managerId, id));
    await tx.insert(activities).values({
      workspaceId: auth.employee.workspaceId,
      actorId: auth.user.id,
      type: endDate ? "employee.left" : "employee.rehired",
      data: { name: auth.employee.name, code: employeeCode(auth.employee.number), date: endDate },
    });
  });
  refresh();
  return { ok: true };
}

/** Only for a file made by mistake: everything about the person is removed. */
export async function deleteEmployee(id: string): Promise<Result> {
  const t = await getT();
  const auth = await hrEmployee(id);
  if (!auth) return { ok: false, error: t(ADMINS_ONLY) };
  const docs = await db.select({ path: employeeDocuments.filePath }).from(employeeDocuments).where(eq(employeeDocuments.employeeId, id));
  await db.transaction(async (tx) => {
    await tx.update(employees).set({ managerId: auth.employee.managerId }).where(eq(employees.managerId, id));
    await tx.delete(employees).where(eq(employees.id, id));
    await tx.insert(activities).values({
      workspaceId: auth.employee.workspaceId,
      actorId: auth.user.id,
      type: "employee.deleted",
      data: { name: auth.employee.name, code: employeeCode(auth.employee.number) },
    });
  });
  for (const d of docs) await deleteStoredFile(d.path);
  await deleteStoredFile(auth.employee.photoPath);
  refresh();
  return { ok: true };
}

/**
 * Makes HR files for members and workers in one go, filled in from what the app
 * already knows (name, email, trade, phone, daily rate).
 */
export async function importPeople(slug: string, input: { userIds: string[]; resourceIds: string[] }): Promise<Result<{ count: number }>> {
  const t = await getT();
  const auth = await hrAdmin(slug);
  if (!auth) return { ok: false, error: t(ADMINS_ONLY) };
  const ws = auth.workspace.id;
  const userIds = [...new Set(input.userIds)].slice(0, 500);
  const resourceIds = [...new Set(input.resourceIds)].slice(0, 500);
  const [people, workers, existing] = await Promise.all([
    userIds.length
      ? db
          .select({ id: user.id, name: user.name, email: user.email })
          .from(member)
          .innerJoin(user, eq(user.id, member.userId))
          .where(and(eq(member.organizationId, ws), inArray(member.userId, userIds)))
      : [],
    resourceIds.length
      ? db
          .select()
          .from(resources)
          .where(and(eq(resources.workspaceId, ws), eq(resources.type, "labor"), inArray(resources.id, resourceIds)))
      : [],
    db.select({ userId: employees.userId, resourceId: employees.resourceId }).from(employees).where(eq(employees.workspaceId, ws)),
  ]);
  const hasUser = new Set(existing.map((e) => e.userId));
  const hasWorker = new Set(existing.map((e) => e.resourceId));
  const basis = (unit: string) => (/hour|ساعة/i.test(unit) ? "hourly" : /day|يوم/i.test(unit) ? "daily" : "monthly");
  const rows = [
    ...people
      .filter((p) => !hasUser.has(p.id))
      .map((p) => ({ name: p.name, email: p.email, userId: p.id, currency: "USD" })),
    ...workers
      .filter((w) => !hasWorker.has(w.id))
      .map((w) => ({
        name: w.name,
        resourceId: w.id,
        jobTitle: w.role,
        phone: w.phone,
        payBasis: basis(w.unit),
        employmentType: basis(w.unit) === "monthly" ? "full_time" : "daily",
        basicPay: w.unitCost,
        currency: w.currency,
      })),
  ];
  if (rows.length === 0) return { ok: true, data: { count: 0 } };
  await db.transaction(async (tx) => {
    const first = await nextNumber(tx, ws);
    await tx.insert(employees).values(rows.map((r, i) => ({ ...r, number: first + i, workspaceId: ws, createdById: auth.user.id })));
    await tx.insert(activities).values({ workspaceId: ws, actorId: auth.user.id, type: "employee.imported", data: { count: rows.length } });
  });
  refresh();
  return { ok: true, data: { count: rows.length } };
}

// --- Departments ---

const departmentSchema = z.object({
  name: z.string().trim().min(2, "Give the department a name").max(80),
  color: z.string().refine(isHexColor, "Choose a colour"),
});

export async function saveDepartment(slug: string, id: string | null, input: z.input<typeof departmentSchema>): Promise<Result<{ id: string }>> {
  const t = await getT();
  const auth = await hrAdmin(slug);
  if (!auth) return { ok: false, error: t(ADMINS_ONLY) };
  const parsed = departmentSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error, t);
  const [clash] = await db
    .select({ id: departments.id })
    .from(departments)
    .where(and(eq(departments.workspaceId, auth.workspace.id), sql`lower(${departments.name}) = lower(${parsed.data.name})`, id ? ne(departments.id, id) : undefined));
  if (clash) {
    const msg = t("There's already a department with this name.");
    return { ok: false, error: msg, fieldErrors: { name: msg } };
  }
  if (id) {
    const [row] = await db
      .update(departments)
      .set(parsed.data)
      .where(and(eq(departments.id, id), eq(departments.workspaceId, auth.workspace.id)))
      .returning({ id: departments.id });
    if (!row) return { ok: false, error: t("Not found") };
    refresh();
    return { ok: true, data: row };
  }
  const [row] = await db.insert(departments).values({ ...parsed.data, workspaceId: auth.workspace.id }).returning({ id: departments.id });
  await db.insert(activities).values({ workspaceId: auth.workspace.id, actorId: auth.user.id, type: "department.created", data: { name: parsed.data.name } });
  refresh();
  return { ok: true, data: row };
}

/** Its people stay; they just have no department. */
export async function deleteDepartment(slug: string, id: string): Promise<Result> {
  const t = await getT();
  const auth = await hrAdmin(slug);
  if (!auth) return { ok: false, error: t(ADMINS_ONLY) };
  const [row] = await db
    .delete(departments)
    .where(and(eq(departments.id, id), eq(departments.workspaceId, auth.workspace.id)))
    .returning({ name: departments.name });
  if (row) await db.insert(activities).values({ workspaceId: auth.workspace.id, actorId: auth.user.id, type: "department.deleted", data: { name: row.name } });
  refresh();
  return { ok: true };
}

// --- Documents ---

const docSchema = z
  .object({
    type: enumOf(EMPLOYEE_DOC_TYPES),
    title: text(120),
    docNumber: text(80),
    issueDate: day,
    expiryDate: day,
    note: text(500),
  })
  .refine((v) => !v.issueDate || !v.expiryDate || v.expiryDate >= v.issueDate, { path: ["expiryDate"], message: "It can't expire before it was issued" });

/** Adds (no `docId`) or edits a document; an attached file replaces the old one. */
export async function saveEmployeeDocument(employeeId: string, formData: FormData): Promise<Result> {
  const t = await getT();
  const auth = await hrEmployee(employeeId);
  if (!auth) return { ok: false, error: t(ADMINS_ONLY) };
  const docId = String(formData.get("docId") ?? "") || null;
  const parsed = docSchema.safeParse(Object.fromEntries(["type", "title", "docNumber", "issueDate", "expiryDate", "note"].map((k) => [k, formData.get(k)])));
  if (!parsed.success) return invalid(parsed.error, t);

  let existing: typeof employeeDocuments.$inferSelect | undefined;
  if (docId) {
    [existing] = await db.select().from(employeeDocuments).where(and(eq(employeeDocuments.id, docId), eq(employeeDocuments.employeeId, employeeId)));
    if (!existing) return { ok: false, error: t("Not found") };
  }
  const file = formData.get("file");
  let upload: { filePath: string; fileName: string; fileType: string } | null = null;
  if (file instanceof File && file.size > 0) {
    const saved = await saveReceipt(auth.employee.workspaceId, file, t);
    if ("error" in saved) return { ok: false, error: saved.error, fieldErrors: { file: saved.error } };
    upload = { filePath: saved.path, fileName: saved.name, fileType: saved.type };
  }
  const removeFile = formData.get("removeFile") === "1";
  const values = { ...parsed.data, ...(upload ?? (removeFile ? { filePath: null, fileName: null, fileType: null } : {})) };
  if (existing) await db.update(employeeDocuments).set(values).where(eq(employeeDocuments.id, existing.id));
  else
    await db.insert(employeeDocuments).values({ ...values, employeeId, workspaceId: auth.employee.workspaceId, createdById: auth.user.id });
  if (existing && (upload || removeFile)) await deleteStoredFile(existing.filePath);
  await db.insert(activities).values({
    workspaceId: auth.employee.workspaceId,
    actorId: auth.user.id,
    type: existing ? "employee.document_updated" : "employee.document_added",
    data: { name: auth.employee.name, code: employeeCode(auth.employee.number), docType: parsed.data.type },
  });
  refresh();
  return { ok: true };
}

export async function deleteEmployeeDocument(docId: string): Promise<Result> {
  const t = await getT();
  const [doc] = await db.select().from(employeeDocuments).where(eq(employeeDocuments.id, docId));
  if (!doc) return { ok: false, error: t("Not found") };
  const auth = await hrEmployee(doc.employeeId);
  if (!auth) return { ok: false, error: t(ADMINS_ONLY) };
  await db.delete(employeeDocuments).where(eq(employeeDocuments.id, docId));
  await deleteStoredFile(doc.filePath);
  await db.insert(activities).values({
    workspaceId: doc.workspaceId,
    actorId: auth.user.id,
    type: "employee.document_deleted",
    data: { name: auth.employee.name, code: employeeCode(auth.employee.number), docType: doc.type },
  });
  refresh();
  return { ok: true };
}
