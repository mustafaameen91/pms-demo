"use client";

import { useState, useTransition } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { createResource, updateResource } from "@/lib/actions/resources";
import type { ResourceType } from "@/lib/constants";
import { Button } from "@/components/ui/button";
import { useT } from "@/i18n/client";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ResourceFields, draftToInput, emptyResourceDraft, type ResourceDraft } from "./resource-fields";

/** Create (no `resourceId`) or edit a library resource. */
export function ResourceDialog({
  open,
  onOpenChange,
  workspaceSlug,
  resourceId,
  initial,
  defaultType,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  workspaceSlug: string;
  resourceId?: string;
  initial?: ResourceDraft;
  defaultType?: ResourceType;
}) {
  const t = useT();
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{resourceId ? t("Edit resource") : t("Add resource")}</DialogTitle>
          <DialogDescription>
            {t(
              "Saved in your company library so any project can use it. Prices here are defaults; each project can use its own price.",
            )}
          </DialogDescription>
        </DialogHeader>
        {open && (
          <ResourceForm
            workspaceSlug={workspaceSlug}
            resourceId={resourceId}
            initial={initial ?? emptyResourceDraft(defaultType, undefined, t)}
            onDone={() => onOpenChange(false)}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function ResourceForm({
  workspaceSlug,
  resourceId,
  initial,
  onDone,
}: {
  workspaceSlug: string;
  resourceId?: string;
  initial: ResourceDraft;
  onDone: () => void;
}) {
  const t = useT();
  const [draft, setDraft] = useState(initial);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [pending, startTransition] = useTransition();

  return (
    <form
      className="grid gap-5"
      onSubmit={(e) => {
        e.preventDefault();
        startTransition(async () => {
          const input = draftToInput(draft);
          const result = resourceId
            ? await updateResource(resourceId, input)
            : await createResource(workspaceSlug, input);
          if (!result.ok) {
            setErrors(result.fieldErrors ?? {});
            if (!result.fieldErrors) toast.error(result.error);
            return;
          }
          toast.success(resourceId ? t("Resource updated") : t("{name} added to the library", { name: draft.name }));
          onDone();
        });
      }}
    >
      <ResourceFields value={draft} onChange={setDraft} errors={errors} lockType={Boolean(resourceId)} />
      <DialogFooter>
        <Button type="button" variant="ghost" onClick={onDone}>
          {t("Cancel")}
        </Button>
        <Button type="submit" disabled={pending}>
          {pending && <Loader2 className="size-4 animate-spin" />}
          {resourceId ? t("Save changes") : t("Add resource")}
        </Button>
      </DialogFooter>
    </form>
  );
}
