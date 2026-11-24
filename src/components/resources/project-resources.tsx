"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { AlertTriangle, Boxes, Calculator, Loader2, PackageOpen, Pencil, Plus, Trash2, TrendingUp } from "lucide-react";
import { toast } from "sonner";
import {
  addProjectResource,
  removeProjectResource,
  updateProjectResource,
  type UsageInput,
} from "@/lib/actions/resources";
import type { ProjectResource } from "@/lib/data/resources";
import { RESOURCE_TYPES, resourceTypeInfo, type ResourceType } from "@/lib/constants";
import { cn, formatMoney, formatNumber } from "@/lib/utils";
import { useT } from "@/i18n/client";
import type { T } from "@/i18n/translate";
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
import { SelectBox } from "@/components/ui/select-box";
import { EmptyState, Panel, StatTile } from "@/components/page/kit";

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

/** "3 materials" — per resource type, so each language can inflect it. */
function typeCount(t: T, type: ResourceType, n: number) {
  switch (type) {
    case "material": return t.plural(n, "{count} material", "{count} materials");
    case "equipment": return t.plural(n, "{count} equipment", "{count} equipment");
    case "labor": return t.plural(n, "{count} worker", "{count} workers");
    case "supplier": return t.plural(n, "{count} supplier", "{count} suppliers");
  }
}

/** "Materials total" footer label per resource type. */
function typeTotal(t: T, type: ResourceType) {
  switch (type) {
    case "material": return t("Materials total");
    case "equipment": return t("Equipment total");
    case "labor": return t("Workers total");
    case "supplier": return t("Suppliers total");
  }
}

export function ProjectResourcesView({
  project,
  workspaceSlug,
  usages,
  library,
  tasks,
  canEdit,
}: {
  /** The project manager and admins add and edit resource use; others can look. */
  canEdit: boolean;
  project: ProjectInfo;
  workspaceSlug: string;
  usages: ProjectResource[];
  library: LibraryItem[];
  tasks: TaskOption[];
}) {
  const t = useT();
  /** 12 / 12.5 / 1,250 — quantities without trailing zeros. */
  const fmtQty = (v: string | number) => formatNumber(v, t.intl);
  const [addOpen, setAddOpen] = useState(false);
  const [editing, setEditing] = useState<ProjectResource | null>(null);

  const plannedTotal = usages.reduce((s, u) => s + num(u.plannedQty) * num(u.unitCost), 0);
  const usedTotal = usages.reduce((s, u) => s + num(u.usedQty) * num(u.unitCost), 0);
  const budget = project.budget ? Number(project.budget) : null;
  const money = (v: number) => formatMoney(v, project.currency, t.intl);

  const left = plannedTotal - usedTotal;
  const summaryOfTypes =
    RESOURCE_TYPES.map((rt) => {
      const n = usages.filter((u) => u.type === rt.value).length;
      return n ? typeCount(t, rt.value, n) : null;
    })
      .filter(Boolean)
      .join(" · ") || t("None yet");

  return (
    <div className="grid grid-cols-1 gap-6">
      <dl className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile label={t("Resources")} icon={Boxes} value={usages.length} hint={summaryOfTypes} />
        <StatTile
          label={t("Planned resource cost")}
          icon={Calculator}
          tone={budget !== null && budget > 0 && plannedTotal > budget ? "bad" : "default"}
          value={<span className="text-3xl">{money(plannedTotal)}</span>}
          hint={
            budget !== null && budget > 0
              ? t("{pct}% of the {budget} budget", { pct: String(Math.round((plannedTotal / budget) * 100)), budget: money(budget) })
              : undefined
          }
          share={budget !== null && budget > 0 ? Math.min(1, plannedTotal / budget) : undefined}
          shareLabel={t("Planned resource cost")}
        />
        <StatTile
          label={t("Used so far")}
          icon={TrendingUp}
          value={<span className="text-3xl">{money(usedTotal)}</span>}
          hint={plannedTotal > 0 ? t("{pct}% of planned resource cost", { pct: String(Math.round((usedTotal / plannedTotal) * 100)) }) : undefined}
          share={plannedTotal > 0 ? Math.min(1, usedTotal / plannedTotal) : undefined}
          shareLabel={t("Used so far")}
        />
        <StatTile
          label={t("Left to use")}
          icon={PackageOpen}
          tone={left < 0 ? "bad" : "default"}
          value={<span className="text-3xl">{money(left)}</span>}
          hint={t("Planned minus used")}
        />
      </dl>

      {usages.length === 0 ? (
        <EmptyState
          icon={Boxes}
          title={t("No resources in this project yet")}
          action={
            canEdit && (
              <Button onClick={() => setAddOpen(true)}>
                <Plus className="size-4" />
                {t("Add resource")}
              </Button>
            )
          }
        >
          {t("Add the materials, equipment, workers and suppliers this project needs, with planned quantities. Then record what was actually used.")}
        </EmptyState>
      ) : (
        <div className="grid grid-cols-1 gap-6">
          {canEdit && (
            <div className="flex justify-end">
              <Button onClick={() => setAddOpen(true)}>
                <Plus className="size-4" />
                {t("Add resource")}
              </Button>
            </div>
          )}
          {RESOURCE_TYPES.map((rt) => {
            const rows = usages.filter((u) => u.type === rt.value);
            if (rows.length === 0) return null;
            const Icon = RESOURCE_ICONS[rt.value];
            const typePlanned = rows.reduce((s, u) => s + num(u.plannedQty) * num(u.unitCost), 0);
            const typeUsed = rows.reduce((s, u) => s + num(u.usedQty) * num(u.unitCost), 0);
            return (
              <Panel key={rt.value} id={`type-${rt.value}`} title={t(rt.plural)} icon={Icon} count={rows.length}>
                <div className="relative overflow-x-auto border-t">
                  <table className="w-full min-w-[880px] table-fixed text-sm">
                    <thead className="text-start text-xs text-muted-foreground">
                      <tr className="border-b bg-muted/40">
                        <th scope="col" className="w-[22%] py-2.5 pe-3 ps-5 font-medium">{t("Resource")}</th>
                        <th scope="col" className="w-[18%] px-3 py-2.5 font-medium">{t("Task")}</th>
                        <th scope="col" className="w-[20%] px-3 py-2.5 font-medium">{t("Used / planned")}</th>
                        <th scope="col" className="w-[12%] px-3 py-2.5 text-end font-medium">{t("Price")}</th>
                        <th scope="col" className="w-[10%] px-3 py-2.5 text-end font-medium">{t("Planned cost")}</th>
                        <th scope="col" className="w-[10%] px-3 py-2.5 text-end font-medium">{t("Used cost")}</th>
                        <th scope="col" className="w-[8%] py-2.5 pe-5 ps-3"><span className="sr-only">{t("Actions")}</span></th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((u) => {
                        const planned = num(u.plannedQty);
                        const used = num(u.usedQty);
                        const over = planned > 0 && used > planned;
                        const pct = planned > 0 ? Math.min(100, (used / planned) * 100) : used > 0 ? 100 : 0;
                        return (
                          <tr key={u.id} className="border-b transition-colors last:border-b-0 hover:bg-accent">
                            <td className="py-3 pe-3 ps-5">
                              <div className="font-medium">{u.name}</div>
                              {u.role && <div className="text-xs text-muted-foreground">{u.role}</div>}
                            </td>
                            <td className="px-3 py-3">
                              {u.taskNumber ? (
                                <Link
                                  href={`/w/${workspaceSlug}/p/${project.key}?task=${project.key}-${u.taskNumber}`}
                                  className="block truncate text-muted-foreground hover:text-foreground hover:underline"
                                >
                                  <span className="font-mono text-xs">{project.key}-{u.taskNumber}</span> {u.taskTitle}
                                </Link>
                              ) : (
                                <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">{t("Whole project")}</span>
                              )}
                            </td>
                            <td className="px-3 py-3">
                              <div className="flex items-center gap-2">
                                <div
                                  className="h-2 flex-1 overflow-hidden rounded-full bg-muted"
                                  role="meter"
                                  aria-label={t("{name} used", { name: u.name })}
                                  aria-valuenow={Math.round(pct)}
                                  aria-valuemin={0}
                                  aria-valuemax={100}
                                >
                                  <div className={cn("h-full rounded-full", over ? "bg-destructive" : "bg-primary")} style={{ width: `${pct}%` }} />
                                </div>
                                <span className={cn("text-xs whitespace-nowrap tabular-nums", over ? "font-medium text-destructive" : "text-muted-foreground")}>
                                  {fmtQty(used)} / {fmtQty(planned)} {u.unit}
                                </span>
                              </div>
                              {u.fromTimesheets && <p className="mt-0.5 text-xs text-muted-foreground">{t("From timesheets")}</p>}
                              {over && (
                                <p className="mt-0.5 flex items-center gap-1 text-xs text-destructive">
                                  <AlertTriangle className="size-3" aria-hidden />
                                  {t("{qty} {unit} over plan", { qty: fmtQty(used - planned), unit: u.unit })}
                                </p>
                              )}
                            </td>
                            <td className="px-3 py-3 text-end whitespace-nowrap tabular-nums">
                              {money(num(u.unitCost))}
                              <span className="text-muted-foreground"> / {u.unit}</span>
                            </td>
                            <td className="px-3 py-3 text-end whitespace-nowrap tabular-nums">{money(planned * num(u.unitCost))}</td>
                            <td className={cn("px-3 py-3 text-end font-medium whitespace-nowrap tabular-nums", over && "text-destructive")}>
                              {money(used * num(u.unitCost))}
                            </td>
                            <td className="py-2 pe-5 ps-3 text-end">
                              {canEdit && (
                                <Button variant="ghost" size="sm" onClick={() => setEditing(u)} aria-label={t("Edit {name}", { name: u.name })}>
                                  <Pencil className="size-4" />
                                  {t("Edit")}
                                </Button>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                    <tfoot>
                      <tr className="border-t bg-muted/40 text-xs">
                        <th scope="row" colSpan={4} className="py-2.5 pe-3 ps-5 text-start font-medium">
                          {typeTotal(t, rt.value)}
                        </th>
                        <td className="px-3 py-2.5 text-end font-semibold tabular-nums">{money(typePlanned)}</td>
                        <td className="px-3 py-2.5 text-end font-semibold tabular-nums">{money(typeUsed)}</td>
                        <td />
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </Panel>
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
    </div>
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
  timesheetsHref,
}: {
  value: UsageDraft;
  onChange: (v: UsageDraft) => void;
  errors: Record<string, string>;
  tasks: TaskOption[];
  unit: string;
  currency: string;
  priceHint?: string;
  /** Set for a worker on timesheets: used quantity is filled in from attendance. */
  timesheetsHref?: string;
}) {
  const t = useT();
  const set = <K extends keyof UsageDraft>(k: K, v: UsageDraft[K]) => onChange({ ...value, [k]: v });
  return (
    <div className="grid gap-4">
      <div className="grid gap-1.5">
        <Label htmlFor="usage-task">{t("For task")}</Label>
        <SelectBox id="usage-task" value={value.taskId} onValueChange={(v) => set("taskId", v)} className={nativeSelectClass}>
          <option value="">{t("Whole project")}</option>
          {tasks.map((task) => (
            <option key={task.id} value={task.id}>
              #{task.number} {task.title}
            </option>
          ))}
        </SelectBox>
        <FieldError message={errors.taskId} />
      </div>
      <div className="grid items-start gap-4 sm:grid-cols-3">
        <div className="grid gap-1.5">
          <Label htmlFor="usage-planned">{t("Planned ({unit})", { unit })}</Label>
          <Input id="usage-planned" inputMode="decimal" value={value.plannedQty} onChange={(e) => set("plannedQty", e.target.value)} placeholder="0" className="tabular-nums" aria-invalid={Boolean(errors.plannedQty)} />
          <FieldError message={errors.plannedQty} />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="usage-used">{t("Used so far ({unit})", { unit })}</Label>
          <Input
            id="usage-used"
            inputMode="decimal"
            value={value.usedQty}
            onChange={(e) => set("usedQty", e.target.value)}
            placeholder="0"
            className="tabular-nums"
            readOnly={Boolean(timesheetsHref)}
            aria-describedby={timesheetsHref ? "usage-used-hint" : undefined}
            aria-invalid={Boolean(errors.usedQty)}
          />
          {timesheetsHref && (
            <p id="usage-used-hint" className="text-xs text-muted-foreground">
              {t("Filled in from attendance.")}{" "}
              <Link href={timesheetsHref} className="text-primary underline-offset-4 hover:underline">
                {t("Timesheets")}
              </Link>
            </p>
          )}
          <FieldError message={errors.usedQty} />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="usage-price">{t("Price per {unit} ({currency})", { unit, currency })}</Label>
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
          {t("Notes")} <span className="font-normal text-muted-foreground">{t("(optional)")}</span>
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
  const t = useT();
  const n = (v: string) => Number(v.replace(/,/g, "")) || 0;
  return (
    <p className="rounded-lg bg-muted px-3 py-2 text-sm">
      {t("Planned cost")} <span className="font-semibold tabular-nums">{formatMoney(n(draft.plannedQty) * n(draft.unitCost), currency, t.intl)}</span>
      <span className="text-muted-foreground"> · </span>
      {t("Used cost")} <span className="font-semibold tabular-nums">{formatMoney(n(draft.usedQty) * n(draft.unitCost), currency, t.intl)}</span>
      <span className="sr-only"> {t("(price per {unit})", { unit })}</span>
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
  const t = useT();
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{t("Add resource to project")}</DialogTitle>
          <DialogDescription>{t("Pick one from your company library, or create a new one.")}</DialogDescription>
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
  const t = useT();
  const [mode, setMode] = useState<"library" | "new">(library.length ? "library" : "new");
  const [resourceId, setResourceId] = useState("");
  const [newResource, setNewResource] = useState<ResourceDraft>(emptyResourceDraft("material", project.currency, t));
  const [usage, setUsage] = useState<UsageDraft>({ taskId: "", plannedQty: "", usedQty: "", unitCost: "", notes: "" });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [pending, startTransition] = useTransition();

  const picked = library.find((r) => r.id === resourceId);
  const unit = mode === "library" ? (picked?.unit ?? t("unit")) : newResource.unit || t("unit");
  const priceHint =
    mode === "library" && picked?.unitCost && picked.currency !== project.currency
      ? t("Library price is {price}; enter this project's price in {currency}.", {
          price: formatMoney(picked.unitCost, picked.currency, t.intl),
          currency: project.currency,
        })
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
      setErrors({ resourceId: t("Choose a resource") });
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
      toast.success(t("Resource added"));
      onDone();
    });
  }

  return (
    <form onSubmit={submit} className="grid gap-5">
      <div role="radiogroup" aria-label={t("Source")} className="flex rounded-lg bg-muted p-0.5">
        {(
          [
            { id: "library", label: t("From library"), disabled: library.length === 0 },
            { id: "new", label: t("New resource"), disabled: false },
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
          <Label htmlFor="pick-resource">{t("Resource")}</Label>
          <SelectBox
            id="pick-resource"
            value={resourceId}
            onValueChange={(v) => pick(v)}
            className={nativeSelectClass}
            aria-invalid={Boolean(errors.resourceId)}
          >
            <option value="">{t("Choose…")}</option>
            {RESOURCE_TYPES.map((rt) => {
              const items = library.filter((r) => r.type === rt.value);
              if (!items.length) return null;
              return (
                <optgroup key={rt.value} label={t(rt.plural)}>
                  {items.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name}
                      {r.role ? ` (${r.role})` : ""} — {r.unitCost ? `${formatMoney(r.unitCost, r.currency, t.intl)} / ${r.unit}` : r.unit}
                    </option>
                  ))}
                </optgroup>
              );
            })}
          </SelectBox>
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
          <p className="mt-3 text-xs text-muted-foreground">{t("It will also be saved in your company library.")}</p>
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
          {t("Cancel")}
        </Button>
        <Button type="submit" disabled={pending}>
          {pending && <Loader2 className="size-4 animate-spin" />}
          {t("Add to project")}
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
  const t = useT();
  return (
    <Dialog open={Boolean(usage)} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{usage?.name}</DialogTitle>
          <DialogDescription>
            {usage &&
              t("{type} — update quantities used, price or task.", {
                type: `${t(resourceTypeInfo(usage.type).label)}${usage.role ? ` · ${usage.role}` : ""}`,
              })}
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
  const t = useT();
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
          toast.success(t("Saved"));
          onDone();
        });
      }}
    >
      <UsageFields
        value={draft}
        onChange={setDraft}
        errors={errors}
        tasks={tasks}
        unit={usage.unit}
        currency={project.currency}
        // Relative to this project's Resources page.
        timesheetsHref={usage.fromTimesheets ? "timesheets" : undefined}
      />
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
              toast.success(t("{name} removed from project", { name: usage.name }));
              onDone();
            });
          }}
        >
          <Trash2 className="size-4" />
          {confirmRemove ? t("Click again to remove") : t("Remove from project")}
        </Button>
        <div className="flex gap-2">
          <Button type="button" variant="ghost" onClick={onDone}>
            {t("Cancel")}
          </Button>
          <Button type="submit" disabled={pending}>
            {pending && <Loader2 className="size-4 animate-spin" />}
            {t("Save")}
          </Button>
        </div>
      </DialogFooter>
    </form>
  );
}
