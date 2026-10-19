"use client";

import { useState, useTransition } from "react";
import { Loader2, Pencil, Plus, SlidersHorizontal, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { createCustomField, deleteCustomField, renameCustomField } from "@/lib/actions/custom-fields";
import { FIELD_TYPES, type FieldDef, type FieldType } from "@/lib/custom-fields";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FieldError } from "./project-fields";
import { nativeSelectClass } from "@/components/resources/resource-fields";

export function CustomFieldsManager({ projectId, fields }: { projectId: string; fields: FieldDef[] }) {
  const [name, setName] = useState("");
  const [type, setType] = useState<FieldType>("text");
  const [options, setOptions] = useState("");
  const [error, setError] = useState<string>();
  const [renaming, setRenaming] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const typeLabel = (t: string) => FIELD_TYPES.find((x) => x.value === t)?.label ?? t;

  const run = (fn: () => Promise<{ ok: boolean; error?: string }>, success: string, after?: () => void) =>
    startTransition(async () => {
      const r = await fn();
      if (!r.ok) return void toast.error(r.error);
      toast.success(success);
      after?.();
    });

  return (
    <section aria-labelledby="cf-heading" className="rounded-xl border bg-card p-5 sm:p-6">
      <h2 id="cf-heading" className="flex items-center gap-2 font-semibold">
        <SlidersHorizontal className="size-4 text-muted-foreground" aria-hidden />
        Custom fields
      </h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Your own task details for this project, e.g. “Floor”, “Contract no.” or “Inspected?”. They appear in the task panel
        and as columns in the Table view.
      </p>

      {fields.length > 0 && (
        <ul className="mt-4 grid divide-y rounded-lg border">
          {fields.map((f) => (
            <li key={f.id} className="flex flex-wrap items-center gap-2 px-3 py-2 text-sm">
              {renaming === f.id ? (
                <form
                  className="flex flex-1 gap-2"
                  onSubmit={(e) => {
                    e.preventDefault();
                    const v = String(new FormData(e.currentTarget).get("name"));
                    run(() => renameCustomField(f.id, v), "Field renamed", () => setRenaming(null));
                  }}
                >
                  <label htmlFor={`rename-${f.id}`} className="sr-only">
                    New name for {f.name}
                  </label>
                  <Input id={`rename-${f.id}`} name="name" defaultValue={f.name} maxLength={60} autoFocus className="h-8" />
                  <Button type="submit" size="sm" disabled={pending}>
                    Save
                  </Button>
                  <Button type="button" size="sm" variant="ghost" onClick={() => setRenaming(null)}>
                    Cancel
                  </Button>
                </form>
              ) : (
                <>
                  <span className="min-w-0 flex-1">
                    <span className="font-medium">{f.name}</span>
                    <span className="text-muted-foreground"> · {typeLabel(f.type)}</span>
                    {f.options && <span className="text-xs text-muted-foreground"> ({f.options.map((o) => o.label).join(", ")})</span>}
                  </span>
                  <Button size="sm" variant="ghost" onClick={() => setRenaming(f.id)} aria-label={`Rename ${f.name}`}>
                    <Pencil className="size-4" />
                    Rename
                  </Button>
                  <Button
                    size="sm"
                    variant={confirm === f.id ? "destructive" : "ghost"}
                    disabled={pending}
                    aria-label={confirm === f.id ? `Confirm deleting ${f.name} and its values` : `Delete ${f.name}`}
                    onClick={() => {
                      if (confirm !== f.id) return setConfirm(f.id);
                      setConfirm(null);
                      run(() => deleteCustomField(f.id), `${f.name} deleted`);
                    }}
                  >
                    <Trash2 className="size-4" />
                    {confirm === f.id ? "Delete field and values" : "Delete"}
                  </Button>
                </>
              )}
            </li>
          ))}
        </ul>
      )}

      <form
        className="mt-4 grid items-start gap-3 sm:grid-cols-[1fr_10rem_auto]"
        onSubmit={(e) => {
          e.preventDefault();
          setError(undefined);
          startTransition(async () => {
            const r = await createCustomField(projectId, {
              name,
              type,
              options: type === "select" ? options.split(",").map((o) => o.trim()).filter(Boolean) : undefined,
            });
            if (!r.ok) return setError(r.error);
            toast.success(`Field “${name}” added`);
            setName("");
            setOptions("");
          });
        }}
      >
        <div className="grid gap-1.5">
          <Label htmlFor="cf-name">New field</Label>
          <Input id="cf-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Floor" maxLength={60} />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="cf-type">Type</Label>
          <select id="cf-type" value={type} onChange={(e) => setType(e.target.value as FieldType)} className={nativeSelectClass}>
            {FIELD_TYPES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
        </div>
        <Button type="submit" variant="outline" disabled={pending || !name.trim()} className="sm:mt-6">
          {pending ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
          Add field
        </Button>
        {type === "select" && (
          <div className={cn("grid gap-1.5 sm:col-span-3")}>
            <Label htmlFor="cf-options">Options</Label>
            <Input id="cf-options" value={options} onChange={(e) => setOptions(e.target.value)} placeholder="Separated by commas, e.g. Ground, 1st, 2nd, Roof" />
          </div>
        )}
        <div className="sm:col-span-3">
          <FieldError message={error} />
        </div>
      </form>
    </section>
  );
}
