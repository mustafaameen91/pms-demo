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
  Contact,
  Landmark,
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
  /** HR items needing action: papers expiring, leave waiting (owners/admins only; 0 for members). */
  hrAlerts: number;
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
      <aside className="sticky top-0 hidden h-dvh w-64 shrink-0 border-e bg-sidebar text-sidebar-foreground lg:flex">
        <SidebarContent {...props} onSearch={openSearch} />
      </aside>

      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetContent side="left" className="w-72 bg-sidebar p-0">
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
  hrAlerts,
  access,
  isPlatformAdmin,
  onNavigate,
  onSearch,
}: Omit<ShellProps, "children"> & { onNavigate?: () => void; onSearch: () => void }) {
  const t = useT();
  const pathname = usePathname();
  const base = `/w/${workspace.slug}`;
  const [newProjectOpen, setNewProjectOpen] = useState(false);

  const isAdmin = workspace.role === "owner" || workspace.role === "admin";
  const is = (href: string) => pathname.startsWith(href);
  const item = (href: string, icon: typeof Bell, label: string, active: boolean, badge?: React.ReactNode) => (
    <NavLink href={href} active={active} onNavigate={onNavigate} icon={icon} badge={badge}>
      {label}
    </NavLink>
  );
  const count = (n: number, srLabel: string, tone: "brand" | "amber") => (
    <span
      className={cn(
        "ms-auto rounded-full px-1.5 py-px text-[11px] font-semibold tabular-nums",
        tone === "brand" ? "bg-brand text-white shadow-sm shadow-brand/30" : "bg-amber-400 text-amber-950",
      )}
    >
      {n > 99 ? "99+" : n}
      <span className="sr-only"> {srLabel}</span>
    </span>
  );

  return (
    <div className="relative isolate flex h-full w-full flex-col overflow-hidden">
      {/* The brand, quietly: a coral glow behind the top of the sidebar. */}
      <div aria-hidden className="pointer-events-none absolute -top-24 -z-10 size-64 rounded-full bg-brand-accent/10 blur-3xl inset-s-[-6rem]" />

      {/* grid-cols-1 = minmax(0,1fr): a long workspace name truncates instead of widening the sidebar. */}
      <div className="grid grid-cols-1 gap-3 px-3 pt-4 pb-2">
        <Link href={`${base}/dashboard`} onClick={onNavigate} className="flex items-center px-1.5 focus-visible:outline-2 focus-visible:outline-ring" aria-label={t("Dashboard")}>
          <Logo />
        </Link>
        <WorkspaceSwitcher workspace={workspace} workspaces={workspaces} />
        {access.allowed && <SearchButton onClick={onSearch} />}
      </div>

      <nav aria-label={t("Main")} className="flex-1 overflow-y-auto px-3 pb-3">
        {!access.allowed ? (
          <NavGroup>
            {item(`${base}/billing`, CreditCard, t("Billing"), is(`${base}/billing`))}
            {isPlatformAdmin && item("/admin", ShieldCheck, t("Platform admin"), is("/admin"))}
          </NavGroup>
        ) : (
          <>
            <NavGroup>
              {item(`${base}/dashboard`, LayoutDashboard, t("Dashboard"), is(`${base}/dashboard`))}
              {item(`${base}/my-tasks`, CheckSquare, t("My tasks"), is(`${base}/my-tasks`))}
              {item(`${base}/inbox`, Bell, t("Inbox"), is(`${base}/inbox`), unread > 0 && count(unread, t("unread"), "brand"))}
              {approvals > 0 && item(`${base}/approvals`, BadgeCheck, t("Approvals"), is(`${base}/approvals`), count(approvals, t("waiting"), "amber"))}
            </NavGroup>

            <NavGroup label={t("Work")}>
              {item(base, FolderKanban, t("Projects"), pathname === base)}
              {showReports && item(`${base}/reports`, FileBarChart, t("Weekly reports"), is(`${base}/reports`))}
              {item(`${base}/portfolios`, Layers, t("Portfolios"), is(`${base}/portfolios`))}
              {item(`${base}/workload`, Gauge, t("Workload"), is(`${base}/workload`))}
            </NavGroup>

            <NavGroup label={t("Resources & money")}>
              {item(`${base}/resources`, Package, t("Resources"), is(`${base}/resources`))}
              {isAdmin && item(`${base}/finance`, Landmark, t("Finance"), is(`${base}/finance`))}
              {item(`${base}/loans`, HandCoins, t("Loans"), is(`${base}/loans`), loanRequests > 0 && count(loanRequests, t("waiting"), "amber"))}
              {item(`${base}/templates`, LayoutTemplate, t("Templates"), is(`${base}/templates`))}
            </NavGroup>

            <NavGroup label={t("Company")}>
              {isAdmin && item(`${base}/hr`, Contact, t("HR"), is(`${base}/hr`), hrAlerts > 0 && count(hrAlerts, t("need attention"), "amber"))}
              {item(`${base}/members`, Users, t("Members"), is(`${base}/members`))}
              {isAdmin && item(`${base}/audit`, ScrollText, t("Audit log"), is(`${base}/audit`))}
              {isAdmin && item(`${base}/company`, Building2, t("Company profile"), is(`${base}/company`))}
              {isAdmin && item(`${base}/billing`, CreditCard, t("Billing"), is(`${base}/billing`))}
              {isPlatformAdmin && item("/admin", ShieldCheck, t("Platform admin"), is("/admin"))}
            </NavGroup>

            <NavGroup
              label={t("Your projects")}
              action={
                isAdmin && (
                  <Button variant="ghost" size="icon" className="size-6 rounded-md" onClick={() => setNewProjectOpen(true)} aria-label={t("New project")}>
                    <Plus className="size-3.5" />
                  </Button>
                )
              }
            >
              {projects.length === 0 ? (
                <p className="px-3 py-1 text-xs text-muted-foreground">{t("No projects yet.")}</p>
              ) : (
                projects.map((p) => {
                  const href = `${base}/p/${p.key}`;
                  return (
                    <NavLink key={p.id} href={href} active={pathname.startsWith(href)} onNavigate={onNavigate}>
                      <span aria-hidden className="grid size-5 shrink-0 place-items-center rounded-md text-[9px] font-bold text-white" style={{ backgroundColor: p.color }}>
                        {p.key.slice(0, 2)}
                      </span>
                      <span className="truncate">{p.name}</span>
                    </NavLink>
                  );
                })
              )}
            </NavGroup>
          </>
        )}
      </nav>

      {/* grid-cols-1 = minmax(0,1fr): a long email truncates instead of widening the sidebar. */}
      <div className="grid grid-cols-1 gap-1.5 border-t bg-sidebar/80 p-3 backdrop-blur-sm">
        <LanguageSwitcher className="justify-start" />
        <UserMenu user={user} />
      </div>

      <NewProjectDialog workspaceSlug={workspace.slug} open={newProjectOpen} onOpenChange={setNewProjectOpen} />
    </div>
  );
}

/** A labelled block of links (unlabelled for the first one). */
function NavGroup({ label, action, children }: { label?: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="mt-4 first:mt-1">
      {label && (
        <div className="mb-1 flex h-6 items-center justify-between ps-3 pe-1">
          <span className="text-[11px] font-semibold tracking-wider text-muted-foreground/80 uppercase">{label}</span>
          {action}
        </div>
      )}
      <div className="grid gap-0.5">{children}</div>
    </div>
  );
}

function NavLink({
  href,
  active,
  onNavigate,
  icon: Icon,
  badge,
  children,
}: {
  href: string;
  active: boolean;
  onNavigate?: () => void;
  icon?: typeof Bell;
  badge?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      onClick={onNavigate}
      aria-current={active ? "page" : undefined}
      className={cn(
        "group relative flex h-9 items-center gap-3 rounded-lg px-3 text-sm text-sidebar-foreground/85 transition-colors",
        "hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
        "focus-visible:outline-2 focus-visible:outline-ring",
        active && "bg-linear-to-r from-primary/15 to-primary/5 font-semibold text-primary hover:text-primary rtl:bg-linear-to-l dark:from-primary/20 dark:to-primary/5",
      )}
    >
      {active && <span aria-hidden className="absolute inset-y-1.5 start-0 w-[3px] rounded-full bg-brand-accent" />}
      {Icon && (
        <Icon
          aria-hidden
          className={cn("size-[18px] shrink-0 transition-colors", active ? "text-primary" : "text-muted-foreground group-hover:text-sidebar-accent-foreground")}
        />
      )}
      {children}
      {badge}
    </Link>
  );
}

function WorkspaceSwitcher({
  workspace,
  workspaces,
}: Pick<ShellProps, "workspace" | "workspaces">) {
  const t = useT();
  const role = workspace.role === "owner" ? t("Owner") : workspace.role === "admin" ? t("Admin") : t("Member");
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button className="flex w-full items-center gap-2.5 rounded-xl border bg-card px-2.5 py-2 text-start shadow-xs transition-colors hover:border-primary/30 hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring">
          <span
            aria-hidden
            className="grid size-8 shrink-0 place-items-center rounded-lg bg-brand text-xs font-bold text-white"
          >
            {initials(workspace.name)}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm leading-tight font-semibold">{workspace.name}</span>
            <span className="block truncate text-xs text-muted-foreground">{role}</span>
          </span>
          <ChevronsUpDown className="size-4 shrink-0 text-muted-foreground" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-60">
        <DropdownMenuLabel className="text-xs text-muted-foreground">{t("Workspaces")}</DropdownMenuLabel>
        {workspaces.map((w) => (
          <DropdownMenuItem key={w.id} asChild>
            <Link href={`/w/${w.slug}`}>
              <span aria-hidden className="grid size-6 shrink-0 place-items-center rounded-md bg-primary/10 text-[10px] font-bold text-primary">
                {initials(w.name)}
              </span>
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
        <button className="flex w-full items-center gap-2.5 rounded-xl border bg-card px-2.5 py-2 text-start shadow-xs transition-colors hover:border-primary/30 hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring">
          <Avatar className="size-8 ring-2 ring-primary/20 ring-offset-2 ring-offset-card">
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
