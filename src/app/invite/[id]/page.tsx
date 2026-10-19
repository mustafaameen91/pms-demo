import type { Metadata } from "next";
import { getInvitation } from "@/lib/data/members";
import { getSession } from "@/lib/auth/session";
import { getT } from "@/i18n/server";
import { redirect } from "next/navigation";
import { Logo } from "@/components/logo";
import { AcceptInvitation } from "./accept-invitation";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t("Invitation") };
}

export default async function InvitePage({ params }: PageProps<"/invite/[id]">) {
  const { id } = await params;
  const session = await getSession();
  if (!session) redirect(`/login?next=/invite/${id}`);
  const invite = await getInvitation(id);

  const expired = invite && new Date(invite.expiresAt) < new Date();
  const state = !invite
    ? "missing"
    : invite.status !== "pending"
      ? "used"
      : expired
        ? "expired"
        : invite.email.toLowerCase() !== session.user.email.toLowerCase()
          ? "wrong-account"
          : "ok";

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center bg-muted/40 px-4 py-12">
      <div className="mb-8">
        <Logo />
      </div>
      <div className="w-full max-w-md rounded-xl border bg-card p-6 text-center shadow-sm sm:p-8">
        <AcceptInvitation
          state={state}
          invitationId={id}
          workspaceName={invite?.workspaceName ?? ""}
          workspaceSlug={invite?.workspaceSlug ?? ""}
          inviterName={invite?.inviterName ?? null}
          role={invite?.role ?? "member"}
          invitedEmail={invite?.email ?? ""}
          currentEmail={session.user.email}
          alreadyAccepted={invite?.status === "accepted"}
        />
      </div>
    </main>
  );
}
