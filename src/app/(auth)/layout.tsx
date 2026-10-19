import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { Logo } from "@/components/logo";
import { LanguageSwitcher } from "@/components/shell/language-switcher";

export default async function AuthLayout({ children }: LayoutProps<"/">) {
  if (await getSession()) redirect("/");

  return (
    <main className="relative flex min-h-dvh flex-col items-center justify-center bg-muted/40 px-4 py-12">
      <LanguageSwitcher className="absolute top-3 inset-e-3" />
      <div className="mb-8">
        <Logo />
      </div>
      <div className="w-full max-w-sm">{children}</div>
    </main>
  );
}
