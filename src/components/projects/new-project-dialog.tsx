"use client";

import { useActionState, useState } from "react";
import { Loader2 } from "lucide-react";
import { createProject } from "@/lib/actions/projects";
import { PROJECT_COLORS } from "@/lib/constants";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

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
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>New project</DialogTitle>
          <DialogDescription>Projects hold tasks and their workflow.</DialogDescription>
        </DialogHeader>
        {/* Remount on each open so the form starts empty. */}
        {open && <NewProjectForm workspaceSlug={workspaceSlug} onCancel={() => onOpenChange(false)} />}
      </DialogContent>
    </Dialog>
  );
}

function NewProjectForm({ workspaceSlug, onCancel }: { workspaceSlug: string; onCancel: () => void }) {
  const [state, action, pending] = useActionState(createProject, undefined);
  const [name, setName] = useState("");
  const [key, setKey] = useState("");
  const [keyEdited, setKeyEdited] = useState(false);
  const [color, setColor] = useState<string>(PROJECT_COLORS[0]);
  const errors = state?.fieldErrors ?? {};

  return (
    <form action={action} className="grid gap-4">
      <input type="hidden" name="workspaceSlug" value={workspaceSlug} />
      <input type="hidden" name="color" value={color} />

      <div className="grid gap-1.5">
        <Label htmlFor="project-name">Name</Label>
        <Input
          id="project-name"
          name="name"
          value={name}
          onChange={(e) => {
            setName(e.target.value);
            if (!keyEdited) setKey(suggestKey(e.target.value));
          }}
          placeholder="Website redesign"
          required
          minLength={2}
          maxLength={60}
          autoFocus
          aria-invalid={Boolean(errors.name)}
        />
        {errors.name && <p className="text-sm text-destructive">{errors.name}</p>}
      </div>

      <div className="grid gap-1.5">
        <Label htmlFor="project-key">Key</Label>
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
          Prefix for task IDs, e.g. {key || "WEB"}-12.
        </p>
        {errors.key && <p className="text-sm text-destructive">{errors.key}</p>}
      </div>

      <fieldset className="grid gap-1.5">
        <legend className="mb-1.5 text-sm font-medium">Colour</legend>
        <div className="flex flex-wrap gap-2">
          {PROJECT_COLORS.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setColor(c)}
              aria-label={`Colour ${c}`}
              aria-pressed={color === c}
              className={cn(
                "size-7 rounded-md ring-offset-2 ring-offset-background transition-shadow",
                color === c && "ring-2 ring-ring",
              )}
              style={{ backgroundColor: c }}
            />
          ))}
        </div>
      </fieldset>

      <div className="grid gap-1.5">
        <Label htmlFor="project-description">
          Description <span className="font-normal text-muted-foreground">(optional)</span>
        </Label>
        <Textarea id="project-description" name="description" rows={2} maxLength={500} />
      </div>

      {state?.error && (
        <p role="alert" className="text-sm text-destructive">
          {state.error}
        </p>
      )}

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
