"use client";

import { useState, useTransition } from "react";
import { Copy, Info, Loader2, Mail, Trash2, UserPlus, X } from "lucide-react";
import { toast } from "sonner";
import { cancelInvitation, changeMemberRole, inviteMember, removeMember } from "@/lib/actions/members";
import { cn, formatDate } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FieldError } from "@/components/projects/project-fields";
import { nativeSelectClass } from "@/components/resources/resource-fields";
import { UserAvatar } from "@/components/tasks/task-bits";

type Member = {
  memberId: string;
  userId: string;
  name: string;
  email: string;
  image: string | null;
  role: string;
  joinedAt: Date;
};
type Invite = { id: string; email: string; role: string | null; expiresAt: Date; inviterName: string | null };

const ROLE_LABEL: Record<string, string> = { owner: "Owner", admin: "Admin", member: "Member" };
const ROLE_HELP: Record<string, string> = {
  owner: "Full control, including other owners and deleting the workspace",
  admin: "Manage members, all projects and settings",
  member: "Work on projects; manage projects they lead",
};

export function MembersView({
  workspace,
  currentUserId,
  members,
  invitations,
  canManage,
  emailEnabled,
  appOrigin,
}: {
  workspace: { slug: string; name: string; role: string };
  currentUserId: string;
  members: Member[];
  invitations: Invite[];
  canManage: boolean;
  emailEnabled: boolean;
  appOrigin: string;
}) {
  const [pending, startTransition] = useTransition();
  const [confirmRemove, setConfirmRemove] = useState<string | null>(null);
  const isOwner = workspace.role === "owner";

  const run = (fn: () => Promise<{ ok: boolean; error?: string }>, success: string) =>
    startTransition(async () => {
      const result = await fn();
      if (result.ok) toast.success(success);
      else toast.error(result.error);
    });

  async function copyLink(id: string) {
    const link = `${appOrigin}/invite/${id}`;
    try {
      await navigator.clipboard.writeText(link);
      toast.success("Invite link copied");
    } catch {
      toast(link, { description: "Copy this link and send it to the person you invited." });
    }
  }

  return (
    <div className="grid grid-cols-1 gap-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Members</h1>
        <p className="text-sm text-muted-foreground">
          {members.length} {members.length === 1 ? "person" : "people"} in {workspace.name}.
        </p>
      </div>

      {canManage && <InviteForm slug={workspace.slug} emailEnabled={emailEnabled} />}

      {canManage && invitations.length > 0 && (
        <section aria-labelledby="pending-heading" className="overflow-hidden rounded-xl border bg-card">
          <h2 id="pending-heading" className="border-b px-4 py-3 font-semibold">
            Pending invitations <span className="text-xs font-normal text-muted-foreground">{invitations.length}</span>
          </h2>
          <ul className="divide-y">
            {invitations.map((inv) => (
              <li key={inv.id} className="flex flex-wrap items-center gap-3 px-4 py-3 text-sm">
                <Mail className="size-4 text-muted-foreground" aria-hidden />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{inv.email}</p>
                  <p className="text-xs text-muted-foreground">
                    {ROLE_LABEL[inv.role ?? "member"]} · invited by {inv.inviterName ?? "someone"} · expires{" "}
                    {formatDate(new Date(inv.expiresAt).toISOString().slice(0, 10))}
                  </p>
                </div>
                <Button variant="outline" size="sm" onClick={() => copyLink(inv.id)}>
                  <Copy className="size-4" />
                  Copy invite link
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={pending}
                  onClick={() => run(() => cancelInvitation(workspace.slug, inv.id), "Invitation cancelled")}
                  aria-label={`Cancel invitation for ${inv.email}`}
                >
                  <X className="size-4" />
                  Cancel
                </Button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section aria-labelledby="members-heading" className="overflow-hidden rounded-xl border bg-card">
        <h2 id="members-heading" className="border-b px-4 py-3 font-semibold">
          People
        </h2>
        <ul className="divide-y">
          {members.map((m) => {
            const isSelf = m.userId === currentUserId;
            // Owners can change anyone; admins can't touch owners or make new ones.
            const canEdit = canManage && !isSelf && (isOwner || m.role !== "owner");
            return (
              <li key={m.memberId} className="flex flex-wrap items-center gap-3 px-4 py-3 text-sm">
                <UserAvatar name={m.name} image={m.image} className="size-8" />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">
                    {m.name} {isSelf && <span className="font-normal text-muted-foreground">(you)</span>}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">
                    {m.email} · joined {formatDate(new Date(m.joinedAt).toISOString().slice(0, 10))}
                  </p>
                </div>
                {canEdit ? (
                  <>
                    <label htmlFor={`role-${m.memberId}`} className="sr-only">
                      Role for {m.name}
                    </label>
                    <select
                      id={`role-${m.memberId}`}
                      value={m.role}
                      disabled={pending}
                      onChange={(e) =>
                        run(() => changeMemberRole(workspace.slug, m.memberId, e.target.value), `${m.name} is now ${ROLE_LABEL[e.target.value]}`)
                      }
                      className={cn(nativeSelectClass, "w-32")}
                      title={ROLE_HELP[m.role]}
                    >
                      {(isOwner ? ["owner", "admin", "member"] : ["admin", "member"]).map((r) => (
                        <option key={r} value={r}>
                          {ROLE_LABEL[r]}
                        </option>
                      ))}
                    </select>
                    <Button
                      variant={confirmRemove === m.memberId ? "destructive" : "ghost"}
                      size="sm"
                      disabled={pending}
                      onClick={() => {
                        if (confirmRemove !== m.memberId) {
                          setConfirmRemove(m.memberId);
                          return;
                        }
                        setConfirmRemove(null);
                        run(() => removeMember(workspace.slug, m.memberId), `${m.name} removed`);
                      }}
                      aria-label={confirmRemove === m.memberId ? `Confirm removing ${m.name}` : `Remove ${m.name}`}
                    >
                      <Trash2 className="size-4" />
                      {confirmRemove === m.memberId ? "Click again to remove" : "Remove"}
                    </Button>
                  </>
                ) : (
                  <span className="rounded-full border px-2 py-0.5 text-xs" title={ROLE_HELP[m.role]}>
                    {ROLE_LABEL[m.role] ?? m.role}
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      </section>

      <dl className="grid gap-2 rounded-xl border p-4 text-sm sm:grid-cols-3">
        {Object.entries(ROLE_HELP).map(([role, help]) => (
          <div key={role}>
            <dt className="font-medium">{ROLE_LABEL[role]}</dt>
            <dd className="text-xs text-muted-foreground">{help}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

function InviteForm({ slug, emailEnabled }: { slug: string; emailEnabled: boolean }) {
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"member" | "admin">("member");
  const [error, setError] = useState<string>();
  const [pending, startTransition] = useTransition();

  return (
    <section aria-labelledby="invite-heading" className="rounded-xl border bg-card p-5">
      <h2 id="invite-heading" className="flex items-center gap-2 font-semibold">
        <UserPlus className="size-4 text-muted-foreground" aria-hidden />
        Invite someone
      </h2>
      <form
        className="mt-4 flex flex-wrap items-start gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          setError(undefined);
          startTransition(async () => {
            const result = await inviteMember(slug, { email, role });
            if (!result.ok) {
              setError(result.error);
              return;
            }
            toast.success(emailEnabled ? `Invitation emailed to ${email}` : `Invitation created for ${email} — copy the link below`);
            setEmail("");
          });
        }}
      >
        <div className="grid min-w-56 flex-1 gap-1.5">
          <Label htmlFor="invite-email">Email</Label>
          <Input
            id="invite-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="name@company.com"
            required
            aria-invalid={Boolean(error)}
          />
          <FieldError message={error} />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="invite-role">Role</Label>
          <select id="invite-role" value={role} onChange={(e) => setRole(e.target.value as "member" | "admin")} className={cn(nativeSelectClass, "w-32")}>
            <option value="member">Member</option>
            <option value="admin">Admin</option>
          </select>
        </div>
        <Button type="submit" disabled={pending} className="sm:mt-6">
          {pending && <Loader2 className="size-4 animate-spin" />}
          Invite
        </Button>
      </form>
      {!emailEnabled && (
        <p className="mt-3 flex gap-2 rounded-md bg-muted px-3 py-2 text-xs text-muted-foreground">
          <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden />
          Email sending isn&apos;t set up yet, so invitations are not emailed. After inviting, use “Copy invite link”
          and send the link yourself (e.g. by WhatsApp). The invited person must sign up or log in with the same email.
        </p>
      )}
    </section>
  );
}
