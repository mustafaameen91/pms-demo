"use client";

import { useState, useTransition } from "react";
import { ClipboardList, Copy, ExternalLink, Loader2, Pencil, Plus, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { deleteForm, regenerateFormLink, saveForm, setFormEnabled } from "@/lib/actions/forms";
import type { FormConfig, FormQuestion } from "@/lib/db/schema/pm";
import { DEFAULT_FORM_CONFIG } from "@/lib/forms";
import { cn } from "@/lib/utils";
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
import { useT } from "@/i18n/client";
import type { T } from "@/i18n/translate";
import { FieldError } from "./project-fields";
import { nativeSelectClass } from "@/components/resources/resource-fields";

export type ManagedForm = {
  id: string;
  token: string;
  title: string;
  intro: string | null;
  config: FormConfig;
  statusId: string | null;
  assigneeId: string | null;
  enabled: boolean;
  submissions: number;
  lastSubmission: Date | null;
};

type Option = { id: string; name: string };

export function RequestForms({
  projectId,
  forms,
  statuses,
  members,
  appOrigin,
}: {
  projectId: string;
  forms: ManagedForm[];
  statuses: Option[];
  members: Option[];
  appOrigin: string;
}) {
  const t = useT();
  const [editing, setEditing] = useState<ManagedForm | "new" | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const run = (fn: () => Promise<{ ok: boolean; error?: string }>, success: string) =>
    startTransition(async () => {
      const result = await fn();
      if (result.ok) toast.success(success);
      else toast.error(result.error);
    });

  return (
    <section aria-labelledby="forms-heading" className="rounded-xl border bg-card p-5 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 id="forms-heading" className="flex items-center gap-2 font-semibold">
            <ClipboardList className="size-4 text-muted-foreground" aria-hidden />
            {t("Request forms")}
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {t("A public link where anyone can send a request (no account). Each request becomes a task in this project.")}
          </p>
        </div>
        <Button size="sm" onClick={() => setEditing("new")}>
          <Plus className="size-4" />
          {t("New form")}
        </Button>
      </div>

      {forms.length > 0 && (
        <ul className="mt-4 grid gap-3">
          {forms.map((f) => {
            const url = `${appOrigin}/f/${f.token}`;
            return (
              <li key={f.id} className="rounded-lg border p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="min-w-0 flex-1 font-medium">{f.title}</p>
                  <span className={cn("rounded-full border px-2 py-0.5 text-xs", f.enabled ? "border-primary/30 bg-primary/10 text-primary" : "text-muted-foreground")}>
                    {f.enabled ? t("Open|form state") : t("Closed")}
                  </span>
                  <span className="text-xs text-muted-foreground tabular-nums">
                    {t.plural(f.submissions, "{count} request", "{count} requests")}
                  </span>
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <label htmlFor={`form-url-${f.id}`} className="sr-only">
                    {t("Public link for {title}", { title: f.title })}
                  </label>
                  <input id={`form-url-${f.id}`} readOnly value={url} onFocus={(e) => e.currentTarget.select()} className="h-8 min-w-0 flex-1 rounded-lg border bg-muted px-2.5 font-mono text-xs" />
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={async () => {
                      try {
                        await navigator.clipboard.writeText(url);
                        toast.success(t("Form link copied"));
                      } catch {
                        toast(url);
                      }
                    }}
                  >
                    <Copy className="size-4" />
                    {t("Copy")}
                  </Button>
                  <Button size="sm" variant="ghost" asChild>
                    <a href={url} target="_blank" rel="noreferrer" aria-label={t("Open {title}", { title: f.title })}>
                      <ExternalLink className="size-4" />
                      {t("Open")}
                    </a>
                  </Button>
                </div>
                <div className="mt-2 flex flex-wrap gap-2">
                  <Button size="sm" variant="ghost" onClick={() => setEditing(f)} aria-label={t("Edit {title}", { title: f.title })}>
                    <Pencil className="size-4" />
                    {t("Edit")}
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={pending}
                    onClick={() => run(() => setFormEnabled(f.id, !f.enabled), f.enabled ? t("{title} closed", { title: f.title }) : t("{title} is open", { title: f.title }))}
                  >
                    {f.enabled ? t("Close form") : t("Open form")}
                  </Button>
                  <Button size="sm" variant="ghost" disabled={pending} onClick={() => run(() => regenerateFormLink(f.id), t("New link created — the old one no longer works"))}>
                    {t("New link")}
                  </Button>
                  <Button
                    size="sm"
                    variant={confirmDelete === f.id ? "destructive" : "ghost"}
                    disabled={pending}
                    aria-label={confirmDelete === f.id ? t("Confirm deleting {title}", { title: f.title }) : t("Delete {title}", { title: f.title })}
                    onClick={() => {
                      if (confirmDelete !== f.id) return setConfirmDelete(f.id);
                      setConfirmDelete(null);
                      run(() => deleteForm(f.id), t("Form deleted (its tasks stay)"));
                    }}
                  >
                    <Trash2 className="size-4" />
                    {confirmDelete === f.id ? t("Click again") : t("Delete")}
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <Dialog open={editing !== null} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>{editing === "new" ? t("New request form") : t("Edit request form")}</DialogTitle>
            <DialogDescription>{t("Choose what people fill in, and where their requests land.")}</DialogDescription>
          </DialogHeader>
          {editing && (
            <FormEditor
              key={editing === "new" ? "new" : editing.id}
              projectId={projectId}
              form={editing === "new" ? null : editing}
              statuses={statuses}
              members={members}
              onDone={() => setEditing(null)}
            />
          )}
        </DialogContent>
      </Dialog>
    </section>
  );
}

const ASK_VALUES = ["off", "optional", "required"] as const;
const askLabel = (v: (typeof ASK_VALUES)[number], t: T) =>
  ({ off: t("Don't ask"), optional: t("Optional"), required: t("Required") })[v];

function FormEditor({
  projectId,
  form,
  statuses,
  members,
  onDone,
}: {
  projectId: string;
  form: ManagedForm | null;
  statuses: Option[];
  members: Option[];
  onDone: () => void;
}) {
  const t = useT();
  const [title, setTitle] = useState(form?.title ?? "");
  const [intro, setIntro] = useState(form?.intro ?? "");
  const [statusId, setStatusId] = useState(form?.statusId ?? "");
  const [assigneeId, setAssigneeId] = useState(form?.assigneeId ?? "");
  const [config, setConfig] = useState<FormConfig>(form?.config ?? DEFAULT_FORM_CONFIG);
  const [error, setError] = useState<string>();
  const [pending, startTransition] = useTransition();
  const setQ = (i: number, patch: Partial<FormQuestion>) =>
    setConfig((c) => ({ ...c, questions: c.questions.map((q, j) => (j === i ? { ...q, ...patch } : q)) }));

  return (
    <form
      className="grid gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        setError(undefined);
        startTransition(async () => {
          const result = await saveForm(projectId, form?.id ?? null, { title, intro, statusId, assigneeId, config });
          if (!result.ok) return setError(result.error);
          toast.success(form ? t("Form saved") : t("Form created — copy its link to share it"));
          onDone();
        });
      }}
    >
      <div className="grid gap-1.5">
        <Label htmlFor="form-title">{t("Title")}</Label>
        <Input id="form-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder={t("IT help desk / Maintenance request")} maxLength={120} required />
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="form-intro">
          {t("Intro text")} <span className="font-normal text-muted-foreground">{t("(optional)")}</span>
        </Label>
        <Textarea id="form-intro" value={intro} onChange={(e) => setIntro(e.target.value)} rows={2} maxLength={1000} placeholder={t("Tell people what this form is for.")} />
      </div>
      <div className="grid items-start gap-4 sm:grid-cols-2">
        <div className="grid gap-1.5">
          <Label htmlFor="form-status">{t("New requests go to")}</Label>
          <select id="form-status" value={statusId} onChange={(e) => setStatusId(e.target.value)} className={nativeSelectClass}>
            <option value="">{t("The “To do” column")}</option>
            {statuses.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="form-assignee">{t("Assign to")}</Label>
          <select id="form-assignee" value={assigneeId} onChange={(e) => setAssigneeId(e.target.value)} className={nativeSelectClass}>
            <option value="">{t("Nobody (project manager is notified)")}</option>
            {members.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      <fieldset className="grid gap-3 rounded-lg border p-3">
        <legend className="px-1 text-sm font-medium">{t("Ask for")}</legend>
        <p className="-mt-1 text-xs text-muted-foreground">{t("“What do you need?” and “Details” are always asked.")}</p>
        {(["askName", "askEmail", "askPhone"] as const).map((k) => (
          <div key={k} className="flex items-center justify-between gap-3 text-sm">
            <label htmlFor={`cfg-${k}`}>{{ askName: t("Name"), askEmail: t("Email"), askPhone: t("Phone") }[k]}</label>
            <select id={`cfg-${k}`} value={config[k]} onChange={(e) => setConfig((c) => ({ ...c, [k]: e.target.value }))} className={cn(nativeSelectClass, "w-36")}>
              {ASK_VALUES.map((v) => (
                <option key={v} value={v}>
                  {askLabel(v, t)}
                </option>
              ))}
            </select>
          </div>
        ))}
        {(["askPriority", "askNeededBy"] as const).map((k) => (
          <label key={k} className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={config[k]} onChange={(e) => setConfig((c) => ({ ...c, [k]: e.target.checked }))} className="size-4 accent-[var(--primary)]" />
            {k === "askPriority" ? t("How urgent is it?") : t("Needed by (date)")}
          </label>
        ))}
      </fieldset>

      <fieldset className="grid gap-3 rounded-lg border p-3">
        <legend className="px-1 text-sm font-medium">{t("Your own questions")}</legend>
        {config.questions.map((q, i) => (
          <div key={q.id} className="grid gap-2 rounded-md bg-muted/50 p-2">
            <div className="flex gap-2">
              <label htmlFor={`q-label-${q.id}`} className="sr-only">
                {t("Question {number}", { number: i + 1 })}
              </label>
              <Input id={`q-label-${q.id}`} value={q.label} onChange={(e) => setQ(i, { label: e.target.value })} placeholder={t("Question {number}", { number: i + 1 })} maxLength={200} />
              <label htmlFor={`q-type-${q.id}`} className="sr-only">
                {t("Answer type for question {number}", { number: i + 1 })}
              </label>
              <select id={`q-type-${q.id}`} value={q.type} onChange={(e) => setQ(i, { type: e.target.value as FormQuestion["type"] })} className={cn(nativeSelectClass, "w-36")}>
                <option value="text">{t("Short answer")}</option>
                <option value="textarea">{t("Long answer")}</option>
                <option value="choice">{t("Choice")}</option>
              </select>
              <button
                type="button"
                onClick={() => setConfig((c) => ({ ...c, questions: c.questions.filter((_, j) => j !== i) }))}
                aria-label={t("Remove question {number}", { number: i + 1 })}
                className="grid size-8 shrink-0 place-items-center rounded-md text-muted-foreground hover:bg-accent hover:text-destructive"
              >
                <X className="size-4" />
              </button>
            </div>
            {q.type === "choice" && (
              <>
                <label htmlFor={`q-opts-${q.id}`} className="sr-only">
                  {t("Options for question {number}", { number: i + 1 })}
                </label>
                <Input
                  id={`q-opts-${q.id}`}
                  defaultValue={(q.options ?? []).join(", ")}
                  onBlur={(e) => setQ(i, { options: e.target.value.split(",").map((o) => o.trim()).filter(Boolean) })}
                  placeholder={t("Options, separated by commas (e.g. AC, Lights, Plumbing)")}
                />
              </>
            )}
            <label className="flex items-center gap-2 text-xs">
              <input type="checkbox" checked={q.required} onChange={(e) => setQ(i, { required: e.target.checked })} className="size-4 accent-[var(--primary)]" />
              {t("Required")}
            </label>
          </div>
        ))}
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={config.questions.length >= 15}
          onClick={() =>
            setConfig((c) => ({
              ...c,
              questions: [...c.questions, { id: Math.random().toString(36).slice(2, 10), label: "", type: "text", required: false }],
            }))
          }
        >
          <Plus className="size-4" />
          {t("Add question")}
        </Button>
      </fieldset>

      <FieldError message={error} />
      <DialogFooter>
        <Button type="button" variant="ghost" onClick={onDone}>
          {t("Cancel")}
        </Button>
        <Button type="submit" disabled={pending}>
          {pending && <Loader2 className="size-4 animate-spin" />}
          {form ? t("Save form") : t("Create form")}
        </Button>
      </DialogFooter>
    </form>
  );
}
