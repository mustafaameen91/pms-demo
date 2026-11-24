import Link from "next/link";
import { ArrowLeft, ShieldCheck } from "lucide-react";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth/session";
import { isSuperAdmin } from "@/lib/billing";
import { Logo } from "@/components/logo";
import { getT } from "@/i18n/server";

export default async function AdminLayout({ children }: LayoutProps<"/admin">) {
  const user = await requireUser();
  // Not advertised: non-admins get the same 404 as a missing page.
  if (!isSuperAdmin(user.email)) notFound();
  const t = await getT();
  return (
    <div className="min-h-dvh bg-background">
      <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b bg-background/85 px-4 backdrop-blur sm:px-6">
        <Logo />
        <span className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold text-white bg-brand">
          <ShieldCheck className="size-3.5" aria-hidden />
          {t("Platform admin")}
        </span>
        <Link
          href="/"
          className="ms-auto inline-flex h-8 items-center gap-1.5 rounded-lg border bg-card px-3 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          <ArrowLeft className="size-4 rtl:-scale-x-100" aria-hidden />
          {t("Back to app")}
        </Link>
      </header>
      <main id="main">{children}</main>
    </div>
  );
}
