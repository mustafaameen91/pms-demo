"use client";

import {
  Briefcase,
  Building2,
  Factory,
  FilePlus2,
  Hammer,
  LayoutTemplate,
  Megaphone,
  PartyPopper,
  Rocket,
  Server,
} from "lucide-react";
import { BUILTIN_TEMPLATES, describeLength, templateLengthDays, type BuiltinTemplate } from "@/lib/templates";
import type { CustomTemplateSummary } from "@/lib/actions/templates";
import { cn } from "@/lib/utils";

export const TEMPLATE_ICONS: Record<BuiltinTemplate["icon"], typeof Building2> = {
  building: Building2,
  hammer: Hammer,
  megaphone: Megaphone,
  server: Server,
  party: PartyPopper,
  briefcase: Briefcase,
  rocket: Rocket,
  factory: Factory,
};

/** What a picked template looks like to the form: value for the server + a summary. */
export type PickedTemplate = {
  value: string; // "" | "builtin:<id>" | "custom:<id>"
  name: string;
  taskCount: number;
  lengthDays: number;
  tasks: { title: string; weight?: number }[];
};

export const BLANK: PickedTemplate = { value: "", name: "Blank project", taskCount: 0, lengthDays: 0, tasks: [] };

export function builtinPick(tpl: BuiltinTemplate): PickedTemplate {
  return {
    value: `builtin:${tpl.id}`,
    name: tpl.name,
    taskCount: tpl.data.tasks.length,
    lengthDays: templateLengthDays(tpl.data),
    tasks: tpl.data.tasks.map((t) => ({ title: t.title, weight: t.weight })),
  };
}

export function customPick(tpl: CustomTemplateSummary): PickedTemplate {
  return { value: `custom:${tpl.id}`, name: tpl.name, taskCount: tpl.taskCount, lengthDays: tpl.lengthDays, tasks: tpl.tasks };
}

function Card({
  icon: Icon,
  title,
  meta,
  description,
  onClick,
}: {
  icon: typeof Building2;
  title: string;
  meta: string;
  description?: string | null;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex h-full flex-col rounded-xl border bg-card p-3 text-start transition-colors",
        "hover:border-primary/50 hover:bg-accent/40 focus-visible:outline-2 focus-visible:outline-ring",
      )}
    >
      <span className="flex items-center gap-2">
        <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-accent text-primary">
          <Icon className="size-4" aria-hidden />
        </span>
        <span className="min-w-0">
          <span className="block truncate text-sm font-medium">{title}</span>
          <span className="block text-xs text-muted-foreground">{meta}</span>
        </span>
      </span>
      {description && <span className="mt-2 line-clamp-2 text-xs text-muted-foreground">{description}</span>}
    </button>
  );
}

/** Grid of: blank project, the workspace's saved templates, and the built-in industry templates. */
export function TemplatePicker({
  custom,
  loadingCustom,
  onPick,
}: {
  custom: CustomTemplateSummary[];
  loadingCustom: boolean;
  onPick: (pick: PickedTemplate) => void;
}) {
  const meta = (count: number, days: number) => `${count} tasks · ${describeLength(days)}`;
  return (
    <div className="grid gap-5">
      <div className="grid gap-2 sm:grid-cols-3">
        <Card icon={FilePlus2} title="Blank project" meta="Start from scratch" onClick={() => onPick(BLANK)} />
      </div>

      {(loadingCustom || custom.length > 0) && (
        <section aria-labelledby="your-templates" className="grid gap-2">
          <h3 id="your-templates" className="text-xs font-medium text-muted-foreground">
            Your templates
          </h3>
          {loadingCustom ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : (
            <div className="grid gap-2 sm:grid-cols-3">
              {custom.map((tpl) => (
                <Card
                  key={tpl.id}
                  icon={LayoutTemplate}
                  title={tpl.name}
                  meta={meta(tpl.taskCount, tpl.lengthDays)}
                  description={tpl.description}
                  onClick={() => onPick(customPick(tpl))}
                />
              ))}
            </div>
          )}
        </section>
      )}

      <section aria-labelledby="industry-templates" className="grid gap-2">
        <h3 id="industry-templates" className="text-xs font-medium text-muted-foreground">
          Industry templates
        </h3>
        <div className="grid gap-2 sm:grid-cols-3">
          {BUILTIN_TEMPLATES.map((tpl) => (
            <Card
              key={tpl.id}
              icon={TEMPLATE_ICONS[tpl.icon]}
              title={tpl.name}
              meta={`${tpl.field} · ${meta(tpl.data.tasks.length, templateLengthDays(tpl.data))}`}
              description={tpl.description}
              onClick={() => onPick(builtinPick(tpl))}
            />
          ))}
        </div>
      </section>
    </div>
  );
}
