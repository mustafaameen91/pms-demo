import { notFound } from "next/navigation";
import { Building2 } from "lucide-react";
import { requireWorkspace } from "@/lib/auth/session";
import { getCompanyProfile } from "@/lib/data/company";
import { isWorkspaceAdmin } from "@/lib/permissions";
import { getT } from "@/i18n/server";
import { CompanyProfileForm } from "@/components/documents/company-profile-form";
import { CompanyTabs } from "@/components/documents/company-tabs";

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
    <div className="w-full px-4 py-6 sm:px-6 lg:py-8">
      <CompanyTabs slug={workspace.slug} />
      <header className="mb-6">
        <h1 className="flex items-center gap-2 text-xl font-semibold tracking-tight">
          <Building2 className="size-5 text-primary" aria-hidden />
          {t("Company profile")}
        </h1>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
          {t("Your logo and details print on every document your team creates: contracts, purchase orders, vouchers and letters.")}
        </p>
      </header>
      <CompanyProfileForm slug={workspace.slug} profile={profile} />
    </div>
  );
}
