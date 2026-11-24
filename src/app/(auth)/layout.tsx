import { redirect } from "next/navigation";
import { BarChart3, CheckCircle2, Wallet } from "lucide-react";
import { getSession } from "@/lib/auth/session";
import { Logo, LogoMark } from "@/components/logo";
import { LanguageSwitcher } from "@/components/shell/language-switcher";
import { BrandPanel } from "@/components/auth/brand-panel";
import { getT } from "@/i18n/server";

export default async function AuthLayout({ children }: LayoutProps<"/">) {
  if (await getSession()) redirect("/");
  const t = await getT();

  return (
    <main className="grid min-h-dvh md:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
      {/* Brand side (md and up): the graphite band, the logo as on the identity sheet and what tamm does. */}
      <BrandPanel className="hidden md:flex">
        {/* The lockup from the identity sheet; a logo doesn't mirror, so it stays left-to-right. */}
        <div dir="ltr" className="flex items-start gap-3 self-start" role="img" aria-label="tamm تمّ">
          <LogoMark onDark className="size-12 drop-shadow-lg" />
          <span aria-hidden className="flex flex-col items-end">
            <span className="text-4xl leading-[0.9] font-extrabold tracking-[-0.02em]">tamm</span>
            <span className="text-2xl leading-none font-semibold text-brand-accent">تمّ</span>
          </span>
        </div>
        <div className="max-w-md">
          <h2 className="text-3xl font-bold tracking-tight text-balance lg:text-4xl">{t("Every project, every team, in one place.")}</h2>
          <ul className="mt-8 grid gap-4 text-white/90">
            {[
              { icon: CheckCircle2, text: t("Tasks, timelines and who's doing what") },
              { icon: BarChart3, text: t("Progress against plan, the moment it slips") },
              { icon: Wallet, text: t("Budgets, expenses and approvals in one view") },
            ].map(({ icon: Icon, text }) => (
              <li key={text} className="flex items-center gap-3">
                <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-white/15 ring-1 ring-white/20">
                  <Icon className="size-4.5" aria-hidden />
                </span>
                {text}
              </li>
            ))}
          </ul>
        </div>
        <p className="text-sm text-white/75">{t("In Arabic and English.")}</p>
      </BrandPanel>

      {/* Form side. */}
      <div className="relative isolate flex flex-col items-center justify-center overflow-hidden bg-muted/40 px-4 py-12">
        <div aria-hidden className="absolute -top-32 -z-10 size-96 rounded-full bg-brand-accent/10 blur-3xl inset-e-[-6rem]" />
        <LanguageSwitcher className="absolute top-3 inset-e-3" />
        <div className="mb-8 md:hidden">
          <Logo />
        </div>
        <div className="w-full max-w-sm [&_[data-slot=card]]:rounded-2xl [&_[data-slot=card]]:border [&_[data-slot=card]]:shadow-xl [&_[data-slot=card]]:shadow-primary/5">
          {children}
        </div>
      </div>
    </main>
  );
}
