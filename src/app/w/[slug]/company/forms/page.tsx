import { notFound } from "next/navigation";
import { FileText } from "lucide-react";
import { requireWorkspace } from "@/lib/auth/session";
import { getCompanyTypes, getTypeSettings } from "@/lib/data/document-settings";
import { isWorkspaceAdmin } from "@/lib/permissions";
import { getT } from "@/i18n/server";
import { CompanyTabs } from "@/components/documents/company-tabs";
import { DocFormsList } from "@/components/documents/doc-forms-list";

export async function generateMetadata() {
  const t = await getT();
  return { title: t("Document forms") };
}

export default async function DocFormsPage({ params }: PageProps<"/w/[slug]/company/forms">) {
  const { slug } = await params;
  const { workspace } = await requireWorkspace(slug);
  if (!isWorkspaceAdmin(workspace.role)) notFound();
  const t = await getT();
  const [types, settings] = await Promise.all([getCompanyTypes(workspace.id), getTypeSettings(workspace.id)]);
  const customized = (key: string) => {
    const s = settings.get(key)?.settings;
    return Boolean(s && Object.values(s).some((v) => (Array.isArray(v) ? v.length : v && (typeof v !== "object" || Object.keys(v).length))));
  };

  return (
    <div className="w-full px-4 py-6 sm:px-6 lg:py-8">
      <CompanyTabs slug={workspace.slug} />
      <header className="mb-6">
        <h1 className="flex items-center gap-2 text-xl font-semibold tracking-tight">
          <FileText className="size-5 text-primary" aria-hidden />
          {t("Document forms")}
        </h1>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
          {t("Turn off the documents your company doesn't use, and make each form your own: names, fields, starting text and number prefix.")}
        </p>
      </header>
      <DocFormsList slug={workspace.slug} types={types.map((d) => ({ ...d, customized: customized(d.key) }))} />
    </div>
  );
}
