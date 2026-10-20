"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { setTaskField } from "@/lib/actions/custom-fields";
import type { FieldDef } from "@/lib/custom-fields";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { nativeSelectClass } from "@/components/resources/resource-fields";
import { cn } from "@/lib/utils";
import { useT } from "@/i18n/client";

/** Inputs for a task's custom field values; each saves on change/blur. */
export function TaskFields({
  taskId,
  fields,
  values,
  readOnly = false,
}: {
  taskId: string;
  readOnly?: boolean;
  fields: FieldDef[];
  values: Record<string, unknown>;
}) {
  const t = useT();
  const [, startTransition] = useTransition();
  if (fields.length === 0) return null;
  const save = (fieldId: string, value: unknown) =>
    startTransition(async () => {
      const r = await setTaskField(taskId, fieldId, value);
      if (!r.ok) toast.error(r.error);
    });

  return (
    <section aria-labelledby="task-fields-heading" className="grid gap-2">
      <h3 id="task-fields-heading" className="text-sm font-medium">
        {t("Fields")}
      </h3>
      {/* A disabled fieldset makes every field read-only at once. */}
      <fieldset disabled={readOnly} className="contents">
      <dl className="grid grid-cols-[7rem_1fr] items-center gap-x-3 gap-y-2 text-sm">
        {fields.map((f) => {
          const id = `cf-${f.id}`;
          const v = values[f.id];
          return (
            <div key={f.id} className="contents">
              <dt className="truncate text-muted-foreground">
                <Label htmlFor={id}>{f.name}</Label>
              </dt>
              <dd>
                {f.type === "checkbox" ? (
                  <input id={id} type="checkbox" defaultChecked={v === true} onChange={(e) => save(f.id, e.target.checked)} className="size-4 accent-[var(--primary)]" />
                ) : f.type === "select" ? (
                  <select id={id} defaultValue={typeof v === "string" ? v : ""} onChange={(e) => save(f.id, e.target.value || null)} className={cn(nativeSelectClass, "w-full sm:w-56")}>
                    <option value="">—</option>
                    {(f.options ?? []).map((o) => (
                      <option key={o.id} value={o.id}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                ) : f.type === "date" ? (
                  <Input id={id} type="date" defaultValue={typeof v === "string" ? v : ""} onChange={(e) => save(f.id, e.target.value || null)} className="h-8 w-full sm:w-56" />
                ) : (
                  <Input
                    id={id}
                    type={f.type === "url" ? "url" : "text"}
                    inputMode={f.type === "number" ? "decimal" : undefined}
                    defaultValue={v === null || v === undefined ? "" : String(v)}
                    onBlur={(e) => {
                      const next = e.target.value.trim();
                      if (next !== (v === null || v === undefined ? "" : String(v))) save(f.id, next || null);
                    }}
                    onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
                    placeholder={f.type === "url" ? "https://…" : undefined}
                    className="h-8 w-full sm:w-56"
                  />
                )}
              </dd>
            </div>
          );
        })}
      </dl>
      </fieldset>
    </section>
  );
}
