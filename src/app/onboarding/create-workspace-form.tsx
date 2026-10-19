"use client";

import { useActionState } from "react";
import { Loader2 } from "lucide-react";
import { createWorkspace } from "@/lib/actions/workspace";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useT } from "@/i18n/client";

export function CreateWorkspaceForm() {
  const t = useT();
  const [state, action, pending] = useActionState(createWorkspace, undefined);

  return (
    <form action={action} className="mt-6 grid gap-4">
      <div className="grid gap-1.5">
        <Label htmlFor="name">{t("Workspace name")}</Label>
        <Input
          id="name"
          name="name"
          placeholder={t("Acme Inc.")}
          required
          minLength={2}
          maxLength={50}
          autoFocus
          aria-invalid={Boolean(state?.error)}
          aria-describedby="name-help"
        />
        <p id="name-help" className="text-xs text-muted-foreground">
          {t("Usually your company or team name.")}
        </p>
        {state?.error && (
          <p role="alert" className="text-sm text-destructive">
            {state.error}
          </p>
        )}
      </div>
      <Button type="submit" disabled={pending}>
        {pending && <Loader2 className="size-4 animate-spin" />}
        {t("Create workspace")}
      </Button>
    </form>
  );
}
