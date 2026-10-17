"use client";

import { startTransition, useActionState, useState } from "react";
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
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>New project</DialogTitle>
          <DialogDescription>
            You can change any of this later in the project&apos;s settings.
          </DialogDescription>
        </DialogHeader>
        {/* Remount on each open so the form starts empty. */}
        {open && <NewProjectForm workspaceSlug={workspaceSlug} onCancel={() => onOpenChange(false)} />}
      </DialogContent>
    </Dialog>
  );
}

function NewProjectForm({ workspaceSlug, onCancel }: { workspaceSlug: string; onCancel: () => void }) {
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
