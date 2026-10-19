"use client";

import { useState } from "react";
import { CURRENCIES, PROJECT_COLORS } from "@/lib/constants";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useT } from "@/i18n/client";

export type ProjectFieldValues = {
  name: string;
  color: string;
  client: string | null;
  description: string | null;
  startDate: string | null;
  endDate: string | null;
  budget: string | null;
  currency: string;
};

export function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <p role="alert" className="text-sm text-destructive">
      {message}
    </p>
  );
}

/** Name, colour, client, dates, budget and description: shared by create and settings forms. */
export function ProjectFields({
  defaults,
  errors = {},
  onNameChange,
  autoFocus,
}: {
  defaults?: Partial<ProjectFieldValues>;
  errors?: Record<string, string>;
  onNameChange?: (name: string) => void;
  autoFocus?: boolean;
}) {
  const t = useT();
  const [color, setColor] = useState<string>(defaults?.color ?? PROJECT_COLORS[0]);

  return (
    <>
      <input type="hidden" name="color" value={color} />

      <div className="grid gap-1.5">
        <Label htmlFor="project-name">
          {t("Project name")} <span aria-hidden className="text-destructive">*</span>
        </Label>
        <Input
          id="project-name"
          name="name"
          defaultValue={defaults?.name}
          onChange={(e) => onNameChange?.(e.target.value)}
          placeholder={t("Open new branch in Baghdad")}
          required
          minLength={2}
          maxLength={60}
          autoFocus={autoFocus}
          aria-invalid={Boolean(errors.name)}
        />
        <FieldError message={errors.name} />
      </div>

      <div className="grid gap-1.5">
        <Label htmlFor="project-client">
          {t("Client")} <span className="font-normal text-muted-foreground">{t("(optional)")}</span>
        </Label>
        <Input
          id="project-client"
          name="client"
          defaultValue={defaults?.client ?? ""}
          placeholder={t("Who is this project for?")}
          maxLength={120}
        />
      </div>

      <div className="grid items-start gap-4 sm:grid-cols-2">
        <div className="grid gap-1.5">
          <Label htmlFor="project-start">{t("Start date")}</Label>
          <Input id="project-start" name="startDate" type="date" defaultValue={defaults?.startDate ?? ""} />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="project-end">{t("End date")}</Label>
          <Input
            id="project-end"
            name="endDate"
            type="date"
            defaultValue={defaults?.endDate ?? ""}
            aria-invalid={Boolean(errors.endDate)}
          />
          <FieldError message={errors.endDate} />
        </div>
      </div>

      <div className="grid gap-1.5">
        <Label htmlFor="project-budget">{t("Planned budget")}</Label>
        <div className="flex gap-2">
          <Input
            id="project-budget"
            name="budget"
            inputMode="decimal"
            defaultValue={defaults?.budget ?? ""}
            placeholder="50000"
            className="flex-1 tabular-nums"
            aria-invalid={Boolean(errors.budget)}
            aria-describedby="project-budget-help"
          />
          <label htmlFor="project-currency" className="sr-only">
            {t("Currency")}
          </label>
          <select
            id="project-currency"
            name="currency"
            defaultValue={defaults?.currency ?? "USD"}
            className="h-8 rounded-lg border border-input bg-transparent px-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 dark:bg-input/30"
          >
            {CURRENCIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>
        <p id="project-budget-help" className="text-xs text-muted-foreground">
          {t("Total money planned for this project. Expenses will be compared against it.")}
        </p>
        <FieldError message={errors.budget} />
      </div>

      <fieldset className="grid gap-1.5">
        <legend className="mb-1.5 text-sm font-medium">{t("Colour")}</legend>
        <div className="flex flex-wrap gap-2">
          {PROJECT_COLORS.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setColor(c)}
              aria-label={t("Colour {color}", { color: c })}
              aria-pressed={color === c}
              className={cn(
                "size-7 rounded-md ring-offset-2 ring-offset-background transition-shadow disabled:cursor-not-allowed disabled:opacity-50",
                color === c && "ring-2 ring-ring",
              )}
              style={{ backgroundColor: c }}
            />
          ))}
        </div>
      </fieldset>

      <div className="grid gap-1.5">
        <Label htmlFor="project-description">
          {t("Description")} <span className="font-normal text-muted-foreground">{t("(optional)")}</span>
        </Label>
        <Textarea
          id="project-description"
          name="description"
          defaultValue={defaults?.description ?? ""}
          rows={3}
          maxLength={1000}
        />
      </div>
    </>
  );
}
