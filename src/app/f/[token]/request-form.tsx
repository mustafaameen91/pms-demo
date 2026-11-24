"use client";

import { useState, useTransition } from "react";
import { CircleCheck, Loader2 } from "lucide-react";
import { submitRequest } from "@/lib/actions/forms";
import type { FormConfig } from "@/lib/db/schema/pm";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { FieldError } from "@/components/projects/project-fields";
import { nativeSelectClass } from "@/components/resources/resource-fields";
import { cn } from "@/lib/utils";
import { useT } from "@/i18n/client";
import { SelectBox } from "@/components/ui/select-box";

const req = <span aria-hidden className="text-destructive"> *</span>;

export function RequestForm({ token, config, renderedAt }: { token: string; config: FormConfig; renderedAt: number }) {
  const t = useT();
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [reference, setReference] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (reference) {
    return (
      <div role="status" className="mt-6 rounded-2xl border border-primary/30 bg-primary/5 p-6 text-center">
        <CircleCheck className="mx-auto size-10 text-primary" aria-hidden />
        <h2 className="mt-3 text-lg font-semibold">{t("Request sent")}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{t("Your reference number is")}</p>
        <p className="mt-1 font-mono text-2xl font-semibold">{reference}</p>
        <p className="mt-3 text-sm text-muted-foreground">{t("Mention it if you contact the team about this request.")}</p>
        <Button variant="outline" className="mt-5" onClick={() => setReference(null)}>
          {t("Send another request")}
        </Button>
      </div>
    );
  }

  const person = (key: "name" | "email" | "phone", mode: FormConfig["askName"], label: string, type = "text", autoComplete?: string) =>
    mode === "off" ? null : (
      <div className="grid gap-1.5">
        <Label htmlFor={`f-${key}`}>
          {label}
          {mode === "required" ? req : <span className="font-normal text-muted-foreground"> {t("(optional)")}</span>}
        </Label>
        <Input id={`f-${key}`} name={key} type={type} autoComplete={autoComplete} required={mode === "required"} className="h-10" aria-invalid={Boolean(errors[key])} />
        <FieldError message={errors[key]} />
      </div>
    );

  return (
    <form
      className="mt-6 grid gap-5"
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        const get = (k: string) => (f.get(k) as string | null) ?? "";
        setError(null);
        startTransition(async () => {
          const result = await submitRequest(token, {
            subject: get("subject"),
            details: get("details"),
            name: get("name"),
            email: get("email"),
            phone: get("phone"),
            priority: get("priority"),
            neededBy: get("neededBy"),
            answers: Object.fromEntries(config.questions.map((q) => [q.id, get(`q-${q.id}`)])),
            website: get("website"),
            renderedAt,
          });
          if (result.ok) {
            setErrors({});
            setReference(result.data!.reference);
          } else {
            setErrors(result.fieldErrors ?? {});
            setError(result.error);
          }
        });
      }}
    >
      <div className="grid gap-1.5">
        <Label htmlFor="f-subject">{t("What do you need?")}{req}</Label>
        <Input id="f-subject" name="subject" required minLength={3} maxLength={200} className="h-10" placeholder={t("e.g. AC not working in room 3B")} aria-invalid={Boolean(errors.subject)} />
        <FieldError message={errors.subject} />
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="f-details">
          {t("Details")} <span className="font-normal text-muted-foreground">{t("(optional)")}</span>
        </Label>
        <Textarea id="f-details" name="details" rows={4} maxLength={5000} />
      </div>

      {config.questions.map((q) => {
        const id = `f-q-${q.id}`;
        const err = errors[`answers.${q.id}`];
        return (
          <div key={q.id} className="grid gap-1.5">
            <Label htmlFor={id}>
              {q.label}
              {q.required ? req : <span className="font-normal text-muted-foreground"> {t("(optional)")}</span>}
            </Label>
            {q.type === "textarea" ? (
              <Textarea id={id} name={`q-${q.id}`} rows={3} maxLength={5000} required={q.required} aria-invalid={Boolean(err)} />
            ) : q.type === "choice" ? (
              <SelectBox id={id} name={`q-${q.id}`} defaultValue="" required={q.required} className={cn(nativeSelectClass, "h-10")} aria-invalid={Boolean(err)}>
                <option value="">{t("Choose…")}</option>
                {(q.options ?? []).map((o) => (
                  <option key={o}>{o}</option>
                ))}
              </SelectBox>
            ) : (
              <Input id={id} name={`q-${q.id}`} maxLength={500} required={q.required} className="h-10" aria-invalid={Boolean(err)} />
            )}
            <FieldError message={err} />
          </div>
        );
      })}

      {(config.askPriority || config.askNeededBy) && (
        <div className="grid items-start gap-4 sm:grid-cols-2">
          {config.askPriority && (
            <div className="grid gap-1.5">
              <Label htmlFor="f-priority">{t("How urgent?")}</Label>
              <SelectBox id="f-priority" name="priority" defaultValue="" className={cn(nativeSelectClass, "h-10")}>
                <option value="">{t("Normal")}</option>
                <option value="low">{t("Low")}</option>
                <option value="medium">{t("Medium")}</option>
                <option value="high">{t("High")}</option>
                <option value="urgent">{t("Urgent")}</option>
              </SelectBox>
            </div>
          )}
          {config.askNeededBy && (
            <div className="grid gap-1.5">
              <Label htmlFor="f-needed">
                {t("Needed by")} <span className="font-normal text-muted-foreground">{t("(optional)")}</span>
              </Label>
              <Input id="f-needed" name="neededBy" type="date" className="h-10" />
            </div>
          )}
        </div>
      )}

      {(config.askName !== "off" || config.askEmail !== "off" || config.askPhone !== "off") && (
        <fieldset className="grid gap-4 rounded-xl border p-4">
          <legend className="px-1 text-sm font-medium">{t("Your contact details")}</legend>
          {person("name", config.askName, t("Your name"), "text", "name")}
          {person("email", config.askEmail, t("Email"), "email", "email")}
          {person("phone", config.askPhone, t("Phone"), "tel", "tel")}
          {config.askEmail !== "off" && (
            <p className="text-xs text-muted-foreground">{t("We use these only to follow up on this request.")}</p>
          )}
        </fieldset>
      )}

      {/* Honeypot: hidden from people and screen readers; bots fill it in. */}
      <div aria-hidden className="absolute -inset-s-[9999px] h-px w-px overflow-hidden">
        <label htmlFor="f-website">Website</label>
        <input id="f-website" name="website" tabIndex={-1} autoComplete="off" />
      </div>

      {error && (
        <p role="alert" className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      )}
      <Button type="submit" disabled={pending} className="h-11">
        {pending && <Loader2 className="size-4 animate-spin" />}
        {t("Send request")}
      </Button>
    </form>
  );
}
