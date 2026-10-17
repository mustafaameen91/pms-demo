import { getUserWorkspaces, requireWorkspace } from "@/lib/auth/session";
import { listProjects } from "@/lib/data/projects";
import { AppShell } from "@/components/shell/app-shell";

export default async function WorkspaceLayout({ children, params }: LayoutProps<"/w/[slug]">) {
  const { slug } = await params;
  const { user, workspace } = await requireWorkspace(slug);
  const [workspaces, projects] = await Promise.all([
    getUserWorkspaces(user.id),
    listProjects(workspace.id),
  ]);

  return (
    <AppShell
      user={{ name: user.name, email: user.email, image: user.image ?? null }}
      workspace={workspace}
      workspaces={workspaces}
      projects={projects.map((p) => ({ id: p.id, name: p.name, key: p.key, color: p.color }))}
    >
      {children}
    </AppShell>
  );
}
