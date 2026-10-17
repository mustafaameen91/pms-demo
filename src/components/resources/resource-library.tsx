"use client";

import { useState, useTransition } from "react";
import { Archive, ArchiveRestore, HardHat, Package, Pencil, Plus, Truck, Wrench } from "lucide-react";
import { toast } from "sonner";
import { setResourceArchived } from "@/lib/actions/resources";
import type { LibraryResource } from "@/lib/data/resources";
import { resourceTypeInfo, type ResourceType } from "@/lib/constants";
import { formatMoney } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { ResourceDialog } from "./resource-dialog";
import type { ResourceDraft } from "./resource-fields";

export const RESOURCE_ICONS: Record<ResourceType, typeof Package> = {
  material: Package,
  equipment: Wrench,
  labor: HardHat,
  supplier: Truck,
};

export function ResourceTypeLabel({ type }: { type: ResourceType }) {
  const Icon = RESOURCE_ICONS[type];
  return (
    <span className="inline-flex items-center gap-1.5 text-muted-foreground">
      <Icon className="size-4" aria-hidden />
      {resourceTypeInfo(type).label}
    </span>
  );
}

export function ResourceLibrary({
  workspaceSlug,
  items,
  type,
  archived,
  canArchive,
}: {
  workspaceSlug: string;
  items: LibraryResource[];
  type?: ResourceType;
  archived: boolean;
  canArchive: boolean;
}) {
  const [dialog, setDialog] = useState<{ open: boolean; id?: string; initial?: ResourceDraft }>({ open: false });
  const [pending, startTransition] = useTransition();

  function toggleArchive(item: LibraryResource) {
    startTransition(async () => {
      const result = await setResourceArchived(item.id, !archived);
      if (result.ok) toast.success(archived ? `${item.name} restored` : `${item.name} archived`);
      else toast.error(result.error);
    });
  }

  const addLabel = type ? `Add ${resourceTypeInfo(type).label.toLowerCase()}` : "Add resource";

  return (
    <>
      {!archived && (
        <div className="mb-4 flex justify-end">
          <Button onClick={() => setDialog({ open: true })}>
            <Plus className="size-4" />
            {addLabel}
          </Button>
        </div>
      )}

      {items.length === 0 ? (
        <div className="rounded-xl border border-dashed px-6 py-14 text-center">
          <Package className="mx-auto mb-3 size-8 text-muted-foreground" aria-hidden />
          <p className="font-medium">{archived ? "No archived resources" : "No resources yet"}</p>
          {!archived && (
            <p className="mt-1 text-sm text-muted-foreground">
              Add the materials, equipment, workers and suppliers you use, with their usual prices.
            </p>
          )}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border bg-card">
          <table className="w-full min-w-[760px] text-sm">
            <thead className="text-left text-xs text-muted-foreground">
              <tr className="border-b bg-muted/40">
                <th scope="col" className="py-2 pr-3 pl-4 font-medium">Name</th>
                <th scope="col" className="px-3 py-2 font-medium">Type</th>
                <th scope="col" className="px-3 py-2 text-right font-medium">Price</th>
                <th scope="col" className="px-3 py-2 font-medium">Phone</th>
                <th scope="col" className="px-3 py-2 font-medium">Used in</th>
                <th scope="col" className="py-2 pr-4 pl-3 text-right font-medium">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id} className="border-b last:border-b-0">
                  <td className="py-2.5 pr-3 pl-4">
                    <div className="font-medium">{item.name}</div>
                    {item.role && <div className="text-xs text-muted-foreground">{item.role}</div>}
                  </td>
                  <td className="px-3 py-2.5 whitespace-nowrap">
                    <ResourceTypeLabel type={item.type} />
                  </td>
                  <td className="px-3 py-2.5 text-right whitespace-nowrap tabular-nums">
                    {item.unitCost ? (
                      <>
                        {formatMoney(item.unitCost, item.currency)}
                        <span className="text-muted-foreground"> / {item.unit}</span>
                      </>
                    ) : (
                      <span className="text-muted-foreground">— / {item.unit}</span>
                    )}
                  </td>
                  <td className="px-3 py-2.5 whitespace-nowrap text-muted-foreground">
                    {item.phone ? <a href={`tel:${item.phone}`} className="hover:underline">{item.phone}</a> : "—"}
                  </td>
                  <td className="px-3 py-2.5 whitespace-nowrap text-muted-foreground tabular-nums">
                    {item.projectCount === 0
                      ? "No projects"
                      : `${item.projectCount} ${item.projectCount === 1 ? "project" : "projects"}`}
                  </td>
                  <td className="py-2 pr-4 pl-3">
                    <div className="flex justify-end gap-1">
                      {!archived && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() =>
                            setDialog({
                              open: true,
                              id: item.id,
                              initial: {
                                type: item.type,
                                name: item.name,
                                unit: item.unit,
                                unitCost: item.unitCost ? String(Number(item.unitCost)) : "",
                                currency: item.currency,
                                role: item.role ?? "",
                                phone: item.phone ?? "",
                                notes: item.notes ?? "",
                              },
                            })
                          }
                          aria-label={`Edit ${item.name}`}
                        >
                          <Pencil className="size-4" />
                          Edit
                        </Button>
                      )}
                      {canArchive && (
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled={pending}
                          onClick={() => toggleArchive(item)}
                          aria-label={`${archived ? "Restore" : "Archive"} ${item.name}`}
                        >
                          {archived ? <ArchiveRestore className="size-4" /> : <Archive className="size-4" />}
                          {archived ? "Restore" : "Archive"}
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <ResourceDialog
        open={dialog.open}
        onOpenChange={(open) => setDialog((d) => ({ ...d, open }))}
        workspaceSlug={workspaceSlug}
        resourceId={dialog.id}
        initial={dialog.initial}
        defaultType={type}
      />
    </>
  );
}
