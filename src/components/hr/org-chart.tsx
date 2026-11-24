"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ChevronDown, Minus, Plus, Search } from "lucide-react";
import type { OrgNode } from "@/lib/hr";
import { cn } from "@/lib/utils";
import { useT } from "@/i18n/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PersonAvatar } from "./hr-ui";
import "./org-chart.css";

export type OrgPerson = {
  id: string;
  name: string;
  jobTitle: string | null;
  managerId: string | null;
  hasPhoto: boolean;
  department: { name: string; color: string } | null;
};

const count = (n: OrgNode<OrgPerson>): number => n.reports.reduce((s, r) => s + 1 + count(r), 0);

/**
 * Top-down chart: each manager with their team below, joined by lines. Teams
 * fold away; searching highlights matches and opens the way to them.
 */
export function OrgChart({ slug, tree, unplaced }: { slug: string; tree: OrgNode<OrgPerson>[]; unplaced: number }) {
  const t = useT();
  const [q, setQ] = useState("");
  const [closed, setClosed] = useState<Set<string>>(new Set());
  const [zoom, setZoom] = useState(1);
  const needle = q.trim().toLowerCase();
  // Managers on the way to a match stay open.
  const onPath = useMemo(() => {
    const keep = new Set<string>();
    if (!needle) return keep;
    const walk = (n: OrgNode<OrgPerson>): boolean => {
      const self = [n.employee.name, n.employee.jobTitle, n.employee.department?.name].some((v) => v?.toLowerCase().includes(needle));
      const below = n.reports.map(walk).some(Boolean);
      if (below) keep.add(n.employee.id);
      return self || below;
    };
    tree.forEach(walk);
    return keep;
  }, [tree, needle]);
  const isOpen = (id: string) => onPath.has(id) || !closed.has(id);
  const toggle = (id: string) =>
    setClosed((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const node = (n: OrgNode<OrgPerson>) => {
    const e = n.employee;
    const hit = needle && [e.name, e.jobTitle, e.department?.name].some((v) => v?.toLowerCase().includes(needle));
    const open = isOpen(e.id);
    const team = count(n);
    return (
      <li key={e.id} className="org-node">
        <div className="relative inline-flex flex-col items-center">
          <Link
            href={`/w/${slug}/hr/${e.id}`}
            className={cn(
              "relative flex w-52 flex-col items-center gap-2 overflow-hidden rounded-2xl border bg-card px-3 pt-4 pb-3 text-center shadow-sm transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md focus-visible:outline-2 focus-visible:outline-ring motion-reduce:hover:translate-y-0",
              hit && "border-primary ring-2 ring-primary/30",
            )}
          >
            <span aria-hidden className="absolute inset-x-0 top-0 h-1" style={{ backgroundColor: e.department?.color ?? "var(--color-primary)" }} />
            <PersonAvatar id={e.id} name={e.name} hasPhoto={e.hasPhoto} size="lg" />
            <span className="w-full min-w-0">
              <span className="block truncate text-sm font-semibold" dir="auto">
                {e.name}
              </span>
              <span className="block truncate text-xs text-muted-foreground" dir="auto">
                {e.jobTitle || "—"}
              </span>
              {e.department && (
                <span className="mt-1 inline-block max-w-full truncate rounded-full px-2 py-0.5 text-[11px] font-medium" style={{ backgroundColor: `${e.department.color}1a`, color: e.department.color }} dir="auto">
                  {e.department.name}
                </span>
              )}
            </span>
          </Link>
          {n.reports.length > 0 && (
            <button
              type="button"
              onClick={() => toggle(e.id)}
              aria-expanded={open}
              aria-label={open ? t("Fold {name}'s team", { name: e.name }) : t("Show {name}'s team", { name: e.name })}
              className="relative z-10 -mt-3 inline-flex h-6 cursor-pointer items-center gap-1 rounded-full border bg-background px-2 text-xs font-semibold tabular-nums shadow-sm transition-colors hover:border-primary/50 hover:text-primary focus-visible:outline-2 focus-visible:outline-ring"
            >
              {team}
              <ChevronDown className={cn("size-3.5 transition-transform", !open && "-rotate-90 rtl:rotate-90")} aria-hidden />
            </button>
          )}
        </div>
        {n.reports.length > 0 && open && <ul>{n.reports.map(node)}</ul>}
      </li>
    );
  };

  return (
    <section aria-label={t("Org chart")} className="overflow-hidden rounded-2xl border bg-card">
      <div className="flex flex-wrap items-center gap-2 border-b px-4 py-3">
        <div className="relative min-w-48 flex-1">
          <Search className="pointer-events-none absolute top-1/2 size-4 -translate-y-1/2 text-muted-foreground inset-s-3" aria-hidden />
          <Input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("Find a person, job or department…")} aria-label={t("Find in the org chart")} className="h-9 ps-9" />
        </div>
        <Button variant="outline" size="sm" onClick={() => setClosed(new Set())}>
          {t("Open all")}
        </Button>
        <Button variant="outline" size="sm" onClick={() => setClosed(new Set(tree.flatMap(function ids(n): string[] { return n.reports.length ? [n.employee.id, ...n.reports.flatMap(ids)] : []; })))}>
          {t("Fold all")}
        </Button>
        <div className="inline-flex items-center rounded-lg border">
          <Button variant="ghost" size="icon" className="size-8" onClick={() => setZoom((z) => Math.max(0.5, +(z - 0.1).toFixed(1)))} aria-label={t("Zoom out")}>
            <Minus className="size-4" />
          </Button>
          <span className="w-12 text-center text-xs tabular-nums" aria-live="polite">
            {Math.round(zoom * 100)}%
          </span>
          <Button variant="ghost" size="icon" className="size-8" onClick={() => setZoom((z) => Math.min(1.5, +(z + 0.1).toFixed(1)))} aria-label={t("Zoom in")}>
            <Plus className="size-4" />
          </Button>
        </div>
      </div>
      {unplaced > 0 && (
        <p className="border-b bg-amber-500/10 px-4 py-2 text-sm text-amber-900 dark:text-amber-200">
          {t.plural(unplaced, "{count} person doesn't report to anyone yet. Set their manager on their file to place them.", "{count} people don't report to anyone yet. Set their manager on their file to place them.")}
        </p>
      )}
      <div className="overflow-auto bg-[radial-gradient(var(--color-border)_1px,transparent_1px)] [background-size:20px_20px] p-8">
        <div className="org-chart mx-auto w-max origin-top transition-transform duration-200" style={{ transform: `scale(${zoom})` }}>
          <ul>{tree.map(node)}</ul>
        </div>
      </div>
    </section>
  );
}
