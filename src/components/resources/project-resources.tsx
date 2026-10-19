"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { AlertTriangle, Loader2, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
  addProjectResource,
  removeProjectResource,
  updateProjectResource,
  type UsageInput,
} from "@/lib/actions/resources";
import type { ProjectResource } from "@/lib/data/resources";
import { RESOURCE_TYPES, resourceTypeInfo, type ResourceType } from "@/lib/constants";
import { cn, formatMoney } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { FieldError } from "@/components/projects/project-fields";
import { RESOURCE_ICONS } from "./resource-library";
import { ResourceFields, draftToInput, emptyResourceDraft, nativeSelectClass, type ResourceDraft } from "./resource-fields";

type LibraryItem = {
  id: string;
  type: ResourceType;
  name: string;
  role: string | null;
  unit: string;
  unitCost: string | null;
  currency: string;
};
type TaskOption = { id: string; number: number; title: string };
type ProjectInfo = { id: string; key: string; currency: string; budget: string | null };

const num = (v: string | null) => (v ? Number(v) : 0);
/** 12 / 12.5 / 1,250 — quantities without trailing zeros. */
const fmtQty = (v: string | number) =>
  Number(v).toLocaleString(undefined, { maximumFractionDigits: 2 });

export function ProjectResourcesView({
  project,
  workspaceSlug,
  usages,
  library,
  tasks,
}: {
  project: ProjectInfo;
  workspaceSlug: string;
  usages: ProjectResource[];
  library: LibraryItem[];
  tasks: TaskOption[];
}) {
  const [addOpen, setAddOpen] = useState(false);
  const [editing, setEditing] = useState<ProjectResource | null>(null);

  const plannedTotal = usages.reduce((s, u) => s + num(u.plannedQty) * num(u.unitCost), 0);
  const usedTotal = usages.reduce((s, u) => s + num(u.usedQty) * num(u.unitCost), 0);
  const budget = project.budget ? Number(project.budget) : null;
  const money = (v: number) => formatMoney(v, project.currency);

  return (
    <>
      <div className="mb-5 flex flex-wrap items-end justify-between gap-4">
        <dl className="grid flex-1 gap-4 sm:grid-cols-3">
          <div className="rounded-xl border bg-card p-4">
            <dt className="text-sm text-muted-foreground">Planned resource cost</dt>
            <dd className="mt-1 text-2xl font-semibold">{money(plannedTotal)}</dd>
            {budget !== null && budget > 0 && (
              <p className={cn("mt-0.5 text-xs", plannedTotal > budget ? "text-destructive" : "text-muted-foreground")}>
                {Math.round((plannedTotal / budget) * 100)}% of the {money(budget)} budget
              </p>
            )}
          </div>
          <div className="rounded-xl border bg-card p-4">
            <dt className="text-sm text-muted-foreground">Used so far</dt>
            <dd className="mt-1 text-2xl font-semibold">{money(usedTotal)}</dd>
            {plannedTotal > 0 && (
              <p className="mt-0.5 text-xs text-muted-foreground">
                {Math.round((usedTotal / plannedTotal) * 100)}% of planned resource cost
              </p>
            )}
          </div>
          <div className="rounded-xl border bg-card p-4">
            <dt className="text-sm text-muted-foreground">Resources</dt>
            <dd className="mt-1 text-2xl font-semibold">{usages.length}</dd>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {RESOURCE_TYPES.map((t) => {
                const n = usages.filter((u) => u.type === t.value).length;
                return n ? `${n} ${(n === 1 ? t.label : t.plural).toLowerCase()}` : null;
              })
                .filter(Boolean)
                .join(" · ") || "None yet"}
            </p>
          </div>
        </dl>
        <Button onClick={() => setAddOpen(true)}>
          <Plus className="size-4" />
          Add resource
        </Button>
      </div>

      {usages.length === 0 ? (
        <div className="rounded-xl border border-dashed px-6 py-14 text-center">
          <p className="font-medium">No resources in this project yet</p>
          <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
            Add the materials, equipment, workers and suppliers this project needs, with planned quantities. Then
            record what was actually used.
          </p>
        </div>
      ) : (
        <div className="grid gap-5">
          {RESOURCE_TYPES.map((t) => {
            const rows = usages.filter((u) => u.type === t.value);
            if (rows.length === 0) return null;
            const Icon = RESOURCE_ICONS[t.value];
            const typePlanned = rows.reduce((s, u) => s + num(u.plannedQty) * num(u.unitCost), 0);
            const typeUsed = rows.reduce((s, u) => s + num(u.usedQty) * num(u.unitCost), 0);
            return (
              <section key={t.value} aria-labelledby={`type-${t.value}`} className="overflow-hidden rounded-xl border bg-card">
                <h2 id={`type-${t.value}`} className="flex items-center gap-2 border-b px-4 py-3 font-semibold">
                  <Icon className="size-4 text-muted-foreground" aria-hidden />
                  {t.plural}
                  <span className="text-xs font-normal text-muted-foreground">{rows.length}</span>
                </h2>
                <div className="relative overflow-x-auto">
                  <table className="w-full min-w-[880px] table-fixed text-sm">
                    <thead className="text-start text-xs text-muted-foreground">
                      <tr className="border-b bg-muted/40">
                        <th scope="col" className="w-[22%] py-2 pe-3 ps-4 font-medium">Resource</th>
                        <th scope="col" className="w-[18%] px-3 py-2 font-medium">Task</th>
                        <th scope="col" className="w-[20%] px-3 py-2 font-medium">Used / planned</th>
                        <th scope="col" className="w-[12%] px-3 py-2 text-end font-medium">Price</th>
                        <th scope="col" className="w-[10%] px-3 py-2 text-end font-medium">Planned cost</th>
                        <th scope="col" className="w-[10%] px-3 py-2 text-end font-medium">Used cost</th>
                        <th scope="col" className="w-[8%] py-2 pe-4 ps-3"><span className="sr-only">Actions</span></th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((u) => {
                        const planned = num(u.plannedQty);
                        const used = num(u.usedQty);
                        const over = planned > 0 && used > planned;
                        const pct = planned > 0 ? Math.min(100, (used / planned) * 100) : used > 0 ? 100 : 0;
                        return (
                          <tr key={u.id} className="border-b last:border-b-0">
                            <td className="py-2.5 pe-3 ps-4">
                              <div className="font-medium">{u.name}</div>
                              {u.role && <div className="text-xs text-muted-foreground">{u.role}</div>}
                            </td>
                            <td className="px-3 py-2.5">
                              {u.taskNumber ? (
                                <Link
                                  href={`/w/${workspaceSlug}/p/${project.key}?task=${project.key}-${u.taskNumber}`}
                                  className="block truncate text-muted-foreground hover:text-foreground hover:underline"
                                >
                                  <span className="font-mono text-xs">{project.key}-{u.taskNumber}</span> {u.taskTitle}
                                </Link>
                              ) : (
                                <span className="text-muted-foreground">Whole project</span>
                              )}
                            </td>
                            <td className="px-3 py-2.5">
                              <div className="flex items-center gap-2">
                                <div
                                  className="h-1.5 flex-1 overflow-hidden rounded-full bg-primary/15"
                                  role="meter"
                                  aria-label={`${u.name} used`}
                                  aria-valuenow={Math.round(pct)}
                                  aria-valuemin={0}
                                  aria-valuemax={100}
                                >
                                  <div
                                    className={cn("h-full rounded-full", over ? "bg-destructive" : "bg-primary")}
                                    style={{ width: `${pct}%` }}
                                  />
                                </div>
                                <span className={cn("text-xs whitespace-nowrap tabular-nums", over ? "font-medium text-destructive" : "text-muted-foreground")}>
                                  {fmtQty(used)} / {fmtQty(planned)} {u.unit}
                                </span>
                              </div>
                              {over && (
                                <p className="mt-0.5 flex items-center gap-1 text-xs text-destructive">
                                  <AlertTriangle className="size-3" aria-hidden />
                                  {fmtQty(used - planned)} {u.unit} over plan
                                </p>
                              )}
                            </td>
                            <td className="px-3 py-2.5 text-end whitespace-nowrap tabular-nums">
                              {money(num(u.unitCost))}
                              <span className="text-muted-foreground"> / {u.unit}</span>
                            </td>
                            <td className="px-3 py-2.5 text-end whitespace-nowrap tabular-nums">{money(planned * num(u.unitCost))}</td>
                            <td className={cn("px-3 py-2.5 text-end whitespace-nowrap tabular-nums", over && "text-destructive")}>
                              {money(used * num(u.unitCost))}
                            </td>
                            <td className="py-2 pe-4 ps-3 text-end">
                              <Button variant="ghost" size="sm" onClick={() => setEditing(u)} aria-label={`Edit ${u.name}`}>
                                <Pencil className="size-4" />
                                Edit
                              </Button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                    <tfoot>
                      <tr className="border-t bg-muted/40 text-xs">
                        <th scope="row" colSpan={4} className="py-2 pe-3 ps-4 text-start font-medium">
                          {t.plural} total
                        </th>
                        <td className="px-3 py-2 text-end font-medium tabular-nums">{money(typePlanned)}</td>
                        <td className="px-3 py-2 text-end font-medium tabular-nums">{money(typeUsed)}</td>
                        <td />
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </section>
            );
          })}
        </div>
      )}

      <AddResourceDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        project={project}
        library={library}
        tasks={tasks}
      />
      <EditUsageDialog usage={editing} onClose={() => setEditing(null)} project={project} tasks={tasks} />
    </>
  );
}

// --- Usage fields (task, quantities, price) ---

type UsageDraft = { taskId: string; plannedQty: string; usedQty: string; unitCost: string; notes: string };

function UsageFields({
  value,
  onChange,
  errors,
  tasks,
  unit,
  currency,
  priceHint,
}: {
  value: UsageDraft;
  onChange: (v: UsageDraft) => void;
  errors: Record<string, string>;
  tasks: TaskOption[];
  unit: string;
  currency: string;
  priceHint?: string;
}) {
  const set = <K extends keyof UsageDraft>(k: K, v: UsageDraft[K]) => onChange({ ...value, [k]: v });
  return (
    <div className="grid gap-4">
      <div className="grid gap-1.5">
        <Label htmlFor="usage-task">For task</Label>
        <select id="usage-task" value={value.taskId} onChange={(e) => set("taskId", e.target.value)} className={nativeSelectClass}>
          <option value="">Whole project</option>
          {tasks.map((t) => (
            <option key={t.id} value={t.id}>
              #{t.number} {t.title}
            </option>
          ))}
        </select>
        <FieldError message={errors.taskId} />
      </div>
      <div className="grid items-start gap-4 sm:grid-cols-3">
        <div className="grid gap-1.5">
          <Label htmlFor="usage-planned">Planned ({unit})</Label>
          <Input id="usage-planned" inputMode="decimal" value={value.plannedQty} onChange={(e) => set("plannedQty", e.target.value)} placeholder="0" className="tabular-nums" aria-invalid={Boolean(errors.plannedQty)} />
          <FieldError message={errors.plannedQty} />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="usage-used">Used so far ({unit})</Label>
          <Input id="usage-used" inputMode="decimal" value={value.usedQty} onChange={(e) => set("usedQty", e.target.value)} placeholder="0" className="tabular-nums" aria-invalid={Boolean(errors.usedQty)} />
          <FieldError message={errors.usedQty} />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="usage-price">Price per {unit} ({currency})</Label>
          <Input id="usage-price" inputMode="decimal" value={value.unitCost} onChange={(e) => set("unitCost", e.target.value)} placeholder="0" className="tabular-nums" aria-invalid={Boolean(errors.unitCost)} aria-describedby={priceHint ? "usage-price-hint" : undefined} />
          <FieldError message={errors.unitCost} />
        </div>
      </div>
      {priceHint && (
        <p id="usage-price-hint" className="-mt-2 text-xs text-muted-foreground">
          {priceHint}
        </p>
      )}
      <div className="grid gap-1.5">
        <Label htmlFor="usage-notes">
          Notes <span className="font-normal text-muted-foreground">(optional)</span>
        </Label>
        <Textarea id="usage-notes" value={value.notes} onChange={(e) => set("notes", e.target.value)} rows={2} maxLength={1000} />
      </div>
    </div>
  );
}

const toUsageInput = (d: UsageDraft): UsageInput => ({
  taskId: d.taskId || null,
  plannedQty: d.plannedQty,
  usedQty: d.usedQty,
  unitCost: d.unitCost,
  notes: d.notes,
});

function CostPreview({ draft, unit, currency }: { draft: UsageDraft; unit: string; currency: string }) {
  const n = (v: string) => Number(v.replace(/,/g, "")) || 0;
  return (
    <p className="rounded-lg bg-muted px-3 py-2 text-sm">
      Planned cost <span className="font-semibold tabular-nums">{formatMoney(n(draft.plannedQty) * n(draft.unitCost), currency)}</span>
      <span className="text-muted-foreground"> · </span>
      Used cost <span className="font-semibold tabular-nums">{formatMoney(n(draft.usedQty) * n(draft.unitCost), currency)}</span>
      <span className="sr-only"> (price per {unit})</span>
    </p>
  );
}

// --- Add ---

function AddResourceDialog({
  open,
  onOpenChange,
  project,
  library,
  tasks,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  project: ProjectInfo;
  library: LibraryItem[];
  tasks: TaskOption[];
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Add resource to project</DialogTitle>
          <DialogDescription>Pick one from your company library, or create a new one.</DialogDescription>
        </DialogHeader>
        {open && <AddResourceForm project={project} library={library} tasks={tasks} onDone={() => onOpenChange(false)} />}
      </DialogContent>
    </Dialog>
  );
}

function AddResourceForm({
  project,
  library,
  tasks,
  onDone,
}: {
  project: ProjectInfo;
  library: LibraryItem[];
  tasks: TaskOption[];
  onDone: () => void;
}) {
  const [mode, setMode] = useState<"library" | "new">(library.length ? "library" : "new");
  const [resourceId, setResourceId] = useState("");
  const [newResource, setNewResource] = useState<ResourceDraft>(emptyResourceDraft("material", project.currency));
  const [usage, setUsage] = useState<UsageDraft>({ taskId: "", plannedQty: "", usedQty: "", unitCost: "", notes: "" });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [pending, startTransition] = useTransition();

  const picked = library.find((r) => r.id === resourceId);
  const unit = mode === "library" ? (picked?.unit ?? "unit") : newResource.unit || "unit";
  const priceHint =
    mode === "library" && picked?.unitCost && picked.currency !== project.currency
      ? `Library price is ${formatMoney(picked.unitCost, picked.currency)}; enter this project's price in ${project.currency}.`
      : undefined;

  function pick(id: string) {
    setResourceId(id);
    const r = library.find((x) => x.id === id);
    // Copy the library price when it's in the project's currency.
    setUsage((u) => ({
      ...u,
      unitCost: r?.unitCost && r.currency === project.currency ? String(Number(r.unitCost)) : "",
    }));
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (mode === "library" && !resourceId) {
      setErrors({ resourceId: "Choose a resource" });
      return;
    }
    startTransition(async () => {
      const source =
        mode === "library" ? { resourceId } : { newResource: draftToInput(newResource) };
      const result = await addProjectResource(project.id, source, toUsageInput(usage));
      if (!result.ok) {
        setErrors(result.fieldErrors ?? {});
        if (!result.fieldErrors) toast.error(result.error);
        return;
      }
      toast.success("Resource added");
      onDone();
    });
  }

  return (
    <form onSubmit={submit} className="grid gap-5">
      <div role="radiogroup" aria-label="Source" className="flex rounded-lg bg-muted p-0.5">
        {(
          [
            { id: "library", label: "From library", disabled: library.length === 0 },
            { id: "new", label: "New resource", disabled: false },
          ] as const
        ).map((o) => (
          <button
            key={o.id}
            type="button"
            role="radio"
            aria-checked={mode === o.id}
            disabled={o.disabled}
            onClick={() => {
              setMode(o.id);
              setErrors({});
              if (o.id === "new") setUsage((u) => ({ ...u, unitCost: newResource.unitCost }));
            }}
            className={cn(
              "h-8 flex-1 rounded-md text-sm text-muted-foreground transition-colors hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50",
              mode === o.id && "bg-background font-medium text-foreground shadow-sm",
            )}
          >
            {o.label}
          </button>
        ))}
      </div>

      {mode === "library" ? (
        <div className="grid gap-1.5">
          <Label htmlFor="pick-resource">Resource</Label>
          <select
            id="pick-resource"
            value={resourceId}
            onChange={(e) => pick(e.target.value)}
            className={nativeSelectClass}
            aria-invalid={Boolean(errors.resourceId)}
          >
            <option value="">Choose…</option>
            {RESOURCE_TYPES.map((t) => {
              const items = library.filter((r) => r.type === t.value);
              if (!items.length) return null;
              return (
                <optgroup key={t.value} label={t.plural}>
                  {items.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name}
                      {r.role ? ` (${r.role})` : ""} — {r.unitCost ? `${formatMoney(r.unitCost, r.currency)} / ${r.unit}` : r.unit}
                    </option>
                  ))}
                </optgroup>
              );
            })}
          </select>
          <FieldError message={errors.resourceId} />
        </div>
      ) : (
        <div className="rounded-lg border p-4">
          <ResourceFields
            idPrefix="new-res"
            value={newResource}
            onChange={(next) => {
              // Keep the project price in sync while it's still untouched.
              if (usage.unitCost === newResource.unitCost) setUsage((u) => ({ ...u, unitCost: next.unitCost }));
              setNewResource(next);
            }}
            errors={errors}
          />
          <p className="mt-3 text-xs text-muted-foreground">It will also be saved in your company library.</p>
        </div>
      )}

      <UsageFields
        value={usage}
        onChange={setUsage}
        errors={errors}
        tasks={tasks}
        unit={unit}
        currency={project.currency}
        priceHint={priceHint}
      />
      <CostPreview draft={usage} unit={unit} currency={project.currency} />

      <DialogFooter>
        <Button type="button" variant="ghost" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" disabled={pending}>
          {pending && <Loader2 className="size-4 animate-spin" />}
          Add to project
        </Button>
      </DialogFooter>
    </form>
  );
}

// --- Edit / remove ---

function EditUsageDialog({
  usage,
  onClose,
  project,
  tasks,
}: {
  usage: ProjectResource | null;
  onClose: () => void;
  project: ProjectInfo;
  tasks: TaskOption[];
}) {
  return (
    <Dialog open={Boolean(usage)} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{usage?.name}</DialogTitle>
          <DialogDescription>
            {usage && `${resourceTypeInfo(usage.type).label}${usage.role ? ` · ${usage.role}` : ""}`} — update quantities used, price
            or task.
          </DialogDescription>
        </DialogHeader>
        {usage && <EditUsageForm key={usage.id} usage={usage} project={project} tasks={tasks} onDone={onClose} />}
      </DialogContent>
    </Dialog>
  );
}

function EditUsageForm({
  usage,
  project,
  tasks,
  onDone,
}: {
  usage: ProjectResource;
  project: ProjectInfo;
  tasks: TaskOption[];
  onDone: () => void;
}) {
  const strip = (v: string) => String(Number(v));
  const [draft, setDraft] = useState<UsageDraft>({
    taskId: usage.taskId && usage.taskNumber ? usage.taskId : "",
    plannedQty: strip(usage.plannedQty),
    usedQty: strip(usage.usedQty),
    unitCost: strip(usage.unitCost),
    notes: usage.notes ?? "",
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [pending, startTransition] = useTransition();

  return (
    <form
      className="grid gap-5"
      onSubmit={(e) => {
        e.preventDefault();
        startTransition(async () => {
          const result = await updateProjectResource(usage.id, toUsageInput(draft));
          if (!result.ok) {
            setErrors(result.fieldErrors ?? {});
            if (!result.fieldErrors) toast.error(result.error);
            return;
          }
          toast.success("Saved");
          onDone();
        });
      }}
    >
      <UsageFields value={draft} onChange={setDraft} errors={errors} tasks={tasks} unit={usage.unit} currency={project.currency} />
      <CostPreview draft={draft} unit={usage.unit} currency={project.currency} />
      <DialogFooter className="sm:justify-between">
        <Button
          type="button"
          variant={confirmRemove ? "destructive" : "ghost"}
          disabled={pending}
          onClick={() => {
            if (!confirmRemove) {
              setConfirmRemove(true);
              return;
            }
            startTransition(async () => {
              const result = await removeProjectResource(usage.id);
              if (!result.ok) {
                toast.error(result.error);
                return;
              }
              toast.success(`${usage.name} removed from project`);
              onDone();
            });
          }}
        >
          <Trash2 className="size-4" />
          {confirmRemove ? "Click again to remove" : "Remove from project"}
        </Button>
        <div className="flex gap-2">
          <Button type="button" variant="ghost" onClick={onDone}>
            Cancel
          </Button>
          <Button type="submit" disabled={pending}>
            {pending && <Loader2 className="size-4 animate-spin" />}
            Save
          </Button>
        </div>
      </DialogFooter>
    </form>
  );
}
