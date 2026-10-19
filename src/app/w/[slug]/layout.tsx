import { after } from "next/server";
import { getUserWorkspaces, requireMembership } from "@/lib/auth/session";
import { getWorkspaceAccess, isSuperAdmin } from "@/lib/billing";
import { listProjects } from "@/lib/data/projects";
import { unreadCount } from "@/lib/data/notifications";
import { listPendingApprovals } from "@/lib/data/expenses";
import { ensureLateTaskNotifications } from "@/lib/notifications";
import { sweepLateTaskAutomations } from "@/lib/automation-runner";
import { chosenLocale, syncUserLocale } from "@/lib/locale-sync";
import { AppShell } from "@/components/shell/app-shell";

export default async function WorkspaceLayout({ children, params }: LayoutProps<"/w/[slug]">) {
  const { slug } = await params;
  const { user, workspace } = await requireMembership(slug);
  const access = await getWorkspaceAccess(workspace.id);
  // No background scheduler: late-task reminders are created when the app is opened.
  if (access.allowed) {
    await ensureLateTaskNotifications(user.id, workspace.id);
    // "Task becomes late" automations: after the page is sent, so they never slow it down.
    after(() => sweepLateTaskAutomations(workspace.id));
    const chosen = await chosenLocale();
    after(() => syncUserLocale(user.id, chosen));
  }
  const isAdmin = workspace.role === "owner" || workspace.role === "admin";
  const [workspaces, projects, unread, approvals] = await Promise.all([
    getUserWorkspaces(user.id),
    // A locked workspace shows no project data in the sidebar.
    access.allowed ? listProjects(workspace.id) : [],
    access.allowed ? unreadCount(user.id, workspace.id) : 0,
    access.allowed ? listPendingApprovals(workspace.id, user.id, isAdmin) : [],
  ]);

  return (
    <AppShell
      user={{ name: user.name, email: user.email, image: user.image ?? null }}
      workspace={workspace}
      workspaces={workspaces}
      projects={projects.map((p) => ({ id: p.id, name: p.name, key: p.key, color: p.color }))}
      unread={unread}
      approvals={approvals.filter((a) => a.requesterId !== user.id).length}
      access={access}
      isPlatformAdmin={isSuperAdmin(user.email)}
    >
      {children}
    </AppShell>
  );
}
