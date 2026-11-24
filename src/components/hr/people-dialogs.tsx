"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Building, Check, HardHat, Loader2, Pencil, Plus, Trash2, UserPlus, Users } from "lucide-react";
import { toast } from "sonner";
import { createEmployee, deleteDepartment, importPeople, saveDepartment, type EmployeeInput } from "@/lib/actions/hr";
import { EMPLOYMENT_TYPES } from "@/lib/hr";
import { BRAND_SWATCHES } from "@/lib/branding";
import { todayISO } from "@/lib/accomplishment";
import { cn, formatMoney } from "@/lib/utils";
import { useT } from "@/i18n/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SelectBox } from "@/components/ui/select-box";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { FieldError } from "@/components/projects/project-fields";

export type DepartmentRow = { id: string; name: string; color: string; count: number };

/** Quick add: the essentials, then the full file opens to fill in the rest. */
export function NewEmployeeButton({ slug, departments, currency, variant = "default" }: { slug: string; departments: DepartmentRow[]; currency: string; variant?: "default" | "outline" }) {
  const t = useT();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const blank = { name: "", jobTitle: "", departmentId: "", employmentType: "full_time", hireDate: todayISO() };
  const [form, setForm] = useState(blank);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [pending, startTransition] = useTransition();
  return (
    <>
      <Button variant={variant} onClick={() => (setForm(blank), setErrors({}), setOpen(true))}>
        <Plus className="size-4" />
        {t("Add employee")}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <form
            className="grid gap-4"
            onSubmit={(e) => {
              e.preventDefault();
              setErrors({});
              startTransition(async () => {
                const res = await createEmployee(slug, { ...form, employmentType: form.employmentType as EmployeeInput["employmentType"], payBasis: "monthly", currency, allowances: [] });
                if (!res.ok) return setErrors(res.fieldErrors ?? { form: res.error });
                toast.success(t("Employee added"));
                setOpen(false);
                if (res.data) router.push(`/w/${slug}/hr/${res.data.id}`);
              });
            }}
          >
            <DialogHeader>
              <DialogTitle>{t("Add employee")}</DialogTitle>
              <DialogDescription>{t("Start with the essentials. Their file opens next so you can add pay, documents and personal details.")}</DialogDescription>
            </DialogHeader>
            <div className="grid gap-1.5">
              <Label htmlFor="ne-name">{t("Full name")}</Label>
              <Input id="ne-name" dir="auto" autoFocus value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} maxLength={120} aria-invalid={Boolean(errors.name)} />
              <FieldError message={errors.name} />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="ne-title">
                {t("Job title")} <span className="font-normal text-muted-foreground">{t("(optional)")}</span>
              </Label>
              <Input id="ne-title" dir="auto" value={form.jobTitle} onChange={(e) => setForm({ ...form, jobTitle: e.target.value })} placeholder={t("Site engineer")} maxLength={120} />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-1.5">
                <Label htmlFor="ne-dept">{t("Department")}</Label>
                <SelectBox id="ne-dept" className="h-9 w-full" value={form.departmentId} onValueChange={(v) => setForm({ ...form, departmentId: v })}>
                  <option value="">{t("No department")}</option>
                  {departments.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name}
                    </option>
                  ))}
                </SelectBox>
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="ne-type">{t("Employment type")}</Label>
                <SelectBox id="ne-type" className="h-9 w-full" value={form.employmentType} onValueChange={(v) => setForm({ ...form, employmentType: v })}>
                  {EMPLOYMENT_TYPES.map((o) => (
                    <option key={o.value} value={o.value}>
                      {t(o.label)}
                    </option>
                  ))}
                </SelectBox>
              </div>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="ne-hire">{t("Hire date")}</Label>
              <Input id="ne-hire" type="date" value={form.hireDate} onChange={(e) => setForm({ ...form, hireDate: e.target.value })} aria-invalid={Boolean(errors.hireDate)} />
              <FieldError message={errors.hireDate} />
            </div>
            <FieldError message={errors.form} />
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
                {t("Cancel")}
              </Button>
              <Button type="submit" disabled={pending}>
                {pending && <Loader2 className="size-4 animate-spin" />}
                {t("Add and open file")}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}

type Candidates = {
  members: { id: string; name: string; email: string }[];
  workers: { id: string; name: string; role: string | null; unit: string; unitCost: string | null; currency: string }[];
};

/** Everyone the app already knows (members and workers) gets an HR file in one click. */
export function ImportPeopleButton({ slug, candidates, prominent }: { slug: string; candidates: Candidates; prominent?: boolean }) {
  const t = useT();
  const total = candidates.members.length + candidates.workers.length;
  const [open, setOpen] = useState(false);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [pending, startTransition] = useTransition();
  if (total === 0) return null;
  const all = () => new Set([...candidates.members.map((m) => `u:${m.id}`), ...candidates.workers.map((w) => `r:${w.id}`)]);
  const toggle = (key: string, on: boolean) =>
    setPicked((s) => {
      const next = new Set(s);
      if (on) next.add(key);
      else next.delete(key);
      return next;
    });
  const row = (key: string, icon: React.ReactNode, name: string, sub: string) => (
    <li key={key}>
      <label className={cn("flex cursor-pointer items-center gap-3 rounded-lg border px-3 py-2 text-sm transition-colors", picked.has(key) && "border-primary/40 bg-primary/5")}>
        <input type="checkbox" className="size-4 accent-primary" checked={picked.has(key)} onChange={(e) => toggle(key, e.target.checked)} />
        <span aria-hidden className="text-muted-foreground">
          {icon}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate font-medium" dir="auto">
            {name}
          </span>
          <span className="block truncate text-xs text-muted-foreground" dir="auto">
            {sub}
          </span>
        </span>
      </label>
    </li>
  );
  return (
    <>
      <Button variant={prominent ? "default" : "outline"} onClick={() => (setPicked(all()), setOpen(true))}>
        <UserPlus className="size-4" />
        {t("Add from members & workers")}
        <span className="rounded-full bg-primary/15 px-1.5 text-xs font-semibold tabular-nums">{total}</span>
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{t("Add people you already have")}</DialogTitle>
            <DialogDescription>{t("Each one gets an HR file filled in from what Tamm already knows: name, email, trade, phone and rate. You can complete the rest later.")}</DialogDescription>
          </DialogHeader>
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">{t("{picked} of {total} chosen", { picked: picked.size, total })}</span>
            <Button variant="link" size="sm" className="h-auto p-0" onClick={() => setPicked(picked.size === total ? new Set() : all())}>
              {picked.size === total ? t("Clear all") : t("Choose all")}
            </Button>
          </div>
          {candidates.members.length > 0 && (
            <section className="grid gap-2">
              <h3 className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">{t("Members (have a login)")}</h3>
              <ul className="grid gap-1">{candidates.members.map((m) => row(`u:${m.id}`, <Users className="size-4" />, m.name, m.email))}</ul>
            </section>
          )}
          {candidates.workers.length > 0 && (
            <section className="grid gap-2">
              <h3 className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">{t("Workers (from Resources)")}</h3>
              <ul className="grid gap-1">
                {candidates.workers.map((w) =>
                  row(
                    `r:${w.id}`,
                    <HardHat className="size-4" />,
                    w.name,
                    [w.role, w.unitCost ? `${formatMoney(w.unitCost, w.currency, t.intl)} / ${t(w.unit)}` : null].filter(Boolean).join(" · "),
                  ),
                )}
              </ul>
            </section>
          )}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              {t("Cancel")}
            </Button>
            <Button
              disabled={pending || picked.size === 0}
              onClick={() =>
                startTransition(async () => {
                  const keys = [...picked];
                  const res = await importPeople(slug, {
                    userIds: keys.filter((k) => k.startsWith("u:")).map((k) => k.slice(2)),
                    resourceIds: keys.filter((k) => k.startsWith("r:")).map((k) => k.slice(2)),
                  });
                  if (!res.ok) return void toast.error(res.error);
                  toast.success(t.plural(res.data?.count ?? 0, "{count} HR file created", "{count} HR files created"));
                  setOpen(false);
                })
              }
            >
              {pending && <Loader2 className="size-4 animate-spin" />}
              {t.plural(picked.size, "Create {count} file", "Create {count} files")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

/** Add, rename, recolour and remove departments. */
export function DepartmentsButton({ slug, departments }: { slug: string; departments: DepartmentRow[] }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<{ id: string | null; name: string; color: string } | null>(null);
  const [error, setError] = useState<string | undefined>();
  const [pending, startTransition] = useTransition();
  const save = () =>
    editing &&
    startTransition(async () => {
      const res = await saveDepartment(slug, editing.id, { name: editing.name, color: editing.color });
      if (!res.ok) return setError(res.fieldErrors?.name ?? res.error);
      setEditing(null);
      setError(undefined);
    });
  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)}>
        <Building className="size-4" />
        {t("Departments")}
      </Button>
      <Dialog open={open} onOpenChange={(o) => (setOpen(o), o || setEditing(null))}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t("Departments")}</DialogTitle>
            <DialogDescription>{t("Group people by team, e.g. Engineering, Finance, Site crew.")}</DialogDescription>
          </DialogHeader>
          <ul className="grid gap-1">
            {departments.map((d) =>
              editing?.id === d.id ? null : (
                <li key={d.id} className="flex items-center gap-3 rounded-lg border px-3 py-2">
                  <span aria-hidden className="size-3 rounded-full" style={{ backgroundColor: d.color }} />
                  <span className="min-w-0 flex-1 truncate text-sm font-medium" dir="auto">
                    {d.name}
                  </span>
                  <span className="text-xs text-muted-foreground tabular-nums">{t.plural(d.count, "{count} person", "{count} people")}</span>
                  <Button variant="ghost" size="icon" className="size-8" aria-label={t("Edit {name}", { name: d.name })} onClick={() => (setError(undefined), setEditing({ id: d.id, name: d.name, color: d.color }))}>
                    <Pencil className="size-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-8 text-muted-foreground hover:text-destructive"
                    aria-label={t("Delete {name}", { name: d.name })}
                    onClick={() => {
                      if (!confirm(t("Delete “{name}”? Its people stay, without a department.", { name: d.name }))) return;
                      startTransition(async () => void (await deleteDepartment(slug, d.id)));
                    }}
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </li>
              ),
            )}
            {departments.length === 0 && !editing && <li className="text-sm text-muted-foreground">{t("No departments yet.")}</li>}
          </ul>
          {editing ? (
            <form
              className="grid gap-3 rounded-xl border bg-muted/40 p-3"
              onSubmit={(e) => {
                e.preventDefault();
                save();
              }}
            >
              <div className="grid gap-1.5">
                <Label htmlFor="dep-name">{editing.id ? t("Rename") : t("New department")}</Label>
                <Input id="dep-name" dir="auto" autoFocus value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} maxLength={80} aria-invalid={Boolean(error)} />
                <FieldError message={error} />
              </div>
              <div className="flex flex-wrap gap-2" role="radiogroup" aria-label={t("Colour")}>
                {BRAND_SWATCHES.map((c) => (
                  <button
                    key={c}
                    type="button"
                    role="radio"
                    aria-checked={editing.color === c}
                    aria-label={c}
                    onClick={() => setEditing({ ...editing, color: c })}
                    className="flex size-7 cursor-pointer items-center justify-center rounded-full ring-offset-2 ring-offset-background focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none aria-checked:ring-2 aria-checked:ring-foreground"
                    style={{ backgroundColor: c }}
                  >
                    {editing.color === c && <Check className="size-3.5 text-white" aria-hidden />}
                  </button>
                ))}
              </div>
              <div className="flex justify-end gap-2">
                <Button type="button" variant="ghost" size="sm" onClick={() => setEditing(null)}>
                  {t("Cancel")}
                </Button>
                <Button type="submit" size="sm" disabled={pending}>
                  {pending && <Loader2 className="size-4 animate-spin" />}
                  {t("Save")}
                </Button>
              </div>
            </form>
          ) : (
            <Button variant="outline" className="justify-self-start" onClick={() => (setError(undefined), setEditing({ id: null, name: "", color: BRAND_SWATCHES[departments.length % BRAND_SWATCHES.length] }))}>
              <Plus className="size-4" />
              {t("New department")}
            </Button>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
