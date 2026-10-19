"use client";

import { useState, useTransition } from "react";
import { Archive, ArchiveRestore, HardHat, Package, Pencil, Plus, Truck, Wrench } from "lucide-react";
import { toast } from "sonner";
import { setResourceArchived } from "@/lib/actions/resources";
import type { LibraryResource } from "@/lib/data/resources";
import { resourceTypeInfo, type ResourceType } from "@/lib/constants";
import { formatMoney } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { useT } from "@/i18n/client";
import type { T } from "@/i18n/translate";
import { ResourceDialog } from "./resource-dialog";
import type { ResourceDraft } from "./resource-fields";

export const RESOURCE_ICONS: Record<ResourceType, typeof Package> = {
  material: Package,
  equipment: Wrench,
  labor: HardHat,
  supplier: Truck,
};

export function ResourceTypeLabel({ type }: { type: ResourceType }) {
  const t = useT();
  const Icon = RESOURCE_ICONS[type];
  return (
    <span className="inline-flex items-center gap-1.5 text-muted-foreground">
      <Icon className="size-4" aria-hidden />
      {t(resourceTypeInfo(type).label)}
    </span>
  );
}

const ADD_LABEL = (t: T): Record<ResourceType, string> => ({
  material: t("Add material"),
  equipment: t("Add equipment"),
  labor: t("Add worker"),
  supplier: t("Add supplier"),
});

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
  const t = useT();
  const [dialog, setDialog] = useState<{ open: boolean; id?: string; initial?: ResourceDraft }>({ open: false });
  const [pending, startTransition] = useTransition();

  function toggleArchive(item: LibraryResource) {
    startTransition(async () => {
      const result = await setResourceArchived(item.id, !archived);
      if (result.ok) toast.success(archived ? t("{name} restored", { name: item.name }) : t("{name} archived", { name: item.name }));
      else toast.error(result.error);
    });
  }

  const addLabel = type ? ADD_LABEL(t)[type] : t("Add resource");

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
          <p className="font-medium">{archived ? t("No archived resources") : t("No resources yet")}</p>
          {!archived && (
            <p className="mt-1 text-sm text-muted-foreground">
              {t("Add the materials, equipment, workers and suppliers you use, with their usual prices.")}
            </p>
          )}
        </div>
      ) : (
        <div className="relative overflow-x-auto rounded-xl border bg-card">
          <table className="w-full min-w-[760px] text-sm">
            <thead className="text-start text-xs text-muted-foreground">
              <tr className="border-b bg-muted/40">
                <th scope="col" className="py-2 pe-3 ps-4 font-medium">{t("Name")}</th>
                <th scope="col" className="px-3 py-2 font-medium">{t("Type")}</th>
                <th scope="col" className="px-3 py-2 text-end font-medium">{t("Price")}</th>
                <th scope="col" className="px-3 py-2 font-medium">{t("Phone")}</th>
                <th scope="col" className="px-3 py-2 font-medium">{t("Used in")}</th>
                <th scope="col" className="py-2 pe-4 ps-3 text-end font-medium">
                  <span className="sr-only">{t("Actions")}</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id} className="border-b last:border-b-0">
                  <td className="py-2.5 pe-3 ps-4">
                    <div className="font-medium">{item.name}</div>
                    {item.role && <div className="text-xs text-muted-foreground">{item.role}</div>}
                  </td>
                  <td className="px-3 py-2.5 whitespace-nowrap">
                    <ResourceTypeLabel type={item.type} />
                  </td>
                  <td className="px-3 py-2.5 text-end whitespace-nowrap tabular-nums">
                    {item.unitCost ? (
                      <>
                        {formatMoney(item.unitCost, item.currency, t.intl)}
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
                      ? t("No projects")
                      : t.plural(item.projectCount, "{count} project", "{count} projects")}
                  </td>
                  <td className="py-2 pe-4 ps-3">
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
                          aria-label={t("Edit {name}", { name: item.name })}
                        >
                          <Pencil className="size-4" />
                          {t("Edit")}
                        </Button>
                      )}
                      {canArchive && (
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled={pending}
                          onClick={() => toggleArchive(item)}
                          aria-label={archived ? t("Restore {name}", { name: item.name }) : t("Archive {name}", { name: item.name })}
                        >
                          {archived ? <ArchiveRestore className="size-4" /> : <Archive className="size-4" />}
                          {archived ? t("Restore") : t("Archive")}
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
