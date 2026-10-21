import Link from "next/link";
import { notFound } from "next/navigation";
import { requireWorkspace } from "@/lib/auth/session";
import { getVisibleProjectByKey } from "@/lib/data/project-access";
import { getDocument } from "@/lib/data/documents";
import { getCompanyProfile } from "@/lib/data/company";
import { canManageProject } from "@/lib/permissions";
import { isPaperStyle } from "@/lib/branding";
import { docNumber, docType } from "@/lib/documents/types";
import { layoutDef } from "@/lib/documents/customize";
import { getT } from "@/i18n/server";
import { LightTheme } from "@/components/light-theme";
import { Paper } from "@/components/documents/paper";
import { DocumentBody } from "@/components/documents/document-body";
import { PrintButton } from "../../print-button";

export async function generateMetadata({ params }: PageProps<"/print/[slug]/[key]/documents/[id]">) {
  const { slug, id } = await params;
  const { workspace } = await requireWorkspace(slug);
  const row = await getDocument(workspace.id, id);
  const def = row && layoutDef(row.doc.type, row.doc.layout, docType);
  // The PDF's default file name.
  return { title: def ? `${docNumber(def.prefix, row.doc.number)} ${def.title[row.doc.language === "en" ? "en" : "ar"]}` : "" };
}

/** A document on the company's letterhead, sized for A4. "Save as PDF" in the print dialog makes the PDF. */
export default async function PrintDocumentPage({ params }: PageProps<"/print/[slug]/[key]/documents/[id]">) {
  const { slug, key, id } = await params;
  const t = await getT();
  const { user, workspace } = await requireWorkspace(slug);
  const project = await getVisibleProjectByKey(workspace, user.id, key);
  if (!project || !canManageProject(workspace.role, user.id, project)) notFound();
  const row = await getDocument(workspace.id, id);
  const def = row && layoutDef(row.doc.type, row.doc.layout, docType);
  if (!row || !def || row.doc.projectId !== project.id) notFound();
  const profile = await getCompanyProfile(workspace.id);
  const { doc } = row;
  const lang = doc.language === "en" ? "en" : "ar";

  return (
    <LightTheme>
      <style>{`@page { size: A4; margin: 0; } @media print { body { background: white; } }`}</style>
      <div className="min-h-dvh bg-neutral-200 py-6 print:bg-white print:py-0">
        <div className="mx-auto mb-4 flex w-[210mm] max-w-full items-center justify-between gap-4 px-2 print:hidden">
          <Link href={`/w/${workspace.slug}/p/${project.key}/documents/${doc.id}`} className="text-sm text-primary underline-offset-4 hover:underline">
            {t("← Back to the document")}
          </Link>
          <PrintButton />
        </div>
        <div className="mx-auto w-fit overflow-x-auto shadow-lg print:shadow-none">
          <Paper profile={profile} style={isPaperStyle(doc.style) ? doc.style : "classic"} lang={lang}>
            <DocumentBody
              def={def}
              doc={{ number: doc.number, status: doc.status, date: doc.date, currency: doc.currency, data: doc.data, items: doc.items, taxRate: doc.taxRate }}
              lang={lang}
              profile={profile}
              projectName={project.name}
            />
          </Paper>
        </div>
      </div>
    </LightTheme>
  );
}
