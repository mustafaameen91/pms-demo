"use server";

import { refresh } from "next/cache";
import { and, asc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { requireWorkspaceById } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { activities, documents, projectResources, projects, resources, user } from "@/lib/db/schema";
import { canManageProject } from "@/lib/permissions";
import { getCompanyProfile } from "@/lib/data/company";
import { getCompanyType } from "@/lib/data/document-settings";
import { layoutDef } from "@/lib/documents/customize";
import { PAPER_STYLES } from "@/lib/branding";
import { DOC_TYPE_KEYS, docNumber, docType, type DocItem, type DocTypeDef, type Prefill } from "@/lib/documents/types";
import { todayISO } from "@/lib/accomplishment";
import { isISODate } from "@/lib/timesheets";
import { getT } from "@/i18n/server";

type Result<T = undefined> = { ok: true; data?: T } | { ok: false; error: string; fieldErrors?: Record<string, string> };

const MANAGERS_ONLY = "Only the project manager or admins can make documents.";

async function loadProject(projectId: string) {
  const [project] = await db.select().from(projects).where(eq(projects.id, projectId)).limit(1);
  if (!project) return null;
  const auth = await requireWorkspaceById(project.workspaceId);
  return canManageProject(auth.role, auth.user.id, project) ? { project, ...auth } : null;
}

async function loadDocument(id: string) {
  const [doc] = await db.select().from(documents).where(eq(documents.id, id)).limit(1);
  if (!doc) return null;
  const auth = await loadProject(doc.projectId);
  return auth ? { doc, ...auth, def: layoutDef(doc.type, doc.layout, docType)! } : null;
}

async function log(doc: { workspaceId: string; projectId: string; type: string; number: number; layout?: unknown }, actorId: string, type: string) {
  const def = layoutDef(doc.type, doc.layout, docType)!;
  await db.insert(activities).values({
    workspaceId: doc.workspaceId,
    projectId: doc.projectId,
    actorId,
    type,
    data: { number: docNumber(def.prefix, doc.number), kind_en: def.title.en, kind_ar: def.title.ar },
  });
}

/** Starting values for a new document, taken from its project. */
async function prefillFor(def: DocTypeDef, project: typeof projects.$inferSelect, lang: "en" | "ar") {
  let manager = "";
  if (project.leadId) [{ name: manager }] = await db.select({ name: user.name }).from(user).where(eq(user.id, project.leadId));
  const values: Record<Prefill, string> = {
    client: project.client ?? "",
    project: project.name,
    today: todayISO(),
    budget: project.budget ? String(Number(project.budget)) : "",
    projectStart: project.startDate ?? "",
    projectEnd: project.endDate ?? "",
    manager,
  };
  const data: Record<string, string> = {};
  for (const field of def.fields) {
    if (field.prefill && values[field.prefill]) data[field.key] = values[field.prefill];
    else if (field.defaultText) data[field.key] = field.defaultText[lang];
    else if (field.options) data[field.key] = field.options[0].value;
  }
  return data;
}

const createSchema = z.object({
  type: z.enum(DOC_TYPE_KEYS),
  language: z.enum(["ar", "en"]).optional(),
  style: z.enum(PAPER_STYLES.map((s) => s.value) as [string, ...string[]]).optional(),
  /** Purchase orders / goods notes: start with the project's planned materials. */
  withMaterials: z.boolean().optional(),
});

/** A new draft, numbered and pre-filled from the project. */
export async function createDocument(projectId: string, input: z.input<typeof createSchema>): Promise<Result<{ id: string }>> {
  const t = await getT();
  const auth = await loadProject(projectId);
  if (!auth) return { ok: false, error: t(MANAGERS_ONLY) };
  const parsed = createSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: t("Choose a document type") };
  const { project, user: me } = auth;
  // The company's own version of this form.
  const company = await getCompanyType(project.workspaceId, parsed.data.type);
  if (!company?.enabled) return { ok: false, error: t("This document type is turned off for your company.") };
  const { enabled: _enabled, ...def } = company;
  void _enabled;
  const profile = await getCompanyProfile(project.workspaceId);
  const language = parsed.data.language ?? profile.defaultLanguage;
  const style = parsed.data.style ?? profile.defaultStyle;
  const data = await prefillFor(def, project, language);

  let items: DocItem[] = [];
  if (def.items && parsed.data.withMaterials) {
    const rows = await db
      .select({ name: resources.name, unit: resources.unit, planned: projectResources.plannedQty, used: projectResources.usedQty, unitCost: projectResources.unitCost })
      .from(projectResources)
      .innerJoin(resources, eq(resources.id, projectResources.resourceId))
      .where(and(eq(projectResources.projectId, projectId), eq(resources.type, "material")))
      .orderBy(asc(resources.name));
    items = rows.map((r) => ({
      description: r.name,
      unit: r.unit,
      // What's still to come: planned minus already used.
      quantity: String(Math.max(0, Number(r.planned) - Number(r.used)) || Number(r.planned) || 1),
      unitPrice: def.items!.prices ? String(Number(r.unitCost)) : "0",
      ...(def.items!.condition ? { condition: "" } : {}),
    }));
  }

  const id = await db.transaction(async (tx) => {
    // One numbering sequence per company per type; serialise concurrent creates.
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`${project.workspaceId}:${def.key}`}))`);
    const [{ next }] = await tx
      .select({ next: sql<number>`coalesce(max(${documents.number}), 0) + 1`.mapWith(Number) })
      .from(documents)
      .where(and(eq(documents.workspaceId, project.workspaceId), eq(documents.type, def.key)));
    const [row] = await tx
      .insert(documents)
      .values({
        workspaceId: project.workspaceId,
        projectId,
        type: def.key,
        number: next,
        language,
        style,
        date: todayISO(),
        currency: project.currency,
        data,
        items,
        layout: def as unknown as Record<string, unknown>,
        createdById: me.id,
        updatedById: me.id,
      })
      .returning({ id: documents.id, number: documents.number });
    return row;
  });
  await log({ workspaceId: project.workspaceId, projectId, type: def.key, number: id.number, layout: def }, me.id, "document.created");
  refresh();
  return { ok: true, data: { id: id.id } };
}

const money = z.string().trim().refine((v) => v === "" || (/^\d+(\.\d{1,2})?$/.test(v) && Number(v) < 1e13), "Enter a valid amount");
const qty = z.string().trim().refine((v) => v === "" || (/^\d+(\.\d{1,3})?$/.test(v) && Number(v) < 1e9), "Enter a valid quantity");
const saveSchema = z.object({
  date: z.string().refine(isISODate, "Choose a date"),
  language: z.enum(["ar", "en"]),
  style: z.enum(PAPER_STYLES.map((s) => s.value) as [string, ...string[]]),
  data: z.record(z.string(), z.string().max(8000)),
  items: z
    .array(
      z.object({
        description: z.string().trim().max(500),
        unit: z.string().trim().max(40),
        quantity: qty,
        unitPrice: money,
        condition: z.string().trim().max(200).optional(),
      }),
    )
    .max(200, "At most 200 lines"),
  taxRate: z
    .string()
    .trim()
    .refine((v) => v === "" || (/^\d+(\.\d{1,2})?$/.test(v) && Number(v) <= 100), "Enter a tax rate from 0 to 100"),
});
export type DocumentInput = z.input<typeof saveSchema>;

/**
 * Save a draft. Once issued, only the paper style and language can change
 * (the content is what was sent out).
 */
export async function saveDocument(id: string, input: DocumentInput): Promise<Result> {
  const t = await getT();
  const auth = await loadDocument(id);
  if (!auth) return { ok: false, error: t(MANAGERS_ONLY) };
  const parsed = saveSchema.safeParse(input);
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) fieldErrors[issue.path.join(".")] ??= t(issue.message);
    return { ok: false, error: t(parsed.error.issues[0].message), fieldErrors };
  }
  const d = parsed.data;
  const { doc, def } = auth;
  if (doc.status !== "draft") {
    await db.update(documents).set({ language: d.language, style: d.style, updatedById: auth.user.id, updatedAt: new Date() }).where(eq(documents.id, id));
    refresh();
    return { ok: true };
  }
  // Keep only this type's fields; money fields must be numbers.
  const data: Record<string, string> = {};
  const fieldErrors: Record<string, string> = {};
  for (const field of def.fields) {
    const value = (d.data[field.key] ?? "").trim();
    if (field.kind === "money" && value && !money.safeParse(value).success) fieldErrors[`data.${field.key}`] = t("Enter a valid amount");
    if (field.kind === "date" && value && !isISODate(value)) fieldErrors[`data.${field.key}`] = t("Choose a date");
    if (field.options && value && !field.options.some((o) => o.value === value)) fieldErrors[`data.${field.key}`] = t("Choose an option");
    data[field.key] = value;
  }
  if (Object.keys(fieldErrors).length) return { ok: false, error: Object.values(fieldErrors)[0], fieldErrors };
  await db
    .update(documents)
    .set({
      date: d.date,
      language: d.language,
      style: d.style,
      data,
      items: def.items ? d.items.filter((i) => i.description || i.quantity || i.unitPrice) : [],
      taxRate: def.items?.prices && d.taxRate ? d.taxRate : null,
      updatedById: auth.user.id,
      updatedAt: new Date(),
    })
    .where(eq(documents.id, id));
  refresh();
  return { ok: true };
}

const NEXT: Record<string, string[]> = { draft: ["issued", "cancelled"], issued: ["signed", "cancelled"], signed: ["cancelled"], cancelled: [] };

/** draft → issued (all required fields filled) → signed; anything → cancelled. */
export async function setDocumentStatus(id: string, status: "issued" | "signed" | "cancelled"): Promise<Result> {
  const t = await getT();
  const auth = await loadDocument(id);
  if (!auth) return { ok: false, error: t(MANAGERS_ONLY) };
  const { doc, def } = auth;
  if (!NEXT[doc.status]?.includes(status)) return { ok: false, error: t("That change isn't possible from this status.") };
  if (status === "issued") {
    const lang = t.locale === "ar" ? "ar" : "en";
    const missing = def.fields.filter((f) => f.required && !(doc.data[f.key] ?? "").trim());
    if (missing.length) {
      return {
        ok: false,
        error: t("Fill in before issuing: {fields}", { fields: missing.map((f) => f.label[lang]).join(t(", ")) }),
        fieldErrors: Object.fromEntries(missing.map((f) => [`data.${f.key}`, t("Required")])),
      };
    }
    if (def.items && doc.items.length === 0) return { ok: false, error: t("Add at least one line before issuing.") };
  }
  await db
    .update(documents)
    .set({ status, ...(status === "issued" && { issuedAt: new Date() }), updatedById: auth.user.id, updatedAt: new Date() })
    .where(and(eq(documents.id, id), eq(documents.status, doc.status)));
  await log(doc, auth.user.id, `document.${status}`);
  refresh();
  return { ok: true };
}

/** Only drafts can be deleted; anything sent out is cancelled instead, so its number stays accounted for. */
export async function deleteDocument(id: string): Promise<Result> {
  const t = await getT();
  const auth = await loadDocument(id);
  if (!auth) return { ok: false, error: t(MANAGERS_ONLY) };
  if (auth.doc.status !== "draft") return { ok: false, error: t("Only drafts can be deleted. Cancel it instead.") };
  await db.delete(documents).where(eq(documents.id, id));
  await log(auth.doc, auth.user.id, "document.deleted");
  refresh();
  return { ok: true };
}
