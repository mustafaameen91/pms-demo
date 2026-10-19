import { requireWorkspace } from "@/lib/auth/session";
import { listPendingInvitations, listWorkspaceMembers } from "@/lib/data/members";
import { emailDeliveryEnabled } from "@/lib/email";
import { MembersView } from "@/components/members/members-view";
import { getT } from "@/i18n/server";

export async function generateMetadata() {
  const t = await getT();
  return { title: t("Members") };
}

export default async function MembersPage({ params }: PageProps<"/w/[slug]/members">) {
  const { slug } = await params;
  const { user, workspace } = await requireWorkspace(slug);
  const canManage = workspace.role === "owner" || workspace.role === "admin";
  const [members, invitations] = await Promise.all([
    listWorkspaceMembers(workspace.id),
    canManage ? listPendingInvitations(workspace.id) : [],
  ]);

  return (
    <div className="w-full px-4 py-6 sm:px-6 lg:py-8">
      <MembersView
        workspace={{ slug: workspace.slug, name: workspace.name, role: workspace.role }}
        currentUserId={user.id}
        members={members}
        invitations={invitations}
        canManage={canManage}
        emailEnabled={emailDeliveryEnabled}
        appOrigin={process.env.BETTER_AUTH_URL ?? "http://localhost:3001"}
      />
    </div>
  );
}
