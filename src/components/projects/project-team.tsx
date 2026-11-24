"use client";

import { useState, useTransition } from "react";
import { Loader2, Plus, Trash2, Users } from "lucide-react";
import { toast } from "sonner";
import { addProjectMember, removeProjectMember } from "@/lib/actions/project-team";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { UserAvatar } from "@/components/tasks/task-bits";
import { nativeSelectClass } from "@/components/resources/resource-fields";
import { useT } from "@/i18n/client";
import { SelectBox } from "@/components/ui/select-box";

type Person = { id: string; name: string; email: string; role: string };

/** Who can see and work in this project. Owners and admins always can. */
export function ProjectTeam({
  projectId,
  leadId,
  team,
  candidates,
}: {
  projectId: string;
  leadId: string | null;
  team: Person[];
  /** Workspace members who aren't on the team yet (owners/admins excluded — they see every project). */
  candidates: Person[];
}) {
  const t = useT();
  const [adding, setAdding] = useState("");
  const [confirm, setConfirm] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const run = (fn: () => Promise<{ ok: boolean; error?: string }>, success: string, after?: () => void) =>
    startTransition(async () => {
      const r = await fn();
      if (!r.ok) return void toast.error(r.error);
      toast.success(success);
      after?.();
    });

  return (
    <section aria-labelledby="team-heading" className="rounded-2xl border bg-card p-5 sm:p-6">
      <h2 id="team-heading" className="flex items-center gap-2.5 font-semibold">
        <span aria-hidden className="grid size-8 place-items-center rounded-lg bg-primary/10 text-primary">
          <Users className="size-4" />
        </span>
        {t("Project team")}
      </h2>
      <p className="mt-1 text-sm text-muted-foreground">
        {t("Members only see the projects they're on. Assigning someone a task adds them automatically. Owners and admins see every project.")}
      </p>

      <ul className="mt-4 grid divide-y overflow-hidden rounded-xl border">
        {team.length === 0 && <li className="px-3 py-3 text-sm text-muted-foreground">{t("Nobody on the team yet.")}</li>}
        {team.map((p) => (
          <li key={p.id} className="flex flex-wrap items-center gap-2 px-3 py-2 text-sm">
            <UserAvatar name={p.name} className="size-6" />
            <span className="min-w-0 flex-1">
              <span className="block truncate font-medium">{p.name}</span>
              <span className="block truncate text-xs text-muted-foreground">{p.email}</span>
            </span>
            {p.id === leadId ? (
              <span className="rounded-full border px-2 py-0.5 text-xs text-muted-foreground">{t("Project manager")}</span>
            ) : (
              <Button
                size="sm"
                variant={confirm === p.id ? "destructive" : "ghost"}
                disabled={pending}
                aria-label={confirm === p.id ? t("Confirm removing {name} from the team", { name: p.name }) : t("Remove {name} from the team", { name: p.name })}
                onBlur={() => setConfirm((c) => (c === p.id ? null : c))}
                onClick={() => {
                  if (confirm !== p.id) return setConfirm(p.id);
                  setConfirm(null);
                  run(() => removeProjectMember(projectId, p.id), t("{name} removed from the team", { name: p.name }));
                }}
              >
                <Trash2 className="size-4" />
                {confirm === p.id ? t("Remove from team") : t("Remove")}
              </Button>
            )}
          </li>
        ))}
      </ul>

      {candidates.length > 0 && (
        <form
          className="mt-4 flex flex-wrap items-end gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            const person = candidates.find((c) => c.id === adding);
            if (!person) return;
            run(() => addProjectMember(projectId, person.id), t("{name} added to the team", { name: person.name }), () => setAdding(""));
          }}
        >
          <div className="grid min-w-0 flex-1 gap-1.5">
            <Label htmlFor="team-add">{t("Add to the team")}</Label>
            <SelectBox id="team-add" value={adding} onValueChange={(v) => setAdding(v)} className={nativeSelectClass}>
              <option value="">{t("Choose a member…")}</option>
              {candidates.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} · {c.email}
                </option>
              ))}
            </SelectBox>
          </div>
          <Button type="submit" variant="outline" disabled={pending || !adding}>
            {pending ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
            {t("Add")}
          </Button>
        </form>
      )}
    </section>
  );
}
