import Link from "next/link";
import type { Metadata } from "next";
import { Archive, Package } from "lucide-react";
import { requireWorkspace } from "@/lib/auth/session";
import { listResources } from "@/lib/data/resources";
import { RESOURCE_TYPES, type ResourceType } from "@/lib/constants";
import { cn } from "@/lib/utils";
import { ResourceLibrary } from "@/components/resources/resource-library";

export const metadata: Metadata = { title: "Resources" };

export default async function ResourcesPage({ params, searchParams }: PageProps<"/w/[slug]/resources">) {
  const [{ slug }, query] = await Promise.all([params, searchParams]);
  const { workspace } = await requireWorkspace(slug);
  const type = RESOURCE_TYPES.find((t) => t.value === query.type)?.value as ResourceType | undefined;
  const showArchived = query.archived === "1";
  const items = await listResources(workspace.id, { type, archived: showArchived });
  const base = `/w/${workspace.slug}/resources`;
  const href = (t?: string, archived = showArchived) => {
    const p = new URLSearchParams();
    if (t) p.set("type", t);
    if (archived) p.set("archived", "1");
    return p.size ? `${base}?${p}` : base;
  };

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 lg:py-8">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">
            {showArchived ? "Archived resources" : "Resources"}
          </h1>
          <p className="text-sm text-muted-foreground">
            Materials, equipment, workers and suppliers your company uses. Add them once, then use them in any
            project.
          </p>
        </div>
        <Link
          href={href(type, !showArchived)}
          className="flex h-8 items-center gap-1.5 rounded-md px-2.5 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          {showArchived ? <Package className="size-4" /> : <Archive className="size-4" />}
          {showArchived ? "Active resources" : "Archived"}
        </Link>
      </div>

      <nav aria-label="Resource types" className="mb-4 flex flex-wrap gap-1 rounded-lg bg-muted p-0.5 sm:w-fit">
        {[{ value: undefined, plural: "All" }, ...RESOURCE_TYPES].map((t) => (
          <Link
            key={t.plural}
            href={href(t.value)}
            aria-current={type === t.value ? "page" : undefined}
            className={cn(
              "flex h-7 items-center rounded-md px-3 text-sm text-muted-foreground transition-colors hover:text-foreground",
              type === t.value && "bg-background font-medium text-foreground shadow-sm",
            )}
          >
            {t.plural}
          </Link>
        ))}
      </nav>

      <ResourceLibrary
        workspaceSlug={workspace.slug}
        items={items}
        type={type}
        archived={showArchived}
        canArchive={workspace.role === "owner" || workspace.role === "admin"}
      />
    </div>
  );
}
