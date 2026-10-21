import { notFound } from "next/navigation";
import { requireWorkspace } from "@/lib/auth/session";
import { getVisibleProjectByKey } from "@/lib/data/project-access";
import { listDocuments } from "@/lib/data/documents";
import { getCompanyProfile } from "@/lib/data/company";
import { canManageProject, isWorkspaceAdmin } from "@/lib/permissions";
import { getT } from "@/i18n/server";
import { DocumentsList } from "@/components/documents/documents-list";

export async function generateMetadata({ params }: PageProps<"/w/[slug]/p/[key]/documents">) {
  const [{ key }, t] = await Promise.all([params, getT()]);
  return { title: t("Documents · {key}", { key: key.toUpperCase() }) };
}

export default async function DocumentsPage({ params }: PageProps<"/w/[slug]/p/[key]/documents">) {
  const { slug, key } = await params;
  const { user, workspace } = await requireWorkspace(slug);
  const project = await getVisibleProjectByKey(workspace, user.id, key);
  // Documents carry prices and signatures: the project manager and admins only.
  if (!project || !canManageProject(workspace.role, user.id, project)) notFound();
  const [docs, profile] = await Promise.all([listDocuments(project.id), getCompanyProfile(workspace.id)]);

  return (
    <div className="w-full px-4 py-6 sm:px-6">
      <DocumentsList
        projectId={project.id}
        basePath={`/w/${workspace.slug}/p/${project.key}`}
        printBase={`/print/${workspace.slug}/${project.key}/documents`}
        documents={docs}
        defaults={{ language: profile.defaultLanguage, style: profile.defaultStyle }}
        companyHref={profile.configured ? false : isWorkspaceAdmin(workspace.role) ? `/w/${workspace.slug}/company` : null}
      />
    </div>
  );
}
