"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { authClient } from "@/lib/auth/client";
import { Button } from "@/components/ui/button";
import { useT } from "@/i18n/client";

export function AcceptInvitation(props: {
  state: "ok" | "missing" | "used" | "expired" | "wrong-account";
  invitationId: string;
  workspaceName: string;
  workspaceSlug: string;
  inviterName: string | null;
  role: string;
  invitedEmail: string;
  currentEmail: string;
  alreadyAccepted: boolean;
}) {
  const t = useT();
  const router = useRouter();
  const [pending, setPending] = useState<"accept" | "decline" | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (props.state !== "ok") {
    const messages = {
      missing: [t("Invitation not found"), t("This invitation link is not valid.")],
      used: props.alreadyAccepted
        ? [t("Already accepted"), t("This invitation to {workspace} was already accepted.", { workspace: props.workspaceName })]
        : [t("Invitation no longer valid"), t("It was cancelled or declined. Ask for a new invitation.")],
      expired: [t("Invitation expired"), t("Invitations are valid for 7 days. Ask for a new one.")],
      "wrong-account": [
        t("Different account"),
        t(
          "This invitation is for {invited}, but you're logged in as {current}. Log out and sign in (or sign up) with {invited}.",
          { invited: props.invitedEmail, current: props.currentEmail },
        ),
      ],
    } as const;
    const [title, text] = messages[props.state];
    return (
      <>
        <h1 className="text-xl font-semibold">{title}</h1>
        <p className="mt-2 text-sm text-muted-foreground">{text}</p>
        <div className="mt-6 flex justify-center gap-2">
          {props.state === "wrong-account" ? (
            <Button
              onClick={async () => {
                await authClient.signOut();
                router.replace(`/login?next=/invite/${props.invitationId}`);
              }}
            >
              {t("Log out")}
            </Button>
          ) : (
            <Button asChild>
              <Link href={props.alreadyAccepted ? `/w/${props.workspaceSlug}` : "/"}>{t("Go to PMS")}</Link>
            </Button>
          )}
        </div>
      </>
    );
  }

  async function respond(kind: "accept" | "decline") {
    setPending(kind);
    setError(null);
    const { error } =
      kind === "accept"
        ? await authClient.organization.acceptInvitation({ invitationId: props.invitationId })
        : await authClient.organization.rejectInvitation({ invitationId: props.invitationId });
    if (error) {
      setError(error.message ?? t("Something went wrong."));
      setPending(null);
      return;
    }
    router.replace(kind === "accept" ? `/w/${props.workspaceSlug}` : "/");
    router.refresh();
  }

  return (
    <>
      <h1 className="text-xl font-semibold">{t("Join {workspace}", { workspace: props.workspaceName })}</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        {t("{inviter} invited you to join as", { inviter: props.inviterName ?? t("Someone") })}{" "}
        <strong className="text-foreground">{t(props.role)}</strong>.
      </p>
      {error && (
        <p role="alert" className="mt-4 rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      )}
      <div className="mt-6 flex justify-center gap-2">
        <Button variant="ghost" disabled={pending !== null} onClick={() => respond("decline")}>
          {pending === "decline" && <Loader2 className="size-4 animate-spin" />}
          {t("Decline")}
        </Button>
        <Button disabled={pending !== null} onClick={() => respond("accept")}>
          {pending === "accept" && <Loader2 className="size-4 animate-spin" />}
          {t("Accept invitation")}
        </Button>
      </div>
    </>
  );
}
