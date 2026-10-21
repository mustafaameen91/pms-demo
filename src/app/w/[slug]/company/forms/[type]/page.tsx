import { notFound } from "next/navigation";
import { requireWorkspace } from "@/lib/auth/session";
import { getTypeSettings } from "@/lib/data/document-settings";
import { getCompanyProfile } from "@/lib/data/company";
import { isWorkspaceAdmin } from "@/lib/permissions";
import { docType } from "@/lib/documents/types";
import { settingsSchema } from "@/lib/documents/customize";
import { getT } from "@/i18n/server";
import { CompanyTabs } from "@/components/documents/company-tabs";
import { DocFormEditor } from "@/components/documents/doc-form-editor";

export async function generateMetadata({ params }: PageProps<"/w/[slug]/company/forms/[type]">) {
  const [{ type }, t] = await Promise.all([params, getT()]);
  const def = docType(type);
  return { title: def ? def.title[t.locale === "ar" ? "ar" : "en"] : t("Document forms") };
}

export default async function DocFormPage({ params }: PageProps<"/w/[slug]/company/forms/[type]">) {
  const { slug, type } = await params;
  const { workspace } = await requireWorkspace(slug);
  const def = docType(type);
  if (!isWorkspaceAdmin(workspace.role) || !def) notFound();
  const [settings, company] = await Promise.all([getTypeSettings(workspace.id), getCompanyProfile(workspace.id)]);
  const { configured: _c, ...profile } = company;
  void _c;

  return (
    <div className="w-full px-4 py-6 sm:px-6 lg:py-8">
      <CompanyTabs slug={workspace.slug} />
      <DocFormEditor slug={workspace.slug} def={def} initial={settings.get(type)?.settings ?? settingsSchema.parse({})} profile={profile} />
    </div>
  );
}
