"use client";

import { useState, useTransition } from "react";
import { LayoutTemplate, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { deleteTemplate } from "@/lib/actions/templates";
import {
  describeLength,
  localizeBuiltinTemplate,
  templateLengthDays,
  type BuiltinTemplate,
  type TemplateData,
} from "@/lib/templates";
import { Button } from "@/components/ui/button";
import { StatusDot } from "@/components/tasks/task-bits";
import { useT } from "@/i18n/client";
import { NewProjectDialog } from "./new-project-dialog";
import { TEMPLATE_ICONS } from "./template-picker";

type Custom = {
  id: string;
  name: string;
  description: string | null;
  createdByName: string | null;
  data: TemplateData;
  canDelete: boolean;
};

export function TemplatesView({
  workspaceSlug,
  builtins,
  custom,
}: {
  workspaceSlug: string;
  builtins: BuiltinTemplate[];
  custom: Custom[];
}) {
  const t = useT();
  const [newOpen, setNewOpen] = useState(false);
  const [confirm, setConfirm] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <div className="grid grid-cols-1 gap-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">{t("Templates")}</h1>
          <p className="text-sm text-muted-foreground">
            {t(
              "Start projects with the right workflow, weighted tasks and timing. Save any project as a template from its Settings tab.",
            )}
          </p>
        </div>
        <Button onClick={() => setNewOpen(true)}>
          <Plus className="size-4" />
          {t("New project from template")}
        </Button>
      </div>

      <section aria-labelledby="custom-heading" className="grid gap-3">
        <h2 id="custom-heading" className="font-semibold">
          {t("Your templates")}
        </h2>
        {custom.length === 0 ? (
          <p className="rounded-xl border border-dashed px-4 py-8 text-center text-sm text-muted-foreground">
            {t("No saved templates yet. Open a project → Settings → “Save as template”.")}
          </p>
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            {custom.map((tpl) => (
              <TemplateDetails
                key={tpl.id}
                icon={LayoutTemplate}
                name={tpl.name}
                meta={tpl.createdByName ? t("Saved by {name}", { name: tpl.createdByName }) : t("Saved template")}
                description={tpl.description}
                data={tpl.data}
                action={
                  tpl.canDelete && (
                    <Button
                      variant={confirm === tpl.id ? "destructive" : "ghost"}
                      size="sm"
                      disabled={pending}
                      aria-label={confirm === tpl.id ? t("Confirm deleting {name}", { name: tpl.name }) : t("Delete {name}", { name: tpl.name })}
                      onClick={() => {
                        if (confirm !== tpl.id) return setConfirm(tpl.id);
                        setConfirm(null);
                        startTransition(async () => {
                          const result = await deleteTemplate(workspaceSlug, tpl.id);
                          if (result.ok) toast.success(t("Template deleted"));
                          else toast.error(result.error);
                        });
                      }}
                    >
                      <Trash2 className="size-4" />
                      {confirm === tpl.id ? t("Click again") : t("Delete")}
                    </Button>
                  )
                }
              />
            ))}
          </div>
        )}
      </section>

      <section aria-labelledby="builtin-heading" className="grid gap-3">
        <h2 id="builtin-heading" className="font-semibold">
          {t("Industry templates")}
        </h2>
        <div className="grid gap-3 md:grid-cols-2">
          {builtins.map((source) => localizeBuiltinTemplate(source, t)).map((tpl) => (
            <TemplateDetails
              key={tpl.id}
              icon={TEMPLATE_ICONS[tpl.icon]}
              name={tpl.name}
              meta={tpl.field}
              description={tpl.description}
              data={tpl.data}
            />
          ))}
        </div>
      </section>

      <NewProjectDialog workspaceSlug={workspaceSlug} open={newOpen} onOpenChange={setNewOpen} />
    </div>
  );
}

function TemplateDetails({
  icon: Icon,
  name,
  meta,
  description,
  data,
  action,
}: {
  icon: typeof LayoutTemplate;
  name: string;
  meta: string;
  description: string | null;
  data: TemplateData;
  action?: React.ReactNode;
}) {
  const t = useT();
  return (
    <article className="flex flex-col rounded-xl border bg-card p-4">
      <header className="flex items-start gap-3">
        <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-accent text-primary">
          <Icon className="size-4" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="font-medium">{name}</h3>
          <p className="text-xs text-muted-foreground">
            {meta} · {t.plural(data.tasks.length, "{count} tasks", "{count} tasks")} ·{" "}
            {describeLength(templateLengthDays(data), t)}
          </p>
        </div>
        {action}
      </header>
      {description && <p className="mt-2 text-sm text-muted-foreground">{description}</p>}
      <div className="mt-3 flex flex-wrap gap-1.5">
        {data.statuses.map((s) => (
          <span key={s.name} className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs">
            <StatusDot color={s.color} className="size-2" />
            {s.name}
          </span>
        ))}
      </div>
      <details className="mt-3 text-sm">
        <summary className="cursor-pointer text-xs text-primary">{t("Tasks and weights")}</summary>
        <ol className="mt-2 grid gap-1">
          {data.tasks.map((task, i) => (
            <li key={i} className="flex justify-between gap-3">
              <span className="min-w-0">
                <span className="block truncate">{task.title}</span>
                {task.subtasks && task.subtasks.length > 0 && (
                  <span className="block truncate text-xs text-muted-foreground">{task.subtasks.join(" · ")}</span>
                )}
              </span>
              <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                {task.weight !== undefined ? `${task.weight}%` : ""}
                {task.duration ? ` · ${t("{days}d", { days: String(task.duration) })}` : ""}
              </span>
            </li>
          ))}
        </ol>
      </details>
    </article>
  );
}
