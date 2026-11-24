import type { Metadata } from "next";
import { requireUser } from "@/lib/auth/session";
import { getT } from "@/i18n/server";
import { Logo } from "@/components/logo";
import { Building2, FolderPlus, UserPlus } from "lucide-react";
import { BrandBackdrop } from "@/components/auth/brand-panel";
import { GradientIcon } from "@/components/page/kit";
import { cn } from "@/lib/utils";
import { CreateWorkspaceForm } from "./create-workspace-form";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t("Create a workspace") };
}

export default async function OnboardingPage() {
  const user = await requireUser();
  const t = await getT();

  const steps = [
    { icon: Building2, label: t("Create your workspace") },
    { icon: UserPlus, label: t("Invite your team") },
    { icon: FolderPlus, label: t("Add your first project") },
  ];

  return (
    <BrandBackdrop
      band={
        <div className="flex flex-col items-center gap-6 text-center">
          <Logo onDark className="text-white" />
          <p className="text-sm font-medium text-white/85">{t("Set up your workspace")}</p>
        </div>
      }
    >
      <div className="mx-auto w-full max-w-md rounded-2xl border bg-card p-6 shadow-xl shadow-primary/5 sm:p-8">
        <div className="flex items-center gap-4">
          <GradientIcon icon={Building2} />
          <div className="min-w-0">
            <h1 className="text-xl font-bold tracking-tight">{t("Welcome, {name}", { name: user.name.split(" ")[0] })}</h1>
            <p className="text-xs font-medium text-muted-foreground">{t("Step {n} of {total}", { n: 1, total: 3 })}</p>
          </div>
        </div>
        <p className="mt-4 text-sm text-muted-foreground">{t("Create a workspace for your team. You can invite people and add projects next.")}</p>
        <ol className="mt-5 grid gap-2">
          {steps.map(({ icon: Icon, label }, i) => (
            <li key={label} className={cn("flex items-center gap-3 rounded-xl border px-3 py-2 text-sm", i === 0 ? "border-primary/30 bg-primary/5 font-medium text-foreground" : "text-muted-foreground")}>
              <span aria-hidden className={cn("grid size-7 place-items-center rounded-lg", i === 0 ? "bg-primary text-primary-foreground" : "bg-muted")}>
                <Icon className="size-3.5" />
              </span>
              {label}
            </li>
          ))}
        </ol>
        <CreateWorkspaceForm />
      </div>
    </BrandBackdrop>
  );
}
