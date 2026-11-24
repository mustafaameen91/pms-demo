"use client";

import { useState, useTransition } from "react";
import { Copy, Crown, Info, Loader2, Mail, ShieldCheck, Trash2, User as UserIcon, UserPlus, Users, X } from "lucide-react";
import { toast } from "sonner";
import { cancelInvitation, changeMemberRole, inviteMember, removeMember } from "@/lib/actions/members";
import { cn, formatDate } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FieldError } from "@/components/projects/project-fields";
import { nativeSelectClass } from "@/components/resources/resource-fields";
import { UserAvatar } from "@/components/tasks/task-bits";
import { useT } from "@/i18n/client";
import { SelectBox } from "@/components/ui/select-box";
import { PageHeader, PageShell, Panel, StatTile } from "@/components/page/kit";

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
const ROLE_ICON = { owner: Crown, admin: ShieldCheck, member: UserIcon } as const;
const ROLE_PILL: Record<string, string> = {
  owner: "border-amber-500/30 bg-amber-500/10 text-amber-800 dark:text-amber-300",
  admin: "border-primary/30 bg-primary/10 text-primary",
  member: "bg-muted text-muted-foreground",
};
function RolePill({ role, label, title }: { role: string; label: string; title?: string }) {
  const Icon = ROLE_ICON[role as keyof typeof ROLE_ICON] ?? UserIcon;
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium", ROLE_PILL[role] ?? ROLE_PILL.member)} title={title}>
      <Icon className="size-3.5" aria-hidden />
      {label}
    </span>
  );
}
/** English; translated at render. */
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
  const t = useT();
  const role = (r: string) => t(ROLE_LABEL[r] ?? r);
  const [pending, startTransition] = useTransition();
  const [confirmRemove, setConfirmRemove] = useState<string | null>(null);
  const isOwner = workspace.role === "owner";
  const owners = members.filter((m) => m.role === "owner").length;
  const admins = members.filter((m) => m.role === "admin").length;

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
      toast.success(t("Invite link copied"));
    } catch {
      toast(link, { description: t("Copy this link and send it to the person you invited.") });
    }
  }

  return (
    <PageShell>
      <PageHeader
        icon={Users}
        title={t("Members")}
        description={t.plural(members.length, "{count} person in {workspace}.", "{count} people in {workspace}.", { workspace: workspace.name })}
      />

      <dl className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile icon={Users} label={t("People")} value={members.length} hint={t("In this workspace")} />
        <StatTile icon={Crown} label={t("Owners")} value={owners} hint={t(ROLE_HELP.owner)} />
        <StatTile icon={ShieldCheck} label={t("Admins")} value={admins} hint={t(ROLE_HELP.admin)} />
        {canManage ? (
          <StatTile icon={Mail} label={t("Pending invitations")} value={invitations.length} hint={t("Waiting to be accepted")} />
        ) : (
          <StatTile icon={UserIcon} label={t("Members|role")} value={members.length - owners - admins} hint={t(ROLE_HELP.member)} />
        )}
      </dl>

      {canManage && <InviteForm slug={workspace.slug} emailEnabled={emailEnabled} />}

      {canManage && invitations.length > 0 && (
        <Panel id="pending-heading" title={t("Pending invitations")} icon={Mail} count={invitations.length}>
          <ul className="divide-y border-t">
            {invitations.map((inv) => (
              <li key={inv.id} className="flex flex-wrap items-center gap-3 px-5 py-3 text-sm transition-colors hover:bg-accent">
                <span aria-hidden className="grid size-9 place-items-center rounded-full border border-dashed bg-muted text-muted-foreground">
                  <Mail className="size-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{inv.email}</p>
                  <p className="text-xs text-muted-foreground">
                    {t("{role} · invited by {name} · expires {date}", {
                      role: role(inv.role ?? "member"),
                      name: inv.inviterName ?? t("someone"),
                      date: formatDate(new Date(inv.expiresAt).toISOString().slice(0, 10), t.intl),
                    })}
                  </p>
                </div>
                <Button variant="outline" size="sm" onClick={() => copyLink(inv.id)}>
                  <Copy className="size-4" />
                  {t("Copy invite link")}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={pending}
                  onClick={() => run(() => cancelInvitation(workspace.slug, inv.id), t("Invitation cancelled"))}
                  aria-label={t("Cancel invitation for {email}", { email: inv.email })}
                >
                  <X className="size-4" />
                  {t("Cancel")}
                </Button>
              </li>
            ))}
          </ul>
        </Panel>
      )}

      <Panel id="members-heading" title={t("People")} icon={Users} count={members.length}>
        <ul className="divide-y border-t">
          {members.map((m) => {
            const isSelf = m.userId === currentUserId;
            // Owners can change anyone; admins can't touch owners or make new ones.
            const canEdit = canManage && !isSelf && (isOwner || m.role !== "owner");
            return (
              <li key={m.memberId} className="flex flex-wrap items-center gap-3 px-5 py-3 text-sm transition-colors hover:bg-accent">
                <UserAvatar name={m.name} image={m.image} className="size-9" />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">
                    {m.name} {isSelf && <span className="font-normal text-muted-foreground">{t("(you)")}</span>}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">
                    {m.email} · {t("joined {date}", { date: formatDate(new Date(m.joinedAt).toISOString().slice(0, 10), t.intl) })}
                  </p>
                </div>
                {canEdit ? (
                  <>
                    <label htmlFor={`role-${m.memberId}`} className="sr-only">
                      {t("Role for {name}", { name: m.name })}
                    </label>
                    <SelectBox
                      id={`role-${m.memberId}`}
                      value={m.role}
                      disabled={pending}
                      onValueChange={(v) => run(() => changeMemberRole(workspace.slug, m.memberId, v), t("{name} is now {role}", { name: m.name, role: role(v) }))
                      }
                      className={cn(nativeSelectClass, "w-32")}
                      title={ROLE_HELP[m.role] && t(ROLE_HELP[m.role])}
                    >
                      {(isOwner ? ["owner", "admin", "member"] : ["admin", "member"]).map((r) => (
                        <option key={r} value={r}>
                          {role(r)}
                        </option>
                      ))}
                    </SelectBox>
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
                        run(() => removeMember(workspace.slug, m.memberId), t("{name} removed", { name: m.name }));
                      }}
                      aria-label={confirmRemove === m.memberId ? t("Confirm removing {name}", { name: m.name }) : t("Remove {name}", { name: m.name })}
                    >
                      <Trash2 className="size-4" />
                      {confirmRemove === m.memberId ? t("Click again to remove") : t("Remove")}
                    </Button>
                  </>
                ) : (
                  <RolePill role={m.role} label={role(m.role)} title={ROLE_HELP[m.role] && t(ROLE_HELP[m.role])} />
                )}
              </li>
            );
          })}
        </ul>
      </Panel>

      <dl className="grid gap-3 sm:grid-cols-3">
        {Object.entries(ROLE_HELP).map(([r, help]) => {
          const Icon = ROLE_ICON[r as keyof typeof ROLE_ICON];
          return (
            <div key={r} className="flex gap-3 rounded-2xl border bg-card p-4 text-sm">
              <span aria-hidden className={cn("grid size-9 shrink-0 place-items-center rounded-xl border", ROLE_PILL[r])}>
                <Icon className="size-4" />
              </span>
              <div>
                <dt className="font-semibold">{role(r)}</dt>
                <dd className="mt-0.5 text-xs text-muted-foreground">{t(help)}</dd>
              </div>
            </div>
          );
        })}
      </dl>
    </PageShell>
  );
}

function InviteForm({ slug, emailEnabled }: { slug: string; emailEnabled: boolean }) {
  const t = useT();
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"member" | "admin">("member");
  const [error, setError] = useState<string>();
  const [pending, startTransition] = useTransition();

  return (
    <section aria-labelledby="invite-heading" className="rounded-2xl border bg-card p-5">
      <h2 id="invite-heading" className="flex items-center gap-2 font-semibold">
        <UserPlus className="size-4 text-muted-foreground" aria-hidden />
        {t("Invite someone")}
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
            toast.success(
              emailEnabled
                ? t("Invitation emailed to {email}", { email })
                : t("Invitation created for {email} — copy the link below", { email }),
            );
            setEmail("");
          });
        }}
      >
        <div className="grid min-w-56 flex-1 gap-1.5">
          <Label htmlFor="invite-email">{t("Email")}</Label>
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
          <Label htmlFor="invite-role">{t("Role")}</Label>
          <SelectBox id="invite-role" value={role} onValueChange={(v) => setRole(v as "member" | "admin")} className={cn(nativeSelectClass, "w-32")}>
            <option value="member">{t("Member")}</option>
            <option value="admin">{t("Admin")}</option>
          </SelectBox>
        </div>
        <Button type="submit" disabled={pending} className="sm:mt-6">
          {pending && <Loader2 className="size-4 animate-spin" />}
          {t("Invite")}
        </Button>
      </form>
      {!emailEnabled && (
        <p className="mt-3 flex gap-2 rounded-xl bg-muted px-3 py-2 text-xs text-muted-foreground">
          <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden />
          {t(
            "Email sending isn't set up yet, so invitations are not emailed. After inviting, use “Copy invite link” and send the link yourself (e.g. by WhatsApp). The invited person must sign up or log in with the same email.",
          )}
        </p>
      )}
    </section>
  );
}
