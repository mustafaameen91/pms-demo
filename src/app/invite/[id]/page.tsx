import type { Metadata } from "next";
import { getInvitation } from "@/lib/data/members";
import { getSession } from "@/lib/auth/session";
import { getT } from "@/i18n/server";
import { redirect } from "next/navigation";
import { Logo } from "@/components/logo";
import { AcceptInvitation } from "./accept-invitation";
import { MailOpen } from "lucide-react";
import { BrandBackdrop } from "@/components/auth/brand-panel";
import { GradientIcon } from "@/components/page/kit";

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
    <BrandBackdrop
      band={
        <div className="flex justify-center">
          <Logo onDark className="text-white" />
        </div>
      }
    >
      <div className="mx-auto flex w-full max-w-md flex-col items-center rounded-2xl border bg-card p-6 text-center shadow-xl shadow-primary/5 sm:p-8">
        <GradientIcon icon={MailOpen} className="mb-5 size-14 [&_svg]:size-6" />
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
    </BrandBackdrop>
  );
}
