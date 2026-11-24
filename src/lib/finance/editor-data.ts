import "server-only";
import { and, eq, isNull, ne } from "drizzle-orm";
import { db } from "@/lib/db";
import { bills, documents, projects } from "@/lib/db/schema";
import { docNumber } from "@/lib/documents/types";
import { listAccounts, listContacts } from "./ledger";
import { projectBilling } from "@/lib/data/finance";
import { getCompanyType } from "@/lib/data/document-settings";
import { getCompanyProfile } from "@/lib/data/company";
import type { WorkspaceRole } from "@/lib/auth/session";

/** What the invoice editor needs: customers, projects (with progress), and defaults. */
export async function invoiceEditorData(workspace: { id: string; role: WorkspaceRole }, userId: string) {
  const [contacts, projects, def, profile] = await Promise.all([listContacts(workspace.id), projectBilling(workspace, userId), getCompanyType(workspace.id, "invoice"), getCompanyProfile(workspace.id)]);
  return {
    contacts: contacts.filter((c) => !c.archivedAt && c.kind !== "supplier").map((c) => ({ id: c.id, name: c.name, kind: c.kind, currency: c.currency })),
    projects,
    // The company's own default wording for the invoice's payment details field.
    paymentDetails: (def?.fields.find((f) => f.key === "paymentDetails")?.defaultText?.[profile.defaultLanguage === "en" ? "en" : "ar"]) ?? "",
    language: (profile.defaultLanguage === "en" ? "en" : "ar") as "ar" | "en",
    style: (["classic", "modern", "minimal"].includes(profile.defaultStyle) ? profile.defaultStyle : "classic") as "classic" | "modern" | "minimal",
  };
}

export async function moneyAccounts(workspaceId: string, base: string) {
  return (await listAccounts(workspaceId)).filter((a) => a.moneyKind && !a.archivedAt).map((a) => ({ id: a.id, name: a.name, currency: a.currency ?? base }));
}

/** What the bill form needs: suppliers, projects, cost accounts and purchase orders not billed yet. */
export async function billFormData(workspaceId: string) {
  const [contacts, accts, projs, pos, used] = await Promise.all([
    listContacts(workspaceId),
    listAccounts(workspaceId),
    db.select({ id: projects.id, name: projects.name, key: projects.key, currency: projects.currency }).from(projects).where(and(eq(projects.workspaceId, workspaceId), isNull(projects.archivedAt))),
    db
      .select({ doc: documents, project: projects.name })
      .from(documents)
      .innerJoin(projects, eq(projects.id, documents.projectId))
      .where(and(eq(documents.workspaceId, workspaceId), eq(documents.type, "purchase_order"), ne(documents.status, "cancelled"))),
    db.select({ documentId: bills.documentId }).from(bills).where(and(eq(bills.workspaceId, workspaceId), ne(bills.status, "cancelled"))),
  ]);
  const usedIds = new Set(used.map((u) => u.documentId));
  return {
    suppliers: contacts.filter((c) => !c.archivedAt && c.kind !== "customer").map((c) => ({ id: c.id, name: c.name, kind: c.kind, currency: c.currency })),
    accounts: accts.filter((a) => !a.archivedAt && !a.moneyKind && (a.type === "expense" || (a.type === "asset" && !a.systemKey))).map((a) => ({ id: a.id, name: a.name, code: a.code, systemKey: a.systemKey })),
    projects: projs,
    orders: pos
      .filter((p) => !usedIds.has(p.doc.id))
      .map((p) => ({
        id: p.doc.id,
        code: docNumber("PO", p.doc.number),
        project: p.project,
        projectId: p.doc.projectId,
        supplier: p.doc.data.supplier ?? p.doc.data.to ?? "",
        currency: p.doc.currency,
        items: p.doc.items.map((i) => ({ description: i.description, unit: i.unit, quantity: i.quantity || "1", unitPrice: i.unitPrice || "0" })),
        taxRate: p.doc.taxRate ?? "0",
      })),
  };
}
