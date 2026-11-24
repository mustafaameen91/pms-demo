import type { Metadata } from "next";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { organization, projects, requestForms } from "@/lib/db/schema";
import { getWorkspaceAccess } from "@/lib/billing";
import { formConfigSchema } from "@/lib/forms";
import { LightTheme } from "@/components/light-theme";
import { Logo } from "@/components/logo";
import { LanguageSwitcher } from "@/components/shell/language-switcher";
import { getT } from "@/i18n/server";
import { RequestForm } from "./request-form";
import { ClipboardList, Lock } from "lucide-react";
import { BrandBackdrop } from "@/components/auth/brand-panel";
import { EmptyState, GradientIcon } from "@/components/page/kit";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t("Send a request"), robots: { index: false, follow: false } };
}

const now = () => Date.now();

/** Public request form: anyone with the link can submit; creates a task. */
export default async function PublicFormPage({ params }: PageProps<"/f/[token]">) {
  const { token } = await params;
  const t = await getT();
  const [row] = await db
    .select({ form: requestForms, projectName: projects.name, workspaceName: organization.name })
    .from(requestForms)
    .innerJoin(projects, eq(projects.id, requestForms.projectId))
    .innerJoin(organization, eq(organization.id, requestForms.workspaceId))
    .where(eq(requestForms.token, token))
    .limit(1);
  const config = row ? formConfigSchema.safeParse(row.form.config) : null;
  const open = row && row.form.enabled && config?.success && (await getWorkspaceAccess(row.form.workspaceId)).allowed;

  return (
    <LightTheme>
      <BrandBackdrop
        band={
          <div className="mx-auto grid max-w-xl gap-6">
            <div className="flex items-center justify-between gap-3">
              <Logo onDark className="text-white" />
              <LanguageSwitcher className="text-white hover:bg-white/15 hover:text-white" />
            </div>
            {open && (
              <div>
                <p className="text-xs font-medium text-white/80">
                  {row.workspaceName} · {row.projectName}
                </p>
                <h1 className="mt-1 text-3xl font-bold tracking-tight">{row.form.title}</h1>
              </div>
            )}
          </div>
        }
      >
        <div className="mx-auto max-w-xl">
          {!open ? (
            <EmptyState icon={Lock} title={t("This form is closed")} className="border-solid shadow-xl shadow-primary/5">
              {t("It may have been turned off or replaced. Please contact the team that shared it.")}
            </EmptyState>
          ) : (
            <div className="rounded-2xl border bg-card p-6 shadow-xl shadow-primary/5 sm:p-8">
              <div className="flex items-start gap-4">
                <GradientIcon icon={ClipboardList} />
                {row.form.intro ? (
                  <p className="text-sm whitespace-pre-wrap text-muted-foreground">{row.form.intro}</p>
                ) : (
                  <p className="text-sm text-muted-foreground">{t("Send a request")}</p>
                )}
              </div>
              <RequestForm token={token} config={config!.data} renderedAt={now()} />
            </div>
          )}
        </div>
      </BrandBackdrop>
    </LightTheme>
  );
}
