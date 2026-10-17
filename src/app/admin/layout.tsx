import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth/session";
import { isSuperAdmin } from "@/lib/billing";
import { Logo } from "@/components/logo";

export default async function AdminLayout({ children }: LayoutProps<"/admin">) {
  const user = await requireUser();
  // Not advertised: non-admins get the same 404 as a missing page.
  if (!isSuperAdmin(user.email)) notFound();
  return (
    <div className="min-h-dvh bg-background">
      <header className="flex h-14 items-center gap-3 border-b px-4 sm:px-6">
        <Logo />
        <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">Platform admin</span>
        <Link href="/" className="ml-auto text-sm text-primary underline-offset-4 hover:underline">
          Back to app
        </Link>
      </header>
      <main id="main">{children}</main>
    </div>
  );
}
