import { after } from "next/server";
import { getUserWorkspaces, requireMembership } from "@/lib/auth/session";
import { getWorkspaceAccess, isSuperAdmin } from "@/lib/billing";
import { listProjects } from "@/lib/data/projects";
import { unreadCount } from "@/lib/data/notifications";
import { listPendingApprovals } from "@/lib/data/expenses";
import { ensureLateTaskNotifications } from "@/lib/notifications";
import { sweepLateTaskAutomations } from "@/lib/automation-runner";
import { ensureWeeklyReport } from "@/lib/weekly-report-server";
import { chosenLocale, syncUserLocale } from "@/lib/locale-sync";
import { AppShell } from "@/components/shell/app-shell";
import { visibleProjectIds } from "@/lib/data/project-access";
import { pendingLoanRequestCount } from "@/lib/data/loans";
import { hrAlertCount, syncHrExpiryNotifications } from "@/lib/hr-server";
import { pendingLeaveCount } from "@/lib/data/hr-ops";

export default async function WorkspaceLayout({ children, params }: LayoutProps<"/w/[slug]">) {
  const { slug } = await params;
  const { user, workspace } = await requireMembership(slug);
  const access = await getWorkspaceAccess(workspace.id);
  // No background scheduler: late-task reminders are created when the app is opened.
  if (access.allowed) {
    await ensureLateTaskNotifications(user.id, workspace.id);
    // "Task becomes late" automations: after the page is sent, so they never slow it down.
    after(() => sweepLateTaskAutomations(workspace.id));
    // Last week's report, the first time anyone opens the app after the week ends.
    after(() => ensureWeeklyReport(workspace.id));
    const chosen = await chosenLocale();
    after(() => syncUserLocale(user.id, chosen));
  }
  const isAdmin = workspace.role === "owner" || workspace.role === "admin";
  // HR papers expiring: an inbox reminder for owners/admins (before the unread count is read).
  if (access.allowed && isAdmin) await syncHrExpiryNotifications(user.id, workspace.id);
  const [workspaces, projects, unread, approvals, loanRequests, hrAlerts] = await Promise.all([
    getUserWorkspaces(user.id),
    // A locked workspace shows no project data in the sidebar.
    access.allowed ? listProjects(workspace.id, { only: await visibleProjectIds(workspace.id, user.id, workspace.role) }) : [],
    access.allowed ? unreadCount(user.id, workspace.id) : 0,
    access.allowed ? listPendingApprovals(workspace.id, user.id, isAdmin) : [],
    access.allowed && isAdmin ? pendingLoanRequestCount(workspace.id) : 0,
    access.allowed && isAdmin ? Promise.all([hrAlertCount(workspace.id), pendingLeaveCount(workspace.id)]).then(([a, b]) => a + b) : 0,
  ]);

  return (
    <AppShell
      user={{ name: user.name, email: user.email, image: user.image ?? null }}
      workspace={workspace}
      workspaces={workspaces}
      projects={projects.map((p) => ({ id: p.id, name: p.name, key: p.key, color: p.color }))}
      unread={unread}
      approvals={approvals.filter((a) => a.requesterId !== user.id).length}
      loanRequests={loanRequests}
      showReports={isAdmin || projects.some((p) => p.leadId === user.id)}
      hrAlerts={hrAlerts}
      access={access}
      isPlatformAdmin={isSuperAdmin(user.email)}
    >
      {children}
    </AppShell>
  );
}
