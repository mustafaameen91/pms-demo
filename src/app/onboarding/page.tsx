import type { Metadata } from "next";
import { requireUser } from "@/lib/auth/session";
import { getT } from "@/i18n/server";
import { Logo } from "@/components/logo";
import { CreateWorkspaceForm } from "./create-workspace-form";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t("Create a workspace") };
}

export default async function OnboardingPage() {
  const user = await requireUser();
  const t = await getT();

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center bg-muted/40 px-4 py-12">
      <div className="mb-8">
        <Logo />
      </div>
      <div className="w-full max-w-md rounded-xl border bg-card p-6 shadow-sm sm:p-8">
        <h1 className="text-xl font-semibold">{t("Welcome, {name}", { name: user.name.split(" ")[0] })}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {t("Create a workspace for your team. You can invite people and add projects next.")}
        </p>
        <CreateWorkspaceForm />
      </div>
    </main>
  );
}
