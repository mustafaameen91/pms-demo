import { notFound } from "next/navigation";
import { Building2 } from "lucide-react";
import { requireWorkspace } from "@/lib/auth/session";
import { getCompanyProfile } from "@/lib/data/company";
import { isWorkspaceAdmin } from "@/lib/permissions";
import { getT } from "@/i18n/server";
import { CompanyProfileForm } from "@/components/documents/company-profile-form";
import { CompanyTabs } from "@/components/documents/company-tabs";
import { PageHeader, PageShell } from "@/components/page/kit";

export async function generateMetadata() {
  const t = await getT();
  return { title: t("Company profile") };
}

export default async function CompanyPage({ params }: PageProps<"/w/[slug]/company">) {
  const { slug } = await params;
  const { workspace } = await requireWorkspace(slug);
  if (!isWorkspaceAdmin(workspace.role)) notFound();
  const t = await getT();
  const { configured: _c, ...profile } = await getCompanyProfile(workspace.id);
  void _c;

  return (
    <PageShell>
      <PageHeader
        icon={Building2}
        title={t("Company profile")}
        description={t("Your logo and details print on every document your team creates: contracts, purchase orders, vouchers and letters.")}
      >
        <CompanyTabs slug={workspace.slug} className="" />
      </PageHeader>
      <CompanyProfileForm slug={workspace.slug} profile={profile} />
    </PageShell>
  );
}
