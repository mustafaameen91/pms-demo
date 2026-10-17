"use client";

import { startTransition, useActionState, useState, useTransition } from "react";
import { Archive, Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
  changeProjectKey,
  deleteProject,
  setProjectArchived,
  updateProject,
} from "@/lib/actions/projects";
import { PROJECT_STATUSES } from "@/lib/constants";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { FieldError, ProjectFields, type ProjectFieldValues } from "./project-fields";

type SettingsProject = ProjectFieldValues & {
  id: string;
  key: string;
  status: string;
  leadId: string | null;
  archived: boolean;
};

const selectClass =
  "h-8 w-full rounded-lg border border-input bg-transparent px-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50 dark:bg-input/30";

export function ProjectSettings({
  project,
  members,
  canManage,
  canDelete,
}: {
  project: SettingsProject;
  members: { id: string; name: string }[];
  canManage: boolean;
  canDelete: boolean;
}) {
  return (
    <div className="grid gap-8">
      {!canManage && (
        <p role="status" className="rounded-lg border bg-muted px-4 py-3 text-sm">
          You can view these settings. Only workspace admins and the project manager can change them.
        </p>
      )}
      <DetailsSection project={project} members={members} canManage={canManage} />
      {canManage && <KeySection project={project} />}
      {(canManage || canDelete) && (
        <DangerZone project={project} canArchive={canManage} canDelete={canDelete} />
      )}
    </div>
  );
}

function Section({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border bg-card p-5 sm:p-6">
      <h2 className="font-semibold">{title}</h2>
      {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
      <div className="mt-5">{children}</div>
    </section>
  );
}

function DetailsSection({
  project,
  members,
  canManage,
}: {
  project: SettingsProject;
  members: { id: string; name: string }[];
  canManage: boolean;
}) {
  const [state, action, pending] = useActionState(updateProject, undefined);
  const errors = state?.fieldErrors ?? {};

  return (
    <Section title="Project details">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          const data = new FormData(e.currentTarget);
          startTransition(() => action(data));
        }}
      >
        <fieldset disabled={!canManage} className="grid gap-4">
          <input type="hidden" name="projectId" value={project.id} />

          <div className="grid items-start gap-4 sm:grid-cols-2">
            <div className="grid gap-1.5">
              <Label htmlFor="project-status">Status</Label>
              <select id="project-status" name="status" defaultValue={project.status} className={selectClass}>
                {PROJECT_STATUSES.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="project-lead">Project manager</Label>
              <select id="project-lead" name="leadId" defaultValue={project.leadId ?? ""} className={selectClass}>
                <option value="">No manager</option>
                {members.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </select>
              <FieldError message={errors.leadId} />
            </div>
          </div>

          <ProjectFields defaults={project} errors={errors} />

          {state?.error && <FieldError message={state.error} />}

          {canManage && (
            <div className="flex items-center justify-end gap-3">
              {state?.saved && !pending && (
                <span role="status" className="text-sm text-primary">
                  Changes saved
                </span>
              )}
              <Button type="submit" disabled={pending}>
                {pending && <Loader2 className="size-4 animate-spin" />}
                Save changes
              </Button>
            </div>
          )}
        </fieldset>
      </form>
    </Section>
  );
}

function KeySection({ project }: { project: SettingsProject }) {
  const [key, setKey] = useState(project.key);
  const [error, setError] = useState<string>();
  const [pending, startKeyTransition] = useTransition();

  return (
    <Section
      title="Project key"
      description={`Used in task IDs (${project.key}-1, ${project.key}-2…). Changing it renames every task ID and breaks old links.`}
    >
      <form
        className="flex flex-wrap items-start gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          setError(undefined);
          startKeyTransition(async () => {
            const result = await changeProjectKey(project.id, key);
            if (result && !result.ok) setError(result.error);
          });
        }}
      >
        <div className="grid gap-1.5">
          <Label htmlFor="settings-key" className="sr-only">
            Project key
          </Label>
          <Input
            id="settings-key"
            value={key}
            onChange={(e) => setKey(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6))}
            className="w-32 font-mono uppercase"
            aria-invalid={Boolean(error)}
          />
          <FieldError message={error} />
        </div>
        <Button type="submit" variant="outline" disabled={pending || key === project.key || key.length < 2}>
          {pending && <Loader2 className="size-4 animate-spin" />}
          Change key
        </Button>
      </form>
    </Section>
  );
}

function DangerZone({
  project,
  canArchive,
  canDelete,
}: {
  project: SettingsProject;
  canArchive: boolean;
  canDelete: boolean;
}) {
  const [archiving, startArchive] = useTransition();
  const [deleteOpen, setDeleteOpen] = useState(false);

  return (
    <section className="rounded-xl border border-destructive/40 p-5 sm:p-6">
      <h2 className="font-semibold text-destructive">Danger zone</h2>
      <div className="mt-4 grid gap-4">
        {canArchive && (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-sm font-medium">{project.archived ? "Restore project" : "Archive project"}</p>
              <p className="text-sm text-muted-foreground">
                {project.archived
                  ? "Show it in the project list again."
                  : "Hide it from the project list. Nothing is deleted and you can restore it anytime."}
              </p>
            </div>
            <Button
              variant="outline"
              disabled={archiving}
              onClick={() =>
                startArchive(async () => {
                  const result = await setProjectArchived(project.id, !project.archived);
                  if (result && !result.ok) toast.error(result.error);
                  else if (result?.ok) toast.success("Project restored");
                })
              }
            >
              {archiving ? <Loader2 className="size-4 animate-spin" /> : <Archive className="size-4" />}
              {project.archived ? "Restore" : "Archive"}
            </Button>
          </div>
        )}

        {canDelete && (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-sm font-medium">Delete project</p>
              <p className="text-sm text-muted-foreground">
                Permanently deletes the project and all its tasks and history. This can&apos;t be undone.
              </p>
            </div>
            <Button variant="destructive" onClick={() => setDeleteOpen(true)}>
              <Trash2 className="size-4" />
              Delete
            </Button>
          </div>
        )}
      </div>

      <DeleteDialog project={project} open={deleteOpen} onOpenChange={setDeleteOpen} />
    </section>
  );
}

function DeleteDialog({
  project,
  open,
  onOpenChange,
}: {
  project: SettingsProject;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string>();
  const [pending, startDelete] = useTransition();

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        onOpenChange(o);
        if (!o) {
          setConfirm("");
          setError(undefined);
        }
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Delete “{project.name}”?</DialogTitle>
          <DialogDescription>
            All tasks, history and settings of this project will be permanently deleted. If you might need it
            later, archive it instead.
          </DialogDescription>
        </DialogHeader>
        <form
          className="grid gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            startDelete(async () => {
              const result = await deleteProject(project.id, confirm);
              if (result && !result.ok) setError(result.error);
            });
          }}
        >
          <div className="grid gap-1.5">
            <Label htmlFor="delete-confirm">
              Type <span className="font-mono font-semibold">{project.key}</span> to confirm
            </Label>
            <Input
              id="delete-confirm"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              autoComplete="off"
              className="font-mono uppercase"
            />
            <FieldError message={error} />
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button
              type="submit"
              variant="destructive"
              disabled={pending || confirm.trim().toUpperCase() !== project.key}
            >
              {pending && <Loader2 className="size-4 animate-spin" />}
              Delete project
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
