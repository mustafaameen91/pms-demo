"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import {
  AlertTriangle,
  BadgeCheck,
  Bell,
  CreditCard,
  ScrollText,
  ShieldCheck,
  Check,
  CheckSquare,
  ChevronsUpDown,
  FolderKanban,
  HandCoins,
  Gauge,
  LayoutDashboard,
  LayoutTemplate,
  LogOut,
  Menu,
  Monitor,
  Moon,
  Package,
  Plus,
  Sun,
  Users,
  Building2,
  Layers,
  FileBarChart,
} from "lucide-react";
import { authClient } from "@/lib/auth/client";
import { cn, initials } from "@/lib/utils";
import { Logo } from "@/components/logo";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { NewProjectDialog } from "@/components/projects/new-project-dialog";
import type { AccessState } from "@/lib/access";
import { useT } from "@/i18n/client";
import { CommandPalette, SearchButton } from "./command-palette";
import { LanguageSwitcher } from "./language-switcher";

type ShellProps = {
  user: { name: string; email: string; image: string | null };
  workspace: { id: string; name: string; slug: string; role: string };
  workspaces: { id: string; name: string; slug: string }[];
  projects: { id: string; name: string; key: string; color: string }[];
  unread: number;
  /** Expenses this user can approve; null-ish = not an approver anywhere. */
  approvals: number;
  /** Loan requests waiting (owners/admins only; 0 for members). */
  loanRequests: number;
  /** Owners, admins and project managers get weekly reports. */
  showReports: boolean;
  access: AccessState;
  isPlatformAdmin: boolean;
  children: React.ReactNode;
};

export function AppShell(props: ShellProps) {
  const t = useT();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const openSearch = () => {
    setMobileOpen(false);
    setSearchOpen(true);
  };

  return (
    <div className="flex min-h-dvh">
      <aside className="sticky top-0 hidden h-dvh w-60 shrink-0 border-e bg-sidebar text-sidebar-foreground lg:flex">
        <SidebarContent {...props} onSearch={openSearch} />
      </aside>

      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetContent side="left" className="w-64 bg-sidebar p-0">
          <SheetTitle className="sr-only">{t("Navigation")}</SheetTitle>
          <SidebarContent {...props} onNavigate={() => setMobileOpen(false)} onSearch={openSearch} />
        </SheetContent>
      </Sheet>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-12 items-center gap-2 border-b px-3 lg:hidden">
          <Button
            variant="ghost"
            size="icon"
            className="relative"
            onClick={() => setMobileOpen(true)}
            aria-label={props.unread > 0 ? t("Open navigation, {count} unread notifications", { count: props.unread }) : t("Open navigation")}
          >
            <Menu className="size-5" />
            {props.unread > 0 && <span aria-hidden className="absolute top-1.5 inset-e-1.5 size-2 rounded-full bg-primary" />}
          </Button>
          <span className="truncate text-sm font-medium">{props.workspace.name}</span>
        </header>
        <SubscriptionBanner access={props.access} billingHref={`/w/${props.workspace.slug}/billing`} />
        <main id="main" className="flex min-w-0 flex-1 flex-col">
          {props.children}
        </main>
        {props.access.allowed && (
          <CommandPalette
            slug={props.workspace.slug}
            open={searchOpen}
            onOpenChange={setSearchOpen}
            isAdmin={props.workspace.role === "owner" || props.workspace.role === "admin"}
          />
        )}
      </div>
    </div>
  );
}

function SidebarContent({
  user,
  workspace,
  workspaces,
  projects,
  unread,
  approvals,
  loanRequests,
  showReports,
  access,
  isPlatformAdmin,
  onNavigate,
  onSearch,
}: Omit<ShellProps, "children"> & { onNavigate?: () => void; onSearch: () => void }) {
  const t = useT();
  const pathname = usePathname();
  const base = `/w/${workspace.slug}`;
  const [newProjectOpen, setNewProjectOpen] = useState(false);

  return (
    <div className="flex h-full w-full flex-col">
      {/* grid-cols-1 = minmax(0,1fr): a long workspace name truncates instead of widening the sidebar. */}
      <div className="grid grid-cols-1 gap-2 p-2">
        <WorkspaceSwitcher workspace={workspace} workspaces={workspaces} />
        {access.allowed && <SearchButton onClick={onSearch} />}
      </div>

      <nav aria-label={t("Main")} className="flex-1 overflow-y-auto px-2 pb-2">
        {!access.allowed ? (
          <>
            <NavLink href={`${base}/billing`} active={pathname.startsWith(`${base}/billing`)} onNavigate={onNavigate}>
              <CreditCard className="size-4" />
              {t("Billing")}
            </NavLink>
            {isPlatformAdmin && (
              <NavLink href="/admin" active={pathname.startsWith("/admin")} onNavigate={onNavigate}>
                <ShieldCheck className="size-4" />
                {t("Platform admin")}
              </NavLink>
            )}
          </>
        ) : (
        <>
        <NavLink href={`${base}/my-tasks`} active={pathname.startsWith(`${base}/my-tasks`)} onNavigate={onNavigate}>
          <CheckSquare className="size-4" />
          {t("My tasks")}
        </NavLink>
        <NavLink href={`${base}/inbox`} active={pathname.startsWith(`${base}/inbox`)} onNavigate={onNavigate}>
          <Bell className="size-4" />
          {t("Inbox")}
          {unread > 0 && (
            <span className="ms-auto rounded-full bg-primary px-1.5 text-xs font-semibold text-primary-foreground tabular-nums">
              {unread > 99 ? "99+" : unread}
              <span className="sr-only"> {t("unread")}</span>
            </span>
          )}
        </NavLink>
        {approvals > 0 && (
          <NavLink href={`${base}/approvals`} active={pathname.startsWith(`${base}/approvals`)} onNavigate={onNavigate}>
            <BadgeCheck className="size-4" />
            {t("Approvals")}
            <span className="ms-auto rounded-full bg-amber-400 px-1.5 text-xs font-semibold text-amber-950 tabular-nums">
              {approvals}
              <span className="sr-only"> {t("waiting")}</span>
            </span>
          </NavLink>
        )}
        <NavLink href={`${base}/dashboard`} active={pathname.startsWith(`${base}/dashboard`)} onNavigate={onNavigate}>
          <LayoutDashboard className="size-4" />
          {t("Dashboard")}
        </NavLink>
        <NavLink href={base} active={pathname === base} onNavigate={onNavigate}>
          <FolderKanban className="size-4" />
          {t("Projects")}
        </NavLink>
        {showReports && (
          <NavLink href={`${base}/reports`} active={pathname.startsWith(`${base}/reports`)} onNavigate={onNavigate}>
            <FileBarChart className="size-4" />
            {t("Weekly reports")}
          </NavLink>
        )}
        <NavLink href={`${base}/portfolios`} active={pathname.startsWith(`${base}/portfolios`)} onNavigate={onNavigate}>
          <Layers className="size-4" />
          {t("Portfolios")}
        </NavLink>
        <NavLink href={`${base}/resources`} active={pathname.startsWith(`${base}/resources`)} onNavigate={onNavigate}>
          <Package className="size-4" />
          {t("Resources")}
        </NavLink>
        <NavLink href={`${base}/loans`} active={pathname.startsWith(`${base}/loans`)} onNavigate={onNavigate}>
          <HandCoins className="size-4" />
          {t("Loans")}
          {loanRequests > 0 && (
            <span className="ms-auto rounded-full bg-amber-400 px-1.5 text-xs font-semibold text-amber-950 tabular-nums">
              {loanRequests}
              <span className="sr-only"> {t("waiting")}</span>
            </span>
          )}
        </NavLink>
        <NavLink href={`${base}/templates`} active={pathname.startsWith(`${base}/templates`)} onNavigate={onNavigate}>
          <LayoutTemplate className="size-4" />
          {t("Templates")}
        </NavLink>
        <NavLink href={`${base}/workload`} active={pathname.startsWith(`${base}/workload`)} onNavigate={onNavigate}>
          <Gauge className="size-4" />
          {t("Workload")}
        </NavLink>
        <NavLink href={`${base}/members`} active={pathname.startsWith(`${base}/members`)} onNavigate={onNavigate}>
          <Users className="size-4" />
          {t("Members")}
        </NavLink>
        {(workspace.role === "owner" || workspace.role === "admin") && (
          <NavLink href={`${base}/audit`} active={pathname.startsWith(`${base}/audit`)} onNavigate={onNavigate}>
            <ScrollText className="size-4" />
            {t("Audit log")}
          </NavLink>
        )}
        {(workspace.role === "owner" || workspace.role === "admin") && (
          <NavLink href={`${base}/company`} active={pathname.startsWith(`${base}/company`)} onNavigate={onNavigate}>
            <Building2 className="size-4" />
            {t("Company profile")}
          </NavLink>
        )}
        {(workspace.role === "owner" || workspace.role === "admin") && (
          <NavLink href={`${base}/billing`} active={pathname.startsWith(`${base}/billing`)} onNavigate={onNavigate}>
            <CreditCard className="size-4" />
            {t("Billing")}
          </NavLink>
        )}
        {isPlatformAdmin && (
          <NavLink href="/admin" active={pathname.startsWith("/admin")} onNavigate={onNavigate}>
            <ShieldCheck className="size-4" />
            {t("Platform admin")}
          </NavLink>
        )}

        <div className="mt-5 mb-1 flex items-center justify-between ps-2.5 pe-1">
          <span className="text-xs font-medium text-muted-foreground">{t("Your projects")}</span>
          {(workspace.role === "owner" || workspace.role === "admin") && (
            <Button
              variant="ghost"
              size="icon"
              className="size-7"
              onClick={() => setNewProjectOpen(true)}
              aria-label={t("New project")}
            >
              <Plus className="size-4" />
            </Button>
          )}
        </div>
        {projects.length === 0 ? (
          <p className="px-2.5 py-1 text-xs text-muted-foreground">{t("No projects yet.")}</p>
        ) : (
          <ul className="grid gap-px">
            {projects.map((p) => {
              const href = `${base}/p/${p.key}`;
              return (
                <li key={p.id}>
                  <NavLink href={href} active={pathname.startsWith(href)} onNavigate={onNavigate}>
                    <span aria-hidden className="size-2.5 shrink-0 rounded-sm" style={{ backgroundColor: p.color }} />
                    <span className="truncate">{p.name}</span>
                  </NavLink>
                </li>
              );
            })}
          </ul>
        )}
        </>
        )}
      </nav>

      {/* grid-cols-1 = minmax(0,1fr): a long email truncates instead of widening the sidebar. */}
      <div className="grid grid-cols-1 gap-1 border-t p-2">
        <LanguageSwitcher className="justify-start" />
        <UserMenu user={user} />
      </div>

      <NewProjectDialog
        workspaceSlug={workspace.slug}
        open={newProjectOpen}
        onOpenChange={setNewProjectOpen}
      />
    </div>
  );
}

function NavLink({
  href,
  active,
  onNavigate,
  children,
}: {
  href: string;
  active: boolean;
  onNavigate?: () => void;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      onClick={onNavigate}
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex h-8 items-center gap-2 rounded-md px-2.5 text-sm transition-colors",
        "hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
        "focus-visible:outline-2 focus-visible:outline-ring",
        active && "bg-sidebar-accent font-medium text-sidebar-accent-foreground",
      )}
    >
      {children}
    </Link>
  );
}

function WorkspaceSwitcher({
  workspace,
  workspaces,
}: Pick<ShellProps, "workspace" | "workspaces">) {
  const t = useT();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button className="flex h-10 w-full items-center gap-2 rounded-md px-2 text-start hover:bg-sidebar-accent focus-visible:outline-2 focus-visible:outline-ring">
          <Logo compact />
          <span className="flex-1 truncate text-sm font-semibold">{workspace.name}</span>
          <ChevronsUpDown className="size-4 text-muted-foreground" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-56">
        <DropdownMenuLabel className="text-xs text-muted-foreground">{t("Workspaces")}</DropdownMenuLabel>
        {workspaces.map((w) => (
          <DropdownMenuItem key={w.id} asChild>
            <Link href={`/w/${w.slug}`}>
              <span className="flex-1 truncate">{w.name}</span>
              {w.id === workspace.id && <Check className="size-4" />}
            </Link>
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href="/onboarding">
            <Plus className="size-4" />
            {t("Create workspace")}
          </Link>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function UserMenu({ user }: Pick<ShellProps, "user">) {
  const t = useT();
  const router = useRouter();
  const { theme, setTheme } = useTheme();

  async function handleSignOut() {
    await authClient.signOut();
    router.replace("/login");
    router.refresh();
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button className="flex h-10 w-full items-center gap-2 rounded-md px-2 text-start hover:bg-sidebar-accent focus-visible:outline-2 focus-visible:outline-ring">
          <Avatar className="size-7">
            {user.image && <AvatarImage src={user.image} alt="" />}
            <AvatarFallback className="text-xs">{initials(user.name)}</AvatarFallback>
          </Avatar>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-medium">{user.name}</span>
            <span className="block truncate text-xs text-muted-foreground">{user.email}</span>
          </span>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" side="top" className="w-56">
        <DropdownMenuLabel className="text-xs text-muted-foreground">{t("Theme")}</DropdownMenuLabel>
        <DropdownMenuRadioGroup value={theme} onValueChange={setTheme}>
          <DropdownMenuRadioItem value="light">
            <Sun className="size-4" /> {t("Light")}
          </DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="dark">
            <Moon className="size-4" /> {t("Dark")}
          </DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="system">
            <Monitor className="size-4" /> {t("System")}
          </DropdownMenuRadioItem>
        </DropdownMenuRadioGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={handleSignOut} variant="destructive">
          <LogOut className="size-4 rtl:-scale-x-100" />
          {t("Sign out")}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function SubscriptionBanner({ access, billingHref }: { access: AccessState; billingHref: string }) {
  const t = useT();
  if (access.allowed && access.kind === "complimentary") return null;
  if (access.allowed && !access.endingSoon && access.kind === "active") return null;
  const locked = !access.allowed;
  const text = !access.allowed
    ? access.kind === "pending"
      ? t("This workspace is waiting for payment. Projects open once the subscription is activated.")
      : access.kind === "expired"
        ? t("The subscription has ended, so this workspace is locked. Your data is safe — renew to continue.")
        : t("This workspace's subscription was cancelled.")
    : access.kind === "trial"
      ? t.plural(access.daysLeft, "Trial: {count} day left.", "Trial: {count} days left.")
      : access.daysLeft === 0
        ? t("The subscription ends today.")
        : t.plural(access.daysLeft, "The subscription ends in {count} day.", "The subscription ends in {count} days.");
  return (
    <div
      role={locked ? "alert" : "status"}
      className={cn(
        "flex flex-wrap items-center gap-x-3 gap-y-1 border-b px-4 py-2 text-sm sm:px-6",
        locked ? "bg-destructive/10 text-destructive" : "bg-amber-500/10 text-amber-800 dark:text-amber-300",
      )}
    >
      <AlertTriangle className="size-4 shrink-0" aria-hidden />
      <span className="flex-1">{text}</span>
      <Link href={billingHref} className="font-medium underline underline-offset-4">
        {locked ? t("Billing & payment") : t("Renew")}
      </Link>
    </div>
  );
}
