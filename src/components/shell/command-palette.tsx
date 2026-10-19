"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  BadgeCheck,
  Bell,
  CheckSquare,
  FolderKanban,
  LayoutDashboard,
  LayoutTemplate,
  Loader2,
  Package,
  ScrollText,
  Search,
  User,
  Users,
} from "lucide-react";
import { searchWorkspace, type SearchResults } from "@/lib/actions/search";
import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { useT } from "@/i18n/client";

const EMPTY: SearchResults = { tasks: [], projects: [], resources: [], people: [] };

/** ⌘K / Ctrl+K: search tasks, projects, resources and people, or jump to a page. */
export function CommandPalette({
  slug,
  open,
  onOpenChange,
  isAdmin,
}: {
  slug: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  isAdmin: boolean;
}) {
  const t = useT();
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResults>(EMPTY);
  const [loading, setLoading] = useState(false);
  const latest = useRef(0);
  const base = `/w/${slug}`;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        onOpenChange(!open);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onOpenChange]);

  // Debounced server search; ignore out-of-order replies.
  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) return;
    const id = ++latest.current;
    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const r = await searchWorkspace(slug, q);
        if (id === latest.current) setResults(r);
      } finally {
        if (id === latest.current) setLoading(false);
      }
    }, 180);
    return () => clearTimeout(timer);
  }, [query, slug]);

  const go = (href: string) => {
    onOpenChange(false);
    setQuery("");
    setResults(EMPTY);
    router.push(href);
  };

  const pages = [
    { label: t("My tasks"), href: `${base}/my-tasks`, icon: CheckSquare },
    { label: t("Inbox"), href: `${base}/inbox`, icon: Bell },
    { label: t("Dashboard"), href: `${base}/dashboard`, icon: LayoutDashboard },
    { label: t("Projects"), href: base, icon: FolderKanban },
    { label: t("Workload"), href: `${base}/workload`, icon: Users },
    { label: t("Resources"), href: `${base}/resources`, icon: Package },
    { label: t("Templates"), href: `${base}/templates`, icon: LayoutTemplate },
    { label: t("Members"), href: `${base}/members`, icon: Users },
    ...(isAdmin
      ? [
          { label: t("Approvals"), href: `${base}/approvals`, icon: BadgeCheck },
          { label: t("Audit log"), href: `${base}/audit`, icon: ScrollText },
        ]
      : []),
  ].filter((p) => !query.trim() || p.label.toLowerCase().includes(query.trim().toLowerCase()));

  const q = query.trim();
  const has = q.length >= 2;
  const nothing = has && !loading && !results.tasks.length && !results.projects.length && !results.resources.length && !results.people.length && !pages.length;

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange} title={t("Search")} description={t("Search tasks, projects, resources and people")}>
      <Command shouldFilter={false}>
        <CommandInput value={query} onValueChange={(v) => { setQuery(v); if (v.trim().length < 2) setResults(EMPTY); }} placeholder={t("Search tasks (e.g. HD-12), projects, people…")} />
        <CommandList className="max-h-[60vh]">
          {loading && (
            <div className="flex items-center gap-2 px-3 py-2 text-xs text-muted-foreground" role="status">
              <Loader2 className="size-3.5 animate-spin" /> {t("Searching…")}
            </div>
          )}
          {nothing && <CommandEmpty>{t("No results for “{query}”.", { query: q })}</CommandEmpty>}
          {has && results.tasks.length > 0 && (
            <CommandGroup heading={t("Tasks")}>
              {results.tasks.map((t) => (
                <CommandItem key={t.key} value={`task-${t.key}`} onSelect={() => go(`${base}/p/${t.projectKey}?task=${t.key}`)}>
                  <span className="w-16 shrink-0 font-mono text-xs text-muted-foreground">{t.key}</span>
                  <span className={t.done ? "truncate text-muted-foreground line-through" : "truncate"}>{t.title}</span>
                  <span className="ms-auto shrink-0 text-xs text-muted-foreground">
                    {t.projectName} · {t.statusName}
                  </span>
                </CommandItem>
              ))}
            </CommandGroup>
          )}
          {has && results.projects.length > 0 && (
            <CommandGroup heading={t("Projects")}>
              {results.projects.map((p) => (
                <CommandItem key={p.key} value={`project-${p.key}`} onSelect={() => go(`${base}/p/${p.key}/overview`)}>
                  <span aria-hidden className="size-2.5 shrink-0 rounded-sm" style={{ backgroundColor: p.color }} />
                  {p.name}
                  <span className="ms-auto text-xs text-muted-foreground">{p.client ?? p.key}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          )}
          {has && results.resources.length > 0 && (
            <CommandGroup heading={t("Resources")}>
              {results.resources.map((r, i) => (
                <CommandItem key={`${r.name}-${i}`} value={`resource-${i}-${r.name}`} onSelect={() => go(`${base}/resources`)}>
                  <Package className="size-4" />
                  {r.name}
                  {r.role && <span className="text-muted-foreground"> · {r.role}</span>}
                </CommandItem>
              ))}
            </CommandGroup>
          )}
          {has && results.people.length > 0 && (
            <CommandGroup heading={t("People")}>
              {results.people.map((p) => (
                <CommandItem key={p.email} value={`person-${p.email}`} onSelect={() => go(`${base}/members`)}>
                  <User className="size-4" />
                  {p.name}
                  <span className="ms-auto text-xs text-muted-foreground">{p.email}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          )}
          {pages.length > 0 && (
            <CommandGroup heading={t("Go to")}>
              {pages.map((p) => (
                <CommandItem key={p.href} value={`page-${p.label}`} onSelect={() => go(p.href)}>
                  <p.icon className="size-4" />
                  {p.label}
                </CommandItem>
              ))}
            </CommandGroup>
          )}
        </CommandList>
      </Command>
    </CommandDialog>
  );
}

/** Sidebar button that opens the palette (and shows the shortcut). */
export function SearchButton({ onClick }: { onClick: () => void }) {
  const t = useT();
  const [mac, setMac] = useState(true);
  useEffect(() => {
    // Shortcut label only; defaults to ⌘ until the platform is known.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMac(/Mac|iPhone|iPad/.test(navigator.platform));
  }, []);
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex h-8 w-full items-center gap-2 rounded-md border bg-background px-2.5 text-sm text-muted-foreground hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"
    >
      <Search className="size-4" />
      {t("Search")}
      <kbd className="ms-auto rounded border bg-muted px-1.5 font-sans text-[11px]">{mac ? "⌘K" : "Ctrl K"}</kbd>
    </button>
  );
}

