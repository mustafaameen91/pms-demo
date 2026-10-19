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
      <main className="mx-auto w-full max-w-xl px-4 py-10 sm:py-14">
        <div className="mb-6 flex items-center justify-between gap-2">
          <Logo />
          <LanguageSwitcher />
        </div>
        {!open ? (
          <div className="rounded-xl border p-6 text-center">
            <h1 className="text-xl font-semibold">{t("This form is closed")}</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              {t("It may have been turned off or replaced. Please contact the team that shared it.")}
            </p>
          </div>
        ) : (
          <>
            <p className="text-xs text-muted-foreground">
              {row.workspaceName} · {row.projectName}
            </p>
            <h1 className="mt-1 text-2xl font-semibold">{row.form.title}</h1>
            {row.form.intro && <p className="mt-2 text-sm whitespace-pre-wrap text-muted-foreground">{row.form.intro}</p>}
            <RequestForm token={token} config={config!.data} renderedAt={now()} />
          </>
        )}
      </main>
    </LightTheme>
  );
}
