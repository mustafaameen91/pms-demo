"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { ArrowRight, CircleCheck, Lock, X } from "lucide-react";
import { toast } from "sonner";
import { addDependency, removeDependency } from "@/lib/actions/tasks";
import type { TaskLinks } from "@/lib/data/projects";
import { isFinished } from "@/lib/dependencies";
import { cn, formatDate } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { nativeSelectClass } from "@/components/resources/resource-fields";
import { useT } from "@/i18n/client";

type Linked = TaskLinks["predecessors"][number];

/** "Waiting on" (editable) and "Blocking" (read-only) lists for one task. */
export function Dependencies({
  taskId,
  projectKey,
  links,
  options,
  taskHref,
}: {
  taskId: string;
  projectKey: string;
  links: TaskLinks;
  options: { id: string; number: number; title: string }[];
  taskHref: (key?: string) => string;
}) {
  const t = useT();
  const [pick, setPick] = useState("");
  const [pending, startTransition] = useTransition();
  const linked = new Set(links.predecessors.map((p) => p.id));
  const available = options.filter((o) => !linked.has(o.id));

  const run = (fn: () => Promise<{ ok: boolean; error?: string; warning?: string }>, success: string) =>
    startTransition(async () => {
      const result = await fn();
      if (!result.ok) return void toast.error(result.error);
      if (result.warning) toast.warning(result.warning);
      else toast.success(success);
    });

  const row = (task: Linked, remove?: () => void) => {
    const done = isFinished(task.category);
    return (
      <li key={task.id} className="flex items-center gap-2 px-3 py-2 text-sm">
        {done ? (
          <CircleCheck className="size-4 shrink-0 text-green-600 dark:text-green-500" aria-label={t("Finished")} />
        ) : (
          <Lock className="size-4 shrink-0 text-amber-600 dark:text-amber-400" aria-label={t("Not finished")} />
        )}
        <Link href={taskHref(`${projectKey}-${task.number}`)} scroll={false} className="min-w-0 flex-1 truncate hover:underline">
          <span className="me-2 font-mono text-xs text-muted-foreground">
            {projectKey}-{task.number}
          </span>
          {task.title}
        </Link>
        <span className={cn("text-xs whitespace-nowrap", done ? "text-muted-foreground" : "text-foreground")}>
          {task.statusName}
          {task.dueDate && ` · ${t("ends {date}", { date: formatDate(task.dueDate, t.intl) })}`}
        </span>
        {remove && (
          <button
            type="button"
            onClick={remove}
            disabled={pending}
            aria-label={t("Stop waiting on {title}", { title: task.title })}
            className="grid size-7 place-items-center rounded-md text-muted-foreground hover:bg-accent hover:text-destructive"
          >
            <X className="size-4" />
          </button>
        )}
      </li>
    );
  };

  return (
    <section aria-labelledby="deps-heading" className="grid gap-2">
      <h3 id="deps-heading" className="text-sm font-medium">
        {t("Dependencies")}
      </h3>
      <p className="-mt-1 text-xs text-muted-foreground">{t("This task can't start before the tasks it waits on are finished.")}</p>

      <div className="grid gap-1.5">
        <h4 className="text-xs font-medium text-muted-foreground">{t("Waiting on")}</h4>
        {links.predecessors.length > 0 && (
          <ul className="grid divide-y rounded-lg border">
            {links.predecessors.map((p) =>
              row(p, () => run(() => removeDependency(taskId, p.id), t("No longer waiting on {title}", { title: p.title }))),
            )}
          </ul>
        )}
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (!pick) return;
            const target = options.find((o) => o.id === pick);
            run(() => addDependency(taskId, pick), t("Now waiting on {title}", { title: target?.title ?? "" }));
            setPick("");
          }}
        >
          <label htmlFor="dep-pick" className="sr-only">
            {t("Add a task this one waits on")}
          </label>
          <select id="dep-pick" value={pick} onChange={(e) => setPick(e.target.value)} className={nativeSelectClass}>
            <option value="">{available.length ? t("Add a task it waits on…") : t("No other tasks to add")}</option>
            {available.map((o) => (
              <option key={o.id} value={o.id}>
                {projectKey}-{o.number} {o.title}
              </option>
            ))}
          </select>
          <Button type="submit" size="sm" variant="outline" disabled={pending || !pick}>
            {t("Add")}
          </Button>
        </form>
      </div>

      {links.successors.length > 0 && (
        <div className="grid gap-1.5">
          <h4 className="flex items-center gap-1 text-xs font-medium text-muted-foreground">
            {t("Blocking")} <ArrowRight className="size-3 rtl:-scale-x-100" aria-hidden /> {t("these wait on this task")}
          </h4>
          <ul className="grid divide-y rounded-lg border">{links.successors.map((s) => row(s))}</ul>
        </div>
      )}
    </section>
  );
}
