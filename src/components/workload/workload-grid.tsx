"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertTriangle } from "lucide-react";
import type { Column } from "@/lib/workload";
import { cn, formatDate } from "@/lib/utils";
import { UserAvatar } from "@/components/tasks/task-bits";
import { useT } from "@/i18n/client";

type CellTask = { key: string; title: string; projectKey: string; projectName: string; dueDate: string | null };

const shortDate = (iso: string, locale: string) => {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString(locale, { month: "short", day: "numeric", timeZone: "UTC" });
};

/**
 * Heatmap of open tasks per person per week. One hue (teal) for "how much",
 * with the count printed in every cell; overload adds an icon, not just colour.
 */
export function WorkloadGrid({
  slug,
  limit,
  columns,
  people,
  cells,
}: {
  slug: string;
  limit: number;
  columns: Column[];
  people: { id: string; name: string; image: string | null }[];
  cells: Record<string, Record<string, CellTask[]>>;
}) {
  const t = useT();
  const router = useRouter();
  const [selected, setSelected] = useState<{ person: string; col: string } | null>(null);
  const weekly = columns.filter((c) => c.start);
  const max = Math.max(1, ...people.flatMap((p) => weekly.map((c) => cells[p.id]?.[c.key]?.length ?? 0)));
  const shade = (n: number) => (n === 0 ? 0 : 0.12 + 0.58 * Math.min(1, n / Math.max(max, limit)));
  const label = (c: Column) => (c.start ? t("Week of {date}", { date: shortDate(c.start, t.intl) }) : t(c.label));
  const selectedTasks = selected ? cells[selected.person]?.[selected.col] ?? [] : [];
  const selectedPerson = people.find((p) => p.id === selected?.person);
  const selectedCol = columns.find((c) => c.key === selected?.col);

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">{t("Workload")}</h1>
          <p className="text-sm text-muted-foreground">{t("Open tasks per person, by the week they're due. Click a cell to see the tasks.")}</p>
        </div>
        <form
          className="flex items-center gap-2 text-sm"
          onSubmit={(e) => {
            e.preventDefault();
            const v = new FormData(e.currentTarget).get("limit");
            router.push(`/w/${slug}/workload?limit=${v}`);
          }}
        >
          <label htmlFor="wl-limit" className="text-muted-foreground">
            {t("Overloaded at")}
          </label>
          <input id="wl-limit" name="limit" type="number" min={1} max={50} defaultValue={limit} className="h-8 w-16 rounded-lg border bg-transparent px-2 tabular-nums" />
          <span className="text-muted-foreground">{t("tasks / week")}</span>
          <button type="submit" className="h-8 rounded-lg border px-3 hover:bg-accent">
            {t("Apply")}
          </button>
        </form>
      </div>

      <div className="relative overflow-x-auto rounded-xl border bg-card">
        <table className="w-full min-w-[860px] border-collapse text-sm">
          <caption className="sr-only">{t("Open tasks per person and week")}</caption>
          <thead>
            <tr className="border-b bg-muted/40 text-xs text-muted-foreground">
              <th scope="col" className="w-48 py-2 pe-3 ps-4 text-start font-medium">{t("Person")}</th>
              {columns.map((c) => (
                <th key={c.key} scope="col" className={cn("px-1 py-2 text-center font-medium", c.key === "overdue" && "text-destructive")}>
                  {label(c)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {people.map((p) => (
              <tr key={p.id || "unassigned"} className="border-b last:border-b-0">
                <th scope="row" className="py-1.5 pe-3 ps-4 text-start font-normal">
                  <span className="flex items-center gap-2">
                    {p.id ? <UserAvatar name={p.name} image={p.image} className="size-6" /> : <span className="size-6" />}
                    <span className={cn("truncate", !p.id && "text-muted-foreground italic")}>{p.name}</span>
                  </span>
                </th>
                {columns.map((c) => {
                  const list = cells[p.id]?.[c.key] ?? [];
                  const n = list.length;
                  const over = Boolean(c.start) && n >= limit;
                  const isSel = selected?.person === p.id && selected.col === c.key;
                  return (
                    <td key={c.key} className="p-0.5 text-center">
                      <button
                        type="button"
                        disabled={n === 0}
                        onClick={() => setSelected(isSel ? null : { person: p.id, col: c.key })}
                        aria-pressed={isSel}
                        aria-label={`${p.name}, ${label(c)}: ${t.plural(n, "{count} task", "{count} tasks")}${over ? t(", overloaded") : ""}`}
                        className={cn(
                          "relative flex h-10 w-full items-center justify-center gap-1 rounded-md text-sm tabular-nums transition-shadow",
                          "focus-visible:outline-2 focus-visible:outline-ring disabled:cursor-default",
                          n === 0 && "text-muted-foreground/50",
                          c.key === "overdue" && n > 0 && "font-semibold text-destructive",
                          over && "ring-2 ring-amber-500",
                          isSel && "ring-2 ring-foreground",
                        )}
                        style={c.start && n > 0 ? { backgroundColor: `color-mix(in oklch, var(--primary) ${Math.round(shade(n) * 100)}%, transparent)` } : undefined}
                      >
                        {over && <AlertTriangle className="size-3.5 text-amber-700 dark:text-amber-300" aria-hidden />}
                        <span className={cn(c.start && shade(n) > 0.45 && "font-semibold text-foreground dark:text-primary-foreground")}>{n || "·"}</span>
                      </button>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap items-center gap-x-5 gap-y-1 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <span aria-hidden className="h-3 w-10 rounded-sm rtl:-scale-x-100" style={{ background: "linear-gradient(to right, color-mix(in oklch, var(--primary) 12%, transparent), color-mix(in oklch, var(--primary) 70%, transparent))" }} />
          {t("fewer → more tasks")}
        </span>
        <span className="flex items-center gap-1.5">
          <AlertTriangle className="size-3.5 text-amber-700 dark:text-amber-300" aria-hidden /> {t("{limit}+ tasks in a week", { limit })}
        </span>
      </div>

      {selected && (
        <section aria-labelledby="cell-heading" className="rounded-xl border bg-card">
          <h2 id="cell-heading" className="border-b px-4 py-3 font-semibold">
            {selectedPerson?.name} · {selectedCol && label(selectedCol)} · {t.plural(selectedTasks.length, "{count} task", "{count} tasks")}
          </h2>
          <ul className="divide-y">
            {selectedTasks.map((task) => (
              <li key={task.key}>
                <Link href={`/w/${slug}/p/${task.projectKey}?task=${task.key}`} className="flex items-center gap-3 px-4 py-2 text-sm hover:bg-accent/50">
                  <span className="w-16 font-mono text-xs text-muted-foreground">{task.key}</span>
                  <span className="min-w-0 flex-1 truncate">{task.title}</span>
                  <span className="text-xs text-muted-foreground">{task.projectName}</span>
                  <span className="w-24 text-end text-xs text-muted-foreground tabular-nums">{formatDate(task.dueDate, t.intl)}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}
