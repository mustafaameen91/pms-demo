"use client";

import { cn } from "@/lib/utils";
import { useT } from "@/i18n/client";
import type { T } from "@/i18n/translate";

import { CURRENCIES, RESOURCE_TYPES, resourceTypeInfo, type ResourceType } from "@/lib/constants";
import type { ResourceInput } from "@/lib/actions/resources";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { FieldError } from "@/components/projects/project-fields";
import { SelectBox } from "@/components/ui/select-box";

export const nativeSelectClass =
  "h-8 w-full rounded-lg border border-input bg-transparent px-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 dark:bg-input/30";

export type ResourceDraft = {
  type: ResourceType;
  name: string;
  unit: string;
  unitCost: string;
  currency: string;
  role: string;
  phone: string;
  notes: string;
};

/** Pass the translator so the suggested unit is in the viewer's language. */
export function emptyResourceDraft(type: ResourceType = "material", currency = "USD", t?: T): ResourceDraft {
  const unit = resourceTypeInfo(type).defaultUnit;
  return {
    type,
    name: "",
    unit: t ? t(unit) : unit,
    unitCost: "",
    currency,
    role: "",
    phone: "",
    notes: "",
  };
}

export function draftToInput(d: ResourceDraft): ResourceInput {
  return {
    ...d,
    currency: d.currency as ResourceInput["currency"],
    unitCost: d.unitCost.trim() || null,
    role: d.role,
    phone: d.phone,
    notes: d.notes,
  };
}

const PLACEHOLDERS: Record<ResourceType, string> = {
  material: "Cement (50 kg)",
  equipment: "Excavator",
  labor: "Ahmed Kareem",
  supplier: "Al-Noor Electric Co.",
};

/** Controlled fields for a library resource. `idPrefix` keeps ids unique when two forms exist. */
export function ResourceFields({
  value,
  onChange,
  errors = {},
  lockType,
  idPrefix = "res",
}: {
  value: ResourceDraft;
  onChange: (next: ResourceDraft) => void;
  errors?: Record<string, string>;
  lockType?: boolean;
  idPrefix?: string;
}) {
  const t = useT();
  const info = resourceTypeInfo(value.type);
  const set = <K extends keyof ResourceDraft>(key: K, v: ResourceDraft[K]) => onChange({ ...value, [key]: v });
  const id = (name: string) => `${idPrefix}-${name}`;
  const hasPerson = value.type === "labor" || value.type === "supplier";

  return (
    <div className="grid gap-4">
      <div className="grid gap-1.5">
        <Label htmlFor={id("type")}>{t("Type")}</Label>
        <SelectBox
          id={id("type")}
          value={value.type}
          disabled={lockType}
          onValueChange={(v) => {
            const type = v as ResourceType;
            onChange({ ...value, type, unit: t(resourceTypeInfo(type).defaultUnit) });
          }}
          className={nativeSelectClass}
        >
          {RESOURCE_TYPES.map((rt) => (
            <option key={rt.value} value={rt.value}>
              {t(rt.label)}
            </option>
          ))}
        </SelectBox>
      </div>

      <div className="grid gap-1.5">
        <Label htmlFor={id("name")}>
          {value.type === "labor" ? t("Worker name") : t("Name")} <span aria-hidden className="text-destructive">*</span>
        </Label>
        <Input
          id={id("name")}
          value={value.name}
          onChange={(e) => set("name", e.target.value)}
          placeholder={t(PLACEHOLDERS[value.type])}
          maxLength={120}
          required
          aria-invalid={Boolean(errors.name)}
        />
        <FieldError message={errors.name} />
      </div>

      {hasPerson && (
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="grid gap-1.5">
            <Label htmlFor={id("role")}>{info.roleLabel && t(info.roleLabel)}</Label>
            <Input
              id={id("role")}
              value={value.role}
              onChange={(e) => set("role", e.target.value)}
              placeholder={value.type === "labor" ? t("Electrician") : t("Name of your contact")}
              maxLength={120}
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor={id("phone")}>{t("Phone")}</Label>
            <Input
              id={id("phone")}
              type="tel"
              value={value.phone}
              onChange={(e) => set("phone", e.target.value)}
              maxLength={40}
            />
          </div>
        </div>
      )}

      <div className="grid items-start gap-4 sm:grid-cols-[1fr_2fr]">
        <div className="grid gap-1.5">
          <Label htmlFor={id("unit")}>
            {t("Unit")} <span aria-hidden className="text-destructive">*</span>
          </Label>
          <Input
            id={id("unit")}
            list={id("units")}
            value={value.unit}
            onChange={(e) => set("unit", e.target.value)}
            maxLength={30}
            required
            aria-invalid={Boolean(errors.unit)}
          />
          <datalist id={id("units")}>
            {info.units.map((u) => (
              <option key={u} value={t(u)} />
            ))}
          </datalist>
          <FieldError message={errors.unit} />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor={id("cost")}>{t("Price per {unit}", { unit: value.unit || t("unit") })}</Label>
          <div className="flex gap-2">
            <Input
              id={id("cost")}
              inputMode="decimal"
              value={value.unitCost}
              onChange={(e) => set("unitCost", e.target.value)}
              placeholder="0"
              className="flex-1 tabular-nums"
              aria-invalid={Boolean(errors.unitCost)}
            />
            <label htmlFor={id("currency")} className="sr-only">
              {t("Currency")}
            </label>
            <SelectBox
              id={id("currency")}
              value={value.currency}
              onValueChange={(v) => set("currency", v)}
              className={cn(nativeSelectClass, "w-auto")}
            >
              {CURRENCIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </SelectBox>
          </div>
          <FieldError message={errors.unitCost} />
        </div>
      </div>

      <div className="grid gap-1.5">
        <Label htmlFor={id("notes")}>
          {t("Notes")} <span className="font-normal text-muted-foreground">{t("(optional)")}</span>
        </Label>
        <Textarea id={id("notes")} value={value.notes} onChange={(e) => set("notes", e.target.value)} rows={2} maxLength={1000} />
      </div>
    </div>
  );
}
