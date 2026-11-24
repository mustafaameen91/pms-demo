import { notFound, redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { invoices } from "@/lib/db/schema";
import { requireWorkspace } from "@/lib/auth/session";
import { getVisibleProjectByKey } from "@/lib/data/project-access";
import { getDocument } from "@/lib/data/documents";
import { getCompanyProfile } from "@/lib/data/company";
import { canManageProject, isWorkspaceAdmin } from "@/lib/permissions";
import { isPaperStyle } from "@/lib/branding";
import { docNumber, docType } from "@/lib/documents/types";
import { layoutDef } from "@/lib/documents/customize";
import { getT } from "@/i18n/server";
import { DocumentEditor } from "@/components/documents/document-editor";

export async function generateMetadata({ params }: PageProps<"/w/[slug]/p/[key]/documents/[id]">) {
  const { slug, id } = await params;
  const t = await getT();
  const { workspace } = await requireWorkspace(slug);
  const row = await getDocument(workspace.id, id);
  // An invoice moved into Finance is edited there.
  if (row?.doc.type === "invoice") {
    const [moved] = await db.select({ id: invoices.id }).from(invoices).where(eq(invoices.documentId, row.doc.id));
    if (moved && isWorkspaceAdmin(workspace.role)) redirect(`/w/${workspace.slug}/finance/invoices/${moved.id}`);
  }
  const def = row && layoutDef(row.doc.type, row.doc.layout, docType);
  return { title: def ? docNumber(def.prefix, row.doc.number) : t("Documents") };
}

export default async function DocumentPage({ params }: PageProps<"/w/[slug]/p/[key]/documents/[id]">) {
  const { slug, key, id } = await params;
  const { user, workspace } = await requireWorkspace(slug);
  const project = await getVisibleProjectByKey(workspace, user.id, key);
  if (!project || !canManageProject(workspace.role, user.id, project)) notFound();
  const row = await getDocument(workspace.id, id);
  const def = row && layoutDef(row.doc.type, row.doc.layout, docType);
  if (!row || !def || row.doc.projectId !== project.id) notFound();
  const { configured: _c, ...profile } = await getCompanyProfile(workspace.id);
  void _c;
  const { doc } = row;

  return (
    <div className="w-full px-4 py-6 sm:px-6">
      <DocumentEditor
        def={def}
        doc={{
          id: doc.id,
          number: doc.number,
          status: doc.status,
          language: doc.language === "en" ? "en" : "ar",
          style: isPaperStyle(doc.style) ? doc.style : "classic",
          date: doc.date,
          currency: doc.currency,
          data: doc.data,
          items: doc.items,
          taxRate: doc.taxRate,
        }}
        profile={profile}
        projectName={project.name}
        listHref={`/w/${workspace.slug}/p/${project.key}/documents`}
        printHref={`/print/${workspace.slug}/${project.key}/documents/${doc.id}`}
      />
    </div>
  );
}
