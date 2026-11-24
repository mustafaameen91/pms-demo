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
import { EmptyState } from "@/components/page/kit";
import type { T } from "@/i18n/translate";
import { ResourceDialog } from "./resource-dialog";
import type { ResourceDraft } from "./resource-fields";

export const RESOURCE_ICONS: Record<ResourceType, typeof Package> = {
  material: Package,
  equipment: Wrench,
  labor: HardHat,
  supplier: Truck,
};

/** A resource's type icon in a tinted tile (library rows). */
function TypeTile({ type }: { type: ResourceType }) {
  const Icon = RESOURCE_ICONS[type];
  return (
    <span aria-hidden className="grid size-9 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
      <Icon className="size-4.5" />
    </span>
  );
}

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
  canEdit,
}: {
  workspaceSlug: string;
  items: LibraryResource[];
  type?: ResourceType;
  archived: boolean;
  /** Owners and admins manage the library; members can only look. */
  canEdit: boolean;
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
  const HeadIcon = type ? RESOURCE_ICONS[type] : Package;

  return (
    <>
      {items.length === 0 ? (
        <EmptyState
          icon={Package}
          title={archived ? t("No archived resources") : t("No resources yet")}
          action={
            !archived &&
            canEdit && (
              <Button onClick={() => setDialog({ open: true })}>
                <Plus className="size-4" />
                {addLabel}
              </Button>
            )
          }
        >
          {!archived && t("Add the materials, equipment, workers and suppliers you use, with their usual prices.")}
        </EmptyState>
      ) : (
        <section aria-labelledby="library-heading" className="overflow-hidden rounded-2xl border bg-card">
          <div className="flex flex-wrap items-center justify-between gap-3 px-5 pt-4 pb-3">
            <h2 id="library-heading" className="flex items-center gap-2 font-semibold">
              <HeadIcon className="size-4 text-muted-foreground" aria-hidden />
              {type ? t(resourceTypeInfo(type).plural) : t("All")}
              <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-semibold text-muted-foreground tabular-nums">{items.length.toLocaleString(t.intl)}</span>
            </h2>
            {!archived && canEdit && (
              <Button onClick={() => setDialog({ open: true })}>
                <Plus className="size-4" />
                {addLabel}
              </Button>
            )}
          </div>
          <div className="relative overflow-x-auto border-t">
            <table className="w-full min-w-[760px] text-sm">
              <thead className="text-start text-xs text-muted-foreground">
                <tr className="border-b bg-muted/40">
                  <th scope="col" className="py-2 pe-3 ps-5 font-medium">{t("Name")}</th>
                  <th scope="col" className="px-3 py-2 font-medium">{t("Type")}</th>
                  <th scope="col" className="px-3 py-2 text-end font-medium">{t("Price")}</th>
                  <th scope="col" className="px-3 py-2 font-medium">{t("Phone")}</th>
                  <th scope="col" className="px-3 py-2 font-medium">{t("Used in")}</th>
                  <th scope="col" className="py-2 pe-5 ps-3 text-end font-medium">
                    <span className="sr-only">{t("Actions")}</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr key={item.id} className="border-b transition-colors last:border-b-0 hover:bg-accent">
                    <td className="py-3 pe-3 ps-5">
                      <div className="flex items-center gap-3">
                        <TypeTile type={item.type} />
                        <div className="min-w-0">
                          <div className="font-medium">{item.name}</div>
                          {item.role && <div className="text-xs text-muted-foreground">{item.role}</div>}
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-3 whitespace-nowrap">
                      <ResourceTypeLabel type={item.type} />
                    </td>
                    <td className="px-3 py-3 text-end whitespace-nowrap tabular-nums">
                      {item.unitCost ? (
                        <>
                          <span className="font-semibold">{formatMoney(item.unitCost, item.currency, t.intl)}</span>
                          <span className="text-muted-foreground"> / {item.unit}</span>
                        </>
                      ) : (
                        <span className="text-muted-foreground">— / {item.unit}</span>
                      )}
                    </td>
                    <td className="px-3 py-3 whitespace-nowrap text-muted-foreground">
                      {item.phone ? (
                        <a href={`tel:${item.phone}`} className="hover:underline" dir="ltr">
                          {item.phone}
                        </a>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="px-3 py-3 whitespace-nowrap tabular-nums">
                      {item.projectCount === 0 ? (
                        <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">{t("No projects")}</span>
                      ) : (
                        <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                          {t.plural(item.projectCount, "{count} project", "{count} projects")}
                        </span>
                      )}
                    </td>
                    <td className="py-2 pe-5 ps-3">
                      <div className="flex justify-end gap-1">
                        {!archived && canEdit && (
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
                        {canEdit && (
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
        </section>
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
