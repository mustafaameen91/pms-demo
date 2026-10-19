"use client";

import { useState, useTransition } from "react";
import { LayoutTemplate, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { saveProjectAsTemplate } from "@/lib/actions/templates";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useT } from "@/i18n/client";
import { FieldError } from "./project-fields";

export function SaveAsTemplate({ projectId, projectName }: { projectId: string; projectName: string }) {
  const t = useT();
  const [name, setName] = useState(() => t("{name} template", { name: projectName }));
  const [description, setDescription] = useState("");
  const [error, setError] = useState<string>();
  const [pending, startTransition] = useTransition();

  return (
    <section aria-labelledby="template-heading" className="rounded-xl border bg-card p-5 sm:p-6">
      <h2 id="template-heading" className="flex items-center gap-2 font-semibold">
        <LayoutTemplate className="size-4 text-muted-foreground" aria-hidden />
        {t("Save as template")}
      </h2>
      <p className="mt-1 text-sm text-muted-foreground">
        {t(
          "Reuse this project's workflow, tasks, weights, sub-tasks and timing for future projects. People, progress and money are not copied.",
        )}
      </p>
      <form
        className="mt-4 grid gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          setError(undefined);
          startTransition(async () => {
            const result = await saveProjectAsTemplate(projectId, { name, description });
            if (!result.ok) return setError(result.error);
            toast.success(t("Saved “{name}” — find it under Templates and in New project", { name }));
          });
        }}
      >
        <div className="grid gap-1.5">
          <Label htmlFor="tpl-name">{t("Template name")}</Label>
          <Input id="tpl-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={80} required aria-invalid={Boolean(error)} />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="tpl-description">
            {t("Description")} <span className="font-normal text-muted-foreground">{t("(optional)")}</span>
          </Label>
          <Input id="tpl-description" value={description} onChange={(e) => setDescription(e.target.value)} maxLength={300} />
        </div>
        <FieldError message={error} />
        <div className="flex justify-end">
          <Button type="submit" variant="outline" disabled={pending}>
            {pending && <Loader2 className="size-4 animate-spin" />}
            {t("Save template")}
          </Button>
        </div>
      </form>
    </section>
  );
}
