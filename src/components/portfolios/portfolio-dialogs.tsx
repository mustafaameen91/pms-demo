"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, FolderInput, Loader2, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { createPortfolio, deletePortfolio, setPortfolioProjects, updatePortfolio } from "@/lib/actions/portfolios";
import { BRAND_SWATCHES } from "@/lib/branding";
import { cn } from "@/lib/utils";
import { useT } from "@/i18n/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { FieldError } from "@/components/projects/project-fields";

type Portfolio = { id: string; name: string; description: string | null; color: string };

/** "New portfolio" (no `portfolio`) or "Edit". */
export function PortfolioFormButton({ slug, portfolio }: { slug: string; portfolio?: Portfolio }) {
  const t = useT();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: portfolio?.name ?? "", description: portfolio?.description ?? "", color: portfolio?.color ?? BRAND_SWATCHES[0] });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [pending, startTransition] = useTransition();
  return (
    <>
      <Button variant={portfolio ? "outline" : "default"} onClick={() => setOpen(true)}>
        {portfolio ? <Pencil className="size-4" /> : <Plus className="size-4" />}
        {portfolio ? t("Edit") : t("New portfolio")}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <form
            className="grid gap-4"
            onSubmit={(e) => {
              e.preventDefault();
              setErrors({});
              startTransition(async () => {
                const res = portfolio ? await updatePortfolio(portfolio.id, form) : await createPortfolio(slug, form);
                if (!res.ok) return setErrors(res.fieldErrors ?? { form: res.error });
                toast.success(portfolio ? t("Saved") : t("Portfolio created"));
                setOpen(false);
                if (!portfolio && res.data && "id" in res.data) router.push(`/w/${slug}/portfolios/${res.data.id}`);
              });
            }}
          >
            <DialogHeader>
              <DialogTitle>{portfolio ? t("Edit portfolio") : t("New portfolio")}</DialogTitle>
              <DialogDescription>{t("A group of projects whose numbers are added up together, e.g. a branch, a client or a type of work.")}</DialogDescription>
            </DialogHeader>
            <div className="grid gap-1.5">
              <Label htmlFor="pf-name">{t("Name")}</Label>
              <Input id="pf-name" dir="auto" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder={t("Baghdad branch")} maxLength={80} aria-invalid={Boolean(errors.name)} />
              <FieldError message={errors.name} />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="pf-description">
                {t("Description")} <span className="font-normal text-muted-foreground">{t("(optional)")}</span>
              </Label>
              <Textarea id="pf-description" dir="auto" rows={2} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} maxLength={500} />
            </div>
            <fieldset className="grid gap-1.5">
              <legend className="mb-1 text-sm font-medium">{t("Colour")}</legend>
              <div className="flex flex-wrap gap-2" role="radiogroup" aria-label={t("Colour")}>
                {BRAND_SWATCHES.map((c) => (
                  <button
                    key={c}
                    type="button"
                    role="radio"
                    aria-checked={form.color === c}
                    aria-label={c}
                    onClick={() => setForm({ ...form, color: c })}
                    className="flex size-8 cursor-pointer items-center justify-center rounded-full ring-offset-2 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none aria-checked:ring-2 aria-checked:ring-foreground"
                    style={{ backgroundColor: c }}
                  >
                    {form.color === c && <Check className="size-4 text-white" aria-hidden />}
                  </button>
                ))}
              </div>
            </fieldset>
            <FieldError message={errors.form} />
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
                {t("Cancel")}
              </Button>
              <Button type="submit" disabled={pending}>
                {pending && <Loader2 className="size-4 animate-spin" />}
                {portfolio ? t("Save") : t("Create")}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}

type ProjectChoice = { id: string; name: string; key: string; portfolioId: string | null; portfolioName: string | null };

/** Tick the projects that belong to this portfolio. */
export function ManageProjectsButton({ portfolioId, projects }: { portfolioId: string; projects: ProjectChoice[] }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [picked, setPicked] = useState(() => new Set(projects.filter((p) => p.portfolioId === portfolioId).map((p) => p.id)));
  const [pending, startTransition] = useTransition();
  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)}>
        <FolderInput className="size-4" />
        {t("Choose projects")}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t("Projects in this portfolio")}</DialogTitle>
            <DialogDescription>{t("A project can be in one portfolio. Ticking one that's in another moves it here.")}</DialogDescription>
          </DialogHeader>
          {projects.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("No projects yet.")}</p>
          ) : (
            <ul className="grid gap-1">
              {projects.map((p) => {
                const elsewhere = p.portfolioId && p.portfolioId !== portfolioId ? p.portfolioName : null;
                return (
                  <li key={p.id}>
                    <label className={cn("flex cursor-pointer items-center gap-3 rounded-lg border px-3 py-2 text-sm", picked.has(p.id) && "border-primary/40 bg-primary/5")}>
                      <input
                        type="checkbox"
                        checked={picked.has(p.id)}
                        onChange={(e) =>
                          setPicked((s) => {
                            const next = new Set(s);
                            if (e.target.checked) next.add(p.id);
                            else next.delete(p.id);
                            return next;
                          })
                        }
                        className="size-4 accent-primary"
                      />
                      <span className="min-w-0 flex-1">
                        <span className="font-medium">{p.name}</span> <span className="font-mono text-xs text-muted-foreground">{p.key}</span>
                        {elsewhere && <span className="block text-xs text-amber-800 dark:text-amber-300">{t("Now in “{name}”", { name: elsewhere })}</span>}
                      </span>
                    </label>
                  </li>
                );
              })}
            </ul>
          )}
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              {t("Cancel")}
            </Button>
            <Button
              type="button"
              disabled={pending}
              onClick={() =>
                startTransition(async () => {
                  const res = await setPortfolioProjects(portfolioId, [...picked]);
                  if (!res.ok) return void toast.error(res.error);
                  toast.success(t.plural(picked.size, "{count} project in this portfolio", "{count} projects in this portfolio"));
                  setOpen(false);
                })
              }
            >
              {pending && <Loader2 className="size-4 animate-spin" />}
              {t("Save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

export function DeletePortfolioButton({ slug, id }: { slug: string; id: string }) {
  const t = useT();
  const router = useRouter();
  const [confirm, setConfirm] = useState(false);
  const [pending, startTransition] = useTransition();
  return (
    <Button
      variant={confirm ? "destructive" : "ghost"}
      disabled={pending}
      onBlur={() => setConfirm(false)}
      onClick={() => {
        if (!confirm) return setConfirm(true);
        startTransition(async () => {
          const res = await deletePortfolio(id);
          if (!res.ok) return void toast.error(res.error);
          toast.success(t("Portfolio deleted. Its projects are kept."));
          router.push(`/w/${slug}/portfolios`);
        });
      }}
    >
      <Trash2 className="size-4" />
      {confirm ? t("Click again to delete") : t("Delete")}
    </Button>
  );
}
