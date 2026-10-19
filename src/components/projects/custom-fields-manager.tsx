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
import { useT } from "@/i18n/client";
import { FieldError } from "./project-fields";
import { nativeSelectClass } from "@/components/resources/resource-fields";

export function CustomFieldsManager({ projectId, fields }: { projectId: string; fields: FieldDef[] }) {
  const t = useT();
  const [name, setName] = useState("");
  const [type, setType] = useState<FieldType>("text");
  const [options, setOptions] = useState("");
  const [error, setError] = useState<string>();
  const [renaming, setRenaming] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const typeLabel = (value: string) => t(FIELD_TYPES.find((x) => x.value === value)?.label ?? value);

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
        {t("Custom fields")}
      </h2>
      <p className="mt-1 text-sm text-muted-foreground">
        {t(
          "Your own task details for this project, e.g. “Floor”, “Contract no.” or “Inspected?”. They appear in the task panel and as columns in the Table view.",
        )}
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
                    run(() => renameCustomField(f.id, v), t("Field renamed"), () => setRenaming(null));
                  }}
                >
                  <label htmlFor={`rename-${f.id}`} className="sr-only">
                    {t("New name for {name}", { name: f.name })}
                  </label>
                  <Input id={`rename-${f.id}`} name="name" defaultValue={f.name} maxLength={60} autoFocus className="h-8" />
                  <Button type="submit" size="sm" disabled={pending}>
                    {t("Save")}
                  </Button>
                  <Button type="button" size="sm" variant="ghost" onClick={() => setRenaming(null)}>
                    {t("Cancel")}
                  </Button>
                </form>
              ) : (
                <>
                  <span className="min-w-0 flex-1">
                    <span className="font-medium">{f.name}</span>
                    <span className="text-muted-foreground"> · {typeLabel(f.type)}</span>
                    {f.options && <span className="text-xs text-muted-foreground"> ({f.options.map((o) => o.label).join(t(", "))})</span>}
                  </span>
                  <Button size="sm" variant="ghost" onClick={() => setRenaming(f.id)} aria-label={t("Rename {name}", { name: f.name })}>
                    <Pencil className="size-4" />
                    {t("Rename")}
                  </Button>
                  <Button
                    size="sm"
                    variant={confirm === f.id ? "destructive" : "ghost"}
                    disabled={pending}
                    aria-label={confirm === f.id ? t("Confirm deleting {name} and its values", { name: f.name }) : t("Delete {name}", { name: f.name })}
                    onClick={() => {
                      if (confirm !== f.id) return setConfirm(f.id);
                      setConfirm(null);
                      run(() => deleteCustomField(f.id), t("{name} deleted", { name: f.name }));
                    }}
                  >
                    <Trash2 className="size-4" />
                    {confirm === f.id ? t("Delete field and values") : t("Delete")}
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
            toast.success(t("Field “{name}” added", { name }));
            setName("");
            setOptions("");
          });
        }}
      >
        <div className="grid gap-1.5">
          <Label htmlFor="cf-name">{t("New field")}</Label>
          <Input id="cf-name" value={name} onChange={(e) => setName(e.target.value)} placeholder={t("e.g. Floor")} maxLength={60} />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="cf-type">{t("Type")}</Label>
          <select id="cf-type" value={type} onChange={(e) => setType(e.target.value as FieldType)} className={nativeSelectClass}>
            {FIELD_TYPES.map((ft) => (
              <option key={ft.value} value={ft.value}>
                {t(ft.label)}
              </option>
            ))}
          </select>
        </div>
        <Button type="submit" variant="outline" disabled={pending || !name.trim()} className="sm:mt-6">
          {pending ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
          {t("Add field")}
        </Button>
        {type === "select" && (
          <div className={cn("grid gap-1.5 sm:col-span-3")}>
            <Label htmlFor="cf-options">{t("Options")}</Label>
            <Input id="cf-options" value={options} onChange={(e) => setOptions(e.target.value)} placeholder={t("Separated by commas, e.g. Ground, 1st, 2nd, Roof")} />
          </div>
        )}
        <div className="sm:col-span-3">
          <FieldError message={error} />
        </div>
      </form>
    </section>
  );
}
