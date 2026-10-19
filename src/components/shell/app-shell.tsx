"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import {
  AlertTriangle,
  Bell,
  CreditCard,
  ScrollText,
  ShieldCheck,
  Check,
  ChevronsUpDown,
  FolderKanban,
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

type ShellProps = {
  user: { name: string; email: string; image: string | null };
  workspace: { id: string; name: string; slug: string; role: string };
  workspaces: { id: string; name: string; slug: string }[];
  projects: { id: string; name: string; key: string; color: string }[];
  unread: number;
  access: AccessState;
  isPlatformAdmin: boolean;
  children: React.ReactNode;
};

export function AppShell(props: ShellProps) {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <div className="flex min-h-dvh">
      <aside className="sticky top-0 hidden h-dvh w-60 shrink-0 border-r bg-sidebar text-sidebar-foreground lg:flex">
        <SidebarContent {...props} />
      </aside>

      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetContent side="left" className="w-64 bg-sidebar p-0">
          <SheetTitle className="sr-only">Navigation</SheetTitle>
          <SidebarContent {...props} onNavigate={() => setMobileOpen(false)} />
        </SheetContent>
      </Sheet>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-12 items-center gap-2 border-b px-3 lg:hidden">
          <Button
            variant="ghost"
            size="icon"
            className="relative"
            onClick={() => setMobileOpen(true)}
            aria-label={props.unread > 0 ? `Open navigation, ${props.unread} unread notifications` : "Open navigation"}
          >
            <Menu className="size-5" />
            {props.unread > 0 && <span aria-hidden className="absolute top-1.5 right-1.5 size-2 rounded-full bg-primary" />}
          </Button>
          <span className="truncate text-sm font-medium">{props.workspace.name}</span>
        </header>
        <SubscriptionBanner access={props.access} billingHref={`/w/${props.workspace.slug}/billing`} />
        <main id="main" className="flex min-w-0 flex-1 flex-col">
          {props.children}
        </main>
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
  access,
  isPlatformAdmin,
  onNavigate,
}: Omit<ShellProps, "children"> & { onNavigate?: () => void }) {
  const pathname = usePathname();
  const base = `/w/${workspace.slug}`;
  const [newProjectOpen, setNewProjectOpen] = useState(false);

  return (
    <div className="flex h-full w-full flex-col">
      <div className="p-2">
        <WorkspaceSwitcher workspace={workspace} workspaces={workspaces} />
      </div>

      <nav aria-label="Main" className="flex-1 overflow-y-auto px-2 pb-2">
        {!access.allowed ? (
          <>
            <NavLink href={`${base}/billing`} active={pathname.startsWith(`${base}/billing`)} onNavigate={onNavigate}>
              <CreditCard className="size-4" />
              Billing
            </NavLink>
            {isPlatformAdmin && (
              <NavLink href="/admin" active={pathname.startsWith("/admin")} onNavigate={onNavigate}>
                <ShieldCheck className="size-4" />
                Platform admin
              </NavLink>
            )}
          </>
        ) : (
        <>
        <NavLink href={`${base}/inbox`} active={pathname.startsWith(`${base}/inbox`)} onNavigate={onNavigate}>
          <Bell className="size-4" />
          Inbox
          {unread > 0 && (
            <span className="ml-auto rounded-full bg-primary px-1.5 text-xs font-semibold text-primary-foreground tabular-nums">
              {unread > 99 ? "99+" : unread}
              <span className="sr-only"> unread</span>
            </span>
          )}
        </NavLink>
        <NavLink href={`${base}/dashboard`} active={pathname.startsWith(`${base}/dashboard`)} onNavigate={onNavigate}>
          <LayoutDashboard className="size-4" />
          Dashboard
        </NavLink>
        <NavLink href={base} active={pathname === base} onNavigate={onNavigate}>
          <FolderKanban className="size-4" />
          Projects
        </NavLink>
        <NavLink href={`${base}/resources`} active={pathname.startsWith(`${base}/resources`)} onNavigate={onNavigate}>
          <Package className="size-4" />
          Resources
        </NavLink>
        <NavLink href={`${base}/templates`} active={pathname.startsWith(`${base}/templates`)} onNavigate={onNavigate}>
          <LayoutTemplate className="size-4" />
          Templates
        </NavLink>
        <NavLink href={`${base}/members`} active={pathname.startsWith(`${base}/members`)} onNavigate={onNavigate}>
          <Users className="size-4" />
          Members
        </NavLink>
        {(workspace.role === "owner" || workspace.role === "admin") && (
          <NavLink href={`${base}/audit`} active={pathname.startsWith(`${base}/audit`)} onNavigate={onNavigate}>
            <ScrollText className="size-4" />
            Audit log
          </NavLink>
        )}
        {(workspace.role === "owner" || workspace.role === "admin") && (
          <NavLink href={`${base}/billing`} active={pathname.startsWith(`${base}/billing`)} onNavigate={onNavigate}>
            <CreditCard className="size-4" />
            Billing
          </NavLink>
        )}
        {isPlatformAdmin && (
          <NavLink href="/admin" active={pathname.startsWith("/admin")} onNavigate={onNavigate}>
            <ShieldCheck className="size-4" />
            Platform admin
          </NavLink>
        )}

        <div className="mt-5 mb-1 flex items-center justify-between pl-2.5 pr-1">
          <span className="text-xs font-medium text-muted-foreground">Your projects</span>
          <Button
            variant="ghost"
            size="icon"
            className="size-7"
            onClick={() => setNewProjectOpen(true)}
            aria-label="New project"
          >
            <Plus className="size-4" />
          </Button>
        </div>
        {projects.length === 0 ? (
          <p className="px-2.5 py-1 text-xs text-muted-foreground">No projects yet.</p>
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

      <div className="border-t p-2">
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
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button className="flex h-10 w-full items-center gap-2 rounded-md px-2 text-left hover:bg-sidebar-accent focus-visible:outline-2 focus-visible:outline-ring">
          <Logo compact />
          <span className="flex-1 truncate text-sm font-semibold">{workspace.name}</span>
          <ChevronsUpDown className="size-4 text-muted-foreground" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-56">
        <DropdownMenuLabel className="text-xs text-muted-foreground">Workspaces</DropdownMenuLabel>
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
            Create workspace
          </Link>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function UserMenu({ user }: Pick<ShellProps, "user">) {
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
        <button className="flex h-10 w-full items-center gap-2 rounded-md px-2 text-left hover:bg-sidebar-accent focus-visible:outline-2 focus-visible:outline-ring">
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
        <DropdownMenuLabel className="text-xs text-muted-foreground">Theme</DropdownMenuLabel>
        <DropdownMenuRadioGroup value={theme} onValueChange={setTheme}>
          <DropdownMenuRadioItem value="light">
            <Sun className="size-4" /> Light
          </DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="dark">
            <Moon className="size-4" /> Dark
          </DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="system">
            <Monitor className="size-4" /> System
          </DropdownMenuRadioItem>
        </DropdownMenuRadioGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={handleSignOut} variant="destructive">
          <LogOut className="size-4" />
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function SubscriptionBanner({ access, billingHref }: { access: AccessState; billingHref: string }) {
  if (access.allowed && access.kind === "complimentary") return null;
  if (access.allowed && !access.endingSoon && access.kind === "active") return null;
  const locked = !access.allowed;
  const text = !access.allowed
    ? access.kind === "pending"
      ? "This workspace is waiting for payment. Projects open once the subscription is activated."
      : access.kind === "expired"
        ? "The subscription has ended, so this workspace is locked. Your data is safe — renew to continue."
        : "This workspace's subscription was cancelled."
    : access.kind === "trial"
      ? `Trial: ${access.daysLeft} ${access.daysLeft === 1 ? "day" : "days"} left.`
      : access.daysLeft === 0
        ? "The subscription ends today."
        : `The subscription ends in ${access.daysLeft} ${access.daysLeft === 1 ? "day" : "days"}.`;
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
        {locked ? "Billing & payment" : "Renew"}
      </Link>
    </div>
  );
}
