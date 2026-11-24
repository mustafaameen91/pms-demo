"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertTriangle, CalendarClock, Gauge, ListTodo, Users, Plane } from "lucide-react";
import type { Column } from "@/lib/workload";
import { cn, formatDate } from "@/lib/utils";
import { UserAvatar } from "@/components/tasks/task-bits";
import { useT } from "@/i18n/client";
import { PageHeader, Panel, StatTile } from "@/components/page/kit";

type CellTask = { key: string; title: string; projectKey: string; projectName: string; dueDate: string | null };

const shortDate = (iso: string, locale: string) => {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString(locale, { month: "short", day: "numeric", timeZone: "UTC" });
};

/**
 * Heatmap of open tasks per person per week. One hue (the brand primary) for "how much",
 * with the count printed in every cell; overload adds an icon, not just colour.
 */
export function WorkloadGrid({
  slug,
  limit,
  columns,
  people,
  cells,
  leave = {},
}: {
  slug: string;
  limit: number;
  columns: Column[];
  people: { id: string; name: string; image: string | null }[];
  cells: Record<string, Record<string, CellTask[]>>;
  /** Approved leave days per person per week (from HR), so nobody plans work for someone who's away. */
  leave?: Record<string, Record<string, number>>;
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

  // Per person: open tasks in total and the busiest week (what "overloaded" is measured on).
  const load = new Map(
    people.map((p) => {
      const total = columns.reduce((sum, c) => sum + (cells[p.id]?.[c.key]?.length ?? 0), 0);
      const peak = Math.max(0, ...weekly.map((c) => cells[p.id]?.[c.key]?.length ?? 0));
      return [p.id, { total, peak }];
    }),
  );
  const assigned = people.filter((p) => p.id);
  const openTasks = [...load.values()].reduce((sum, l) => sum + l.total, 0);
  const overloaded = assigned.filter((p) => load.get(p.id)!.peak >= limit).length;
  const overdue = people.reduce((sum, p) => sum + (cells[p.id]?.overdue?.length ?? 0), 0);
  const busy = assigned.filter((p) => load.get(p.id)!.total > 0).length;
  const level = (peak: number) => (peak >= limit ? "over" : peak >= Math.ceil(limit * 0.75) ? "busy" : "ok");

  return (
    <>
      <PageHeader
        icon={Gauge}
        title={t("Workload")}
        description={t("Open tasks per person, by the week they're due. Click a cell to see the tasks.")}
        actions={
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
            <input id="wl-limit" name="limit" type="number" min={1} max={50} defaultValue={limit} className="h-8 w-16 rounded-lg border-0 bg-card px-2 tabular-nums shadow-sm" />
            <span className="text-muted-foreground">{t("tasks / week")}</span>
            <button type="submit" className="h-8 rounded-lg border border-white/25 bg-white/10 px-3 text-white transition-colors hover:bg-white/20">
              {t("Apply")}
            </button>
          </form>
        }
      />

      <dl className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile icon={Users} label={t("People")} value={assigned.length} hint={t.plural(busy, "{count} with open tasks", "{count} with open tasks")} />
        <StatTile icon={ListTodo} label={t("Open tasks")} value={openTasks} hint={busy ? t("{avg} per person on average", { avg: (Math.round((openTasks / busy) * 10) / 10).toLocaleString(t.intl) }) : undefined} />
        <StatTile
          icon={AlertTriangle}
          tone={overloaded ? "bad" : "good"}
          label={t("Overloaded")}
          value={overloaded}
          hint={t("{limit}+ tasks in a week", { limit })}
          share={assigned.length ? overloaded / assigned.length : 0}
          shareLabel={t("Share of people overloaded")}
        />
        <StatTile icon={CalendarClock} tone={overdue ? "bad" : "good"} label={t("Overdue")} value={overdue} hint={t("Past their end date")} />
      </dl>

      <Panel id="workload-heading" title={t("Open tasks per person and week")} icon={Gauge}>
        <div className="relative overflow-x-auto border-t">
          <table className="w-full min-w-[980px] border-collapse text-sm">
            <caption className="sr-only">{t("Open tasks per person and week")}</caption>
            <thead>
              <tr className="border-b bg-muted/40 text-xs text-muted-foreground">
                <th scope="col" className="w-48 py-2 pe-3 ps-5 text-start font-medium">{t("Person")}</th>
                {columns.map((c) => (
                  <th key={c.key} scope="col" className={cn("px-1 py-2 text-center font-medium", c.key === "overdue" && "text-destructive")}>
                    {label(c)}
                  </th>
                ))}
                <th scope="col" className="w-40 py-2 pe-5 ps-3 text-start font-medium">{t("Load")}</th>
              </tr>
            </thead>
            <tbody>
              {people.map((p) => (
                <tr key={p.id || "unassigned"} className="border-b transition-colors last:border-b-0 hover:bg-accent/40">
                  <th scope="row" className="py-2 pe-3 ps-5 text-start font-normal">
                    <span className="flex items-center gap-2.5">
                      {p.id ? <UserAvatar name={p.name} image={p.image} className="size-8" /> : <span className="size-8" />}
                      <span className="min-w-0">
                        <span className={cn("block truncate font-medium", !p.id && "font-normal text-muted-foreground italic")}>{p.name}</span>
                        <span className="block text-xs text-muted-foreground tabular-nums">{t.plural(load.get(p.id)!.total, "{count} open task", "{count} open tasks")}</span>
                      </span>
                    </span>
                  </th>
                  {columns.map((c) => {
                    const list = cells[p.id]?.[c.key] ?? [];
                    const n = list.length;
                    const over = Boolean(c.start) && n >= limit;
                    const isSel = selected?.person === p.id && selected.col === c.key;
                    const away = leave[p.id]?.[c.key] ?? 0;
                    return (
                      <td key={c.key} className="relative p-0.5 text-center">
                        {away > 0 && (
                          <span
                            className="pointer-events-none absolute top-0 z-10 inline-flex items-center gap-0.5 rounded-full bg-violet-600 px-1 text-[10px] leading-4 font-semibold text-white inset-e-0"
                            title={t.plural(away, "On leave {count} day this week", "On leave {count} days this week")}
                          >
                            <Plane className="size-2.5" aria-hidden />
                            {away}
                            <span className="sr-only">{t.plural(away, "On leave {count} day this week", "On leave {count} days this week")}</span>
                          </span>
                        )}
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
                  <td className="py-2 pe-5 ps-3">
                    {p.id ? <LoadBar peak={load.get(p.id)!.peak} limit={limit} level={level(load.get(p.id)!.peak)} /> : <span className="text-xs text-muted-foreground">—</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>

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
        <section aria-labelledby="cell-heading" className="overflow-hidden rounded-2xl border bg-card">
          <h2 id="cell-heading" className="border-b px-5 py-4 font-semibold">
            {selectedPerson?.name} · {selectedCol && label(selectedCol)} · {t.plural(selectedTasks.length, "{count} task", "{count} tasks")}
          </h2>
          <ul className="divide-y">
            {selectedTasks.map((task) => (
              <li key={task.key}>
                <Link href={`/w/${slug}/p/${task.projectKey}?task=${task.key}`} className="flex items-center gap-3 px-5 py-3 text-sm transition-colors hover:bg-accent">
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

/** The busiest week against the limit: a thin bar plus a word (never colour alone). */
function LoadBar({ peak, limit, level }: { peak: number; limit: number; level: "ok" | "busy" | "over" }) {
  const t = useT();
  const word = { ok: t("Light|load"), busy: t("Busy|load"), over: t("Overloaded") }[level];
  return (
    <span className="grid gap-1">
      <span className="flex items-center justify-between gap-2 text-xs">
        <span className={cn("font-medium", level === "over" ? "text-destructive" : level === "busy" ? "text-amber-700 dark:text-amber-300" : "text-green-700 dark:text-green-400")}>
          {word}
        </span>
        <span className="text-muted-foreground tabular-nums">{t("{peak} / {limit} a week", { peak, limit })}</span>
      </span>
      <span
        role="meter"
        aria-label={t("Busiest week: {peak} of {limit} tasks", { peak, limit })}
        aria-valuenow={peak}
        aria-valuemin={0}
        aria-valuemax={limit}
        className="h-1.5 overflow-hidden rounded-full bg-muted"
      >
        <span
          className={cn("block h-full rounded-full", level === "over" ? "bg-destructive" : level === "busy" ? "bg-amber-500" : "bg-green-600")}
          style={{ width: `${Math.min(100, Math.max(peak > 0 ? 6 : 0, (peak / limit) * 100))}%` }}
        />
      </span>
    </span>
  );
}
