import Link from "next/link";
import { Archive, CircleDashed, FolderKanban, Layers, Package } from "lucide-react";
import { requireWorkspace } from "@/lib/auth/session";
import { listResources } from "@/lib/data/resources";
import { RESOURCE_TYPES, type ResourceType } from "@/lib/constants";
import { cn } from "@/lib/utils";
import { ResourceLibrary } from "@/components/resources/resource-library";
import { getT } from "@/i18n/server";
import { PageHeader, PageShell, StatTile } from "@/components/page/kit";

export async function generateMetadata() {
  const t = await getT();
  return { title: t("Resources") };
}

export default async function ResourcesPage({ params, searchParams }: PageProps<"/w/[slug]/resources">) {
  const [{ slug }, query, tr] = await Promise.all([params, searchParams, getT()]);
  const { workspace } = await requireWorkspace(slug);
  const type = RESOURCE_TYPES.find((t) => t.value === query.type)?.value as ResourceType | undefined;
  const showArchived = query.archived === "1";
  // The tiles count the whole library, whatever type is picked below.
  const [items, all] = await Promise.all([
    listResources(workspace.id, { type, archived: showArchived }),
    listResources(workspace.id, { archived: showArchived }),
  ]);
  const inUse = all.filter((r) => r.projectCount > 0).length;
  const byType = RESOURCE_TYPES.map((t) => ({ ...t, n: all.filter((r) => r.type === t.value).length })).filter((t) => t.n > 0);
  const base = `/w/${workspace.slug}/resources`;
  const href = (t?: string, archived = showArchived) => {
    const p = new URLSearchParams();
    if (t) p.set("type", t);
    if (archived) p.set("archived", "1");
    return p.size ? `${base}?${p}` : base;
  };

  return (
    <PageShell>
      <PageHeader
        icon={showArchived ? Archive : Package}
        title={showArchived ? tr("Archived resources") : tr("Resources")}
        description={tr("Materials, equipment, workers and suppliers your company uses. Add them once, then use them in any project.")}
        actions={
          <Link
            href={href(type, !showArchived)}
            className="flex h-8 items-center gap-1.5 rounded-lg border border-white/25 bg-white/10 px-3 text-sm text-white transition-colors hover:bg-white/20"
          >
            {showArchived ? <Package className="size-4" /> : <Archive className="size-4" />}
            {showArchived ? tr("Active resources") : tr("Archived")}
          </Link>
        }
      />

      {all.length > 0 && (
        <dl className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatTile
            icon={Package}
            label={showArchived ? tr("Archived resources") : tr("Resources")}
            value={all.length}
            hint={byType.map((t) => `${t.n.toLocaleString(tr.intl)} ${tr(t.plural)}`).join(" · ")}
          />
          <StatTile icon={Layers} label={tr("Types")} value={byType.length} hint={tr("Of materials, equipment, workers and suppliers")} />
          <StatTile
            icon={FolderKanban}
            tone="good"
            label={tr("In use on projects")}
            value={inUse}
            hint={tr("Used by at least one active project")}
            share={inUse / all.length}
            shareLabel={tr("Share of resources in use on projects")}
          />
          <StatTile icon={CircleDashed} label={tr("Not used yet")} value={all.length - inUse} hint={tr("In the library, on no active project")} />
        </dl>
      )}

      <nav aria-label={tr("Resource types")} className="flex flex-wrap gap-1 rounded-xl bg-muted p-1 sm:w-fit">
        {[{ value: undefined, plural: "All" }, ...RESOURCE_TYPES].map((t) => (
          <Link
            key={t.plural}
            href={href(t.value)}
            aria-current={type === t.value ? "page" : undefined}
            className={cn(
              "flex h-8 items-center rounded-lg px-3 text-sm font-medium text-muted-foreground transition-colors hover:bg-background/60 hover:text-foreground",
              type === t.value && "bg-card text-primary shadow-sm hover:bg-card hover:text-primary",
            )}
          >
            {tr(t.plural)}
          </Link>
        ))}
      </nav>

      <ResourceLibrary
        workspaceSlug={workspace.slug}
        items={items}
        type={type}
        archived={showArchived}
        canEdit={workspace.role === "owner" || workspace.role === "admin"}
      />
    </PageShell>
  );
}
