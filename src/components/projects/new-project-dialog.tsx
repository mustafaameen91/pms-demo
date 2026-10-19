"use client";

import { startTransition, useActionState, useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { createProject } from "@/lib/actions/projects";
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
import { FieldError, ProjectFields } from "./project-fields";
import { TemplatePicker, type PickedTemplate } from "./template-picker";
import { listWorkspaceTemplates, type CustomTemplateSummary } from "@/lib/actions/templates";
import { describeLength } from "@/lib/templates";
import { cn } from "@/lib/utils";

function suggestKey(name: string) {
  const words = name.toUpperCase().replace(/[^A-Z0-9 ]/g, "").split(/\s+/).filter(Boolean);
  if (words.length === 0) return "";
  const key = words.length > 1 ? words.map((w) => w[0]).join("") : words[0];
  return key.replace(/^[0-9]+/, "").slice(0, 4);
}

export function NewProjectDialog({
  workspaceSlug,
  open,
  onOpenChange,
}: {
  workspaceSlug: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/* Remount on each open so it starts at the template step with an empty form. */}
      {open && <NewProjectFlow workspaceSlug={workspaceSlug} onCancel={() => onOpenChange(false)} />}
    </Dialog>
  );
}

function NewProjectFlow({ workspaceSlug, onCancel }: { workspaceSlug: string; onCancel: () => void }) {
  const [picked, setPicked] = useState<PickedTemplate | null>(null);
  const [custom, setCustom] = useState<CustomTemplateSummary[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    listWorkspaceTemplates(workspaceSlug)
      .then((rows) => alive && setCustom(rows))
      .catch(() => alive && setCustom([]))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [workspaceSlug]);

  return (
    <DialogContent className={cn("max-h-[90dvh] overflow-y-auto", picked ? "sm:max-w-lg" : "sm:max-w-3xl")}>
      <DialogHeader>
        <DialogTitle>New project</DialogTitle>
        <DialogDescription>
          {picked
            ? "You can change any of this later in the project's settings."
            : "Start from a template made for your field, or from a blank project."}
        </DialogDescription>
      </DialogHeader>
      {picked ? (
        <NewProjectForm workspaceSlug={workspaceSlug} template={picked} onChangeTemplate={() => setPicked(null)} onCancel={onCancel} />
      ) : (
        <TemplatePicker custom={custom} loadingCustom={loading} onPick={setPicked} />
      )}
    </DialogContent>
  );
}

function NewProjectForm({
  workspaceSlug,
  template,
  onChangeTemplate,
  onCancel,
}: {
  workspaceSlug: string;
  template: PickedTemplate;
  onChangeTemplate: () => void;
  onCancel: () => void;
}) {
  const [state, action, pending] = useActionState(createProject, undefined);
  const [key, setKey] = useState("");
  const [keyEdited, setKeyEdited] = useState(false);
  const errors = state?.fieldErrors ?? {};

  return (
    <form
      // Submit manually: a plain form action resets the fields, losing input on validation errors.
      onSubmit={(e) => {
        e.preventDefault();
        const data = new FormData(e.currentTarget);
        startTransition(() => action(data));
      }}
      className="grid gap-4"
    >
      <input type="hidden" name="workspaceSlug" value={workspaceSlug} />
      <input type="hidden" name="template" value={template.value} />

      <div className="rounded-lg border bg-muted/40 px-3 py-2.5 text-sm">
        <div className="flex items-center gap-2">
          <span className="min-w-0 flex-1">
            <span className="text-muted-foreground">Template: </span>
            <span className="font-medium">{template.name}</span>
            {template.taskCount > 0 && (
              <span className="text-muted-foreground">
                {" "}
                · {template.taskCount} tasks · {describeLength(template.lengthDays)}
              </span>
            )}
          </span>
          <Button type="button" variant="ghost" size="sm" onClick={onChangeTemplate}>
            Change
          </Button>
        </div>
        {template.tasks.length > 0 && (
          <details className="mt-1">
            <summary className="cursor-pointer text-xs text-primary">Show tasks</summary>
            <ol className="mt-2 grid gap-0.5 text-xs">
              {template.tasks.map((t, i) => (
                <li key={i} className="flex justify-between gap-3">
                  <span className="truncate">{t.title}</span>
                  {t.weight !== undefined && <span className="text-muted-foreground tabular-nums">{t.weight}%</span>}
                </li>
              ))}
            </ol>
          </details>
        )}
        {template.lengthDays > 0 && (
          <p className="mt-1 text-xs text-muted-foreground">
            Set a start date and the tasks get their dates automatically (and the end date, if you leave it empty).
          </p>
        )}
      </div>

      <ProjectFields
        errors={errors}
        autoFocus
        onNameChange={(name) => !keyEdited && setKey(suggestKey(name))}
      />

      <div className="grid gap-1.5">
        <Label htmlFor="project-key">
          Project key <span aria-hidden className="text-destructive">*</span>
        </Label>
        <Input
          id="project-key"
          name="key"
          value={key}
          onChange={(e) => {
            setKeyEdited(true);
            setKey(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6));
          }}
          placeholder="WEB"
          required
          className="w-32 font-mono uppercase"
          aria-invalid={Boolean(errors.key)}
          aria-describedby="project-key-help"
        />
        <p id="project-key-help" className="text-xs text-muted-foreground">
          Short code used in task IDs, e.g. {key || "WEB"}-12.
        </p>
        <FieldError message={errors.key} />
      </div>

      {state?.error && <FieldError message={state.error} />}

      <DialogFooter>
        <Button type="button" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" disabled={pending}>
          {pending && <Loader2 className="size-4 animate-spin" />}
          Create project
        </Button>
      </DialogFooter>
    </form>
  );
}
