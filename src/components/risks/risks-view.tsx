"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { ArrowRight, ArrowUp, Gauge, Grid3x3, ListChecks, Loader2, Pencil, Plus, ShieldAlert, ShieldCheck, ShieldX, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { deleteRisk, saveRisk } from "@/lib/actions/risks";
import {
  IMPACT_LABELS,
  LIKELIHOOD_LABELS,
  RISK_CATEGORIES,
  RISK_STATUSES,
  isActiveRisk,
  riskLevel,
  riskMatrix,
  riskScore,
  type RiskLevel,
} from "@/lib/risks";
import { cn } from "@/lib/utils";
import { useT } from "@/i18n/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { FieldError } from "@/components/projects/project-fields";
import { nativeSelectClass } from "@/components/resources/resource-fields";
import { LEVEL_STYLE, RiskLevelBadge } from "./risk-level";
import { SelectBox } from "@/components/ui/select-box";
import { EmptyState, GradientIcon, Panel, StatTile } from "@/components/page/kit";

export type RiskItem = {
  id: string;
  number: number;
  title: string;
  description: string | null;
  category: string;
  likelihood: number;
  impact: number;
  mitigation: string | null;
  status: string;
  ownerId: string | null;
  ownerName: string | null;
  taskId: string | null;
  taskNumber: number | null;
  taskTitle: string | null;
  createdById: string | null;
  createdByName: string | null;
};

type Props = {
  projectId: string;
  projectKey: string;
  tasksHref: string;
  risks: RiskItem[];
  members: { id: string; name: string }[];
  tasks: { id: string; number: number; title: string }[];
  canManage: boolean;
  currentUserId: string;
  /** Opened from a link to one risk (e.g. the overview): show it straight away. */
  openRiskId?: string;
};

type Show = "active" | "closed" | "all";
const categoryLabel = (v: string) => RISK_CATEGORIES.find((c) => c.value === v)?.label ?? v;
const statusLabel = (v: string) => RISK_STATUSES.find((s) => s.value === v)?.label ?? v;

export function RisksView(props: Props) {
  const t = useT();
  const router = useRouter();
  const pathname = usePathname();
  const { risks, canManage, currentUserId } = props;
  const [show, setShow] = useState<Show>("active");
  const [cell, setCell] = useState<{ likelihood: number; impact: number } | null>(null);
  const [dialog, setDialog] = useState<{ open: boolean; risk?: RiskItem }>(() => {
    const risk = risks.find((r) => r.id === props.openRiskId);
    return { open: Boolean(risk), risk };
  });

  const active = risks.filter(isActiveRisk);
  const counts: Record<RiskLevel, number> = { high: 0, medium: 0, low: 0 };
  for (const r of active) counts[riskLevel(riskScore(r.likelihood, r.impact))] += 1;
  const averageScore = active.length ? Math.round((active.reduce((sum, r) => sum + riskScore(r.likelihood, r.impact), 0) / active.length) * 10) / 10 : null;
  const shown = risks
    .filter((r) => (show === "all" ? true : show === "closed" ? !isActiveRisk(r) : isActiveRisk(r)))
    .filter((r) => !cell || (r.likelihood === cell.likelihood && r.impact === cell.impact));
  const canEdit = (r: RiskItem) => canManage || r.ownerId === currentUserId || r.createdById === currentUserId;

  return (
    <div className="grid grid-cols-1 gap-6">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex min-w-0 items-center gap-4">
          <GradientIcon icon={ShieldAlert} />
          <div className="min-w-0">
            <h2 className="text-xl font-bold tracking-tight">{t("Risk register")}</h2>
            <p className="mt-0.5 max-w-2xl text-sm text-muted-foreground">
              {t("Things that could go wrong on this project, scored by how likely they are and how much harm they'd do. Keep a plan for each, and close them when they're no longer a threat.")}
            </p>
          </div>
        </div>
        <Button onClick={() => setDialog({ open: true })}>
          <Plus className="size-4" />
          {canManage ? t("Add risk") : t("Raise a risk")}
        </Button>
      </header>

      <dl className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile label={t("Active risks")} value={active.length} icon={ShieldAlert} hint={t.plural(risks.length, "{count} in the register", "{count} in the register")} />
        <StatTile
          label={t("High")}
          value={counts.high}
          icon={ShieldX}
          tone={counts.high ? "bad" : "good"}
          hint={t("Score 15–25: act on these first")}
          share={active.length ? counts.high / active.length : 0}
          shareLabel={t("Share of active risks that are high")}
        />
        <StatTile label={t("Closed|risks")} value={risks.length - active.length} icon={ShieldCheck} tone="good" hint={t("No longer a threat")} />
        <StatTile
          label={t("Average score")}
          value={averageScore === null ? "—" : averageScore}
          icon={Gauge}
          tone={averageScore !== null && averageScore >= 15 ? "bad" : "default"}
          hint={t("Of active risks, out of 25")}
        />
      </dl>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[auto_1fr]">
        <RiskMatrix risks={active} selected={cell} onSelect={(c) => setCell(c)} />

        <Panel id="risk-summary-heading" title={t("Active risks")} icon={ListChecks} count={active.length} className="self-start">
          <div className="grid gap-4 px-5 pb-5">
            <dl className="grid gap-3 sm:grid-cols-3">
              {(["high", "medium", "low"] as const).map((level) => {
                const s = LEVEL_STYLE[level];
                const share = active.length ? counts[level] / active.length : 0;
                return (
                  <div key={level} className={cn("rounded-xl border px-4 py-3", s.badge)}>
                    <dt className="flex items-center gap-1.5 text-xs font-medium">
                      <s.icon className="size-3.5" aria-hidden />
                      {t(s.label)}
                    </dt>
                    <dd className="mt-1 text-3xl font-bold tracking-tight tabular-nums">{counts[level]}</dd>
                    <dd className="mt-2 h-1 overflow-hidden rounded-full bg-current/15">
                      <span className="block h-full rounded-full bg-current" style={{ width: `${Math.round(share * 100)}%` }} />
                    </dd>
                  </div>
                );
              })}
            </dl>
            <p className="text-xs text-muted-foreground">
              {t("Score = likelihood × impact. 1–4 low · 5–12 medium · 15–25 high.")}{" "}
              {t.plural(risks.length - active.length, "{count} closed risk", "{count} closed risks")}
            </p>
          </div>
        </Panel>
      </div>

      <Panel
        id="risk-list-heading"
        title={t("Risks")}
        icon={ListChecks}
        count={shown.length}
        action={
          <div className="flex flex-wrap items-center gap-2">
            {cell && (
              <button
                type="button"
                onClick={() => setCell(null)}
                className="inline-flex min-h-8 cursor-pointer items-center gap-1 rounded-full border bg-accent px-2.5 text-xs hover:bg-accent/70"
              >
                {t("Likelihood {l} × impact {i}", { l: String(cell.likelihood), i: String(cell.impact) })}
                <X className="size-3.5" aria-hidden />
                <span className="sr-only">{t("Clear filter")}</span>
              </button>
            )}
            <div role="group" aria-label={t("Show")} className="flex rounded-lg bg-muted p-0.5 text-sm">
              {(["active", "closed", "all"] as const).map((f) => (
                <button
                  key={f}
                  type="button"
                  aria-pressed={show === f}
                  onClick={() => setShow(f)}
                  className={cn(
                    "cursor-pointer rounded-md px-3 py-1 text-muted-foreground hover:text-foreground",
                    show === f && "bg-background font-medium text-foreground shadow-sm",
                  )}
                >
                  {{ active: t("Active|risks"), closed: t("Closed|risks"), all: t("All") }[f]}
                </button>
              ))}
            </div>
          </div>
        }
      >
        {shown.length === 0 ? (
          <div className="border-t p-5">
            <EmptyState icon={risks.length === 0 ? ShieldCheck : Grid3x3} title={risks.length === 0 ? t("Start the risk register") : t("No risks match.")} className="border-0 py-10">
              {risks.length === 0
                ? t("No risks yet. Add the things that could delay the project, raise its cost, or hurt someone — and what you'll do about them.")
                : null}
            </EmptyState>
          </div>
        ) : (
          <div className="relative overflow-x-auto border-t">
            <table className="w-full min-w-[820px] text-sm">
              <thead className="text-xs text-muted-foreground">
                <tr className="border-b bg-muted/40">
                  <th scope="col" className="py-2.5 pe-3 ps-5 text-start font-medium">{t("Risk")}</th>
                  <th scope="col" className="px-3 py-2 text-start font-medium">{t("Level")}</th>
                  <th scope="col" className="px-3 py-2 text-start font-medium">{t("Likelihood")}</th>
                  <th scope="col" className="px-3 py-2 text-start font-medium">{t("Impact")}</th>
                  <th scope="col" className="px-3 py-2 text-start font-medium">{t("Owner|risk")}</th>
                  <th scope="col" className="px-3 py-2 text-start font-medium">{t("Status")}</th>
                  <th scope="col" className="py-2.5 pe-5 ps-3"><span className="sr-only">{t("Actions")}</span></th>
                </tr>
              </thead>
              <tbody>
                {shown.map((r) => (
                  <tr key={r.id} className={cn("border-b align-top transition-colors last:border-0 hover:bg-accent/60", r.status === "closed" && "text-muted-foreground")}>
                    <td className="py-3 pe-3 ps-5">
                      <p className="font-medium">
                        <span className="font-mono text-xs text-muted-foreground">R-{r.number}</span> {r.title}
                      </p>
                      <p className="mt-0.5 flex flex-wrap gap-x-2 text-xs text-muted-foreground">
                        <span>{t(categoryLabel(r.category))}</span>
                        {r.taskNumber && (
                          <Link href={`${props.tasksHref}?task=${props.projectKey}-${r.taskNumber}`} className="text-primary hover:underline">
                            {props.projectKey}-{r.taskNumber} {r.taskTitle}
                          </Link>
                        )}
                      </p>
                      {r.mitigation && (
                        <p className="mt-1 max-w-xl text-xs">
                          <span className="font-medium">{t("Plan:")}</span> {r.mitigation}
                        </p>
                      )}
                    </td>
                    <td className="px-3 py-3">
                      <RiskLevelBadge likelihood={r.likelihood} impact={r.impact} t={t} />
                    </td>
                    <td className="px-3 py-3 whitespace-nowrap">
                      <span className="tabular-nums">{r.likelihood}</span> · {t(LIKELIHOOD_LABELS[r.likelihood - 1])}
                    </td>
                    <td className="px-3 py-3 whitespace-nowrap">
                      <span className="tabular-nums">{r.impact}</span> · {t(IMPACT_LABELS[r.impact - 1])}
                    </td>
                    <td className="px-3 py-3">{r.ownerName ?? <span className="text-muted-foreground">{t("No owner")}</span>}</td>
                    <td className="px-3 py-3 whitespace-nowrap">{t(statusLabel(r.status))}</td>
                    <td className="py-2.5 pe-5 ps-3 text-end">
                      {canEdit(r) && (
                        <Button variant="ghost" size="sm" onClick={() => setDialog({ open: true, risk: r })} aria-label={t("Edit risk R-{number}", { number: String(r.number) })}>
                          <Pencil className="size-4" />
                          {t("Edit")}
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      <Dialog
        open={dialog.open}
        onOpenChange={(open) => {
          setDialog((d) => ({ ...d, open }));
          if (!open && props.openRiskId) router.replace(pathname, { scroll: false });
        }}
      >
        <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>
              {dialog.risk ? t("Risk R-{number}", { number: String(dialog.risk.number) }) : canManage ? t("Add risk") : t("Raise a risk")}
            </DialogTitle>
            <DialogDescription>
              {dialog.risk?.createdByName
                ? t("Raised by {name}", { name: dialog.risk.createdByName })
                : t("Score how likely it is and how bad it would be. The project manager is told about new risks.")}
            </DialogDescription>
          </DialogHeader>
          {dialog.open && (
            <RiskForm
              key={dialog.risk?.id ?? "new"}
              {...props}
              risk={dialog.risk}
              readOnly={dialog.risk ? !canEdit(dialog.risk) : false}
              onDone={() => setDialog((d) => ({ ...d, open: false }))}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

/** 5 × 5 grid: likelihood up the side, impact along the bottom; each cell shows how many active risks sit there. */
function RiskMatrix({
  risks,
  selected,
  onSelect,
}: {
  risks: { likelihood: number; impact: number }[];
  selected: { likelihood: number; impact: number } | null;
  onSelect: (cell: { likelihood: number; impact: number } | null) => void;
}) {
  const t = useT();
  const cells = riskMatrix(risks);
  return (
    <section aria-labelledby="risk-matrix-heading" className="rounded-2xl border bg-card p-5">
      <h3 id="risk-matrix-heading" className="flex items-center gap-2 font-semibold">
        <Grid3x3 className="size-4 text-muted-foreground" aria-hidden />
        {t("Risk matrix")}
      </h3>
      <p className="mt-0.5 text-xs text-muted-foreground">{t("Choose a square to list the risks in it.")}</p>
      <div className="mt-4 flex gap-2">
        <p className="flex w-5 flex-col items-center justify-center gap-1 text-xs font-medium text-muted-foreground">
          <ArrowUp className="size-3.5" aria-hidden />
          <span className="rotate-180 [writing-mode:vertical-rl]">{t("Likelihood")}</span>
        </p>
        <div>
          <div className="grid grid-cols-[1.5rem_repeat(5,3rem)] gap-1 sm:grid-cols-[1.5rem_repeat(5,3.5rem)]">
            {[5, 4, 3, 2, 1].map((l) => (
              <div key={l} className="contents">
                <span className="flex items-center justify-center text-xs text-muted-foreground tabular-nums" title={t(LIKELIHOOD_LABELS[l - 1])}>
                  {l}
                </span>
                {[1, 2, 3, 4, 5].map((i) => {
                  const count = cells[l - 1][i - 1];
                  const level = riskLevel(riskScore(l, i));
                  const isSelected = selected?.likelihood === l && selected.impact === i;
                  return (
                    <button
                      key={i}
                      type="button"
                      onClick={() => onSelect(isSelected ? null : { likelihood: l, impact: i })}
                      aria-pressed={isSelected}
                      aria-label={t("Likelihood {l} ({lLabel}), impact {i} ({iLabel}): {level}, {count} risks", {
                        l: String(l),
                        lLabel: t(LIKELIHOOD_LABELS[l - 1]),
                        i: String(i),
                        iLabel: t(IMPACT_LABELS[i - 1]),
                        level: t(LEVEL_STYLE[level].label),
                        count: String(count),
                      })}
                      className={cn(
                        "flex aspect-square cursor-pointer items-center justify-center rounded-lg text-base font-semibold tabular-nums transition-shadow hover:ring-2 hover:ring-ring/40 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
                        LEVEL_STYLE[level].cell,
                        isSelected && "ring-2 ring-foreground",
                        count === 0 && "font-normal text-transparent",
                      )}
                    >
                      {count || "·"}
                    </button>
                  );
                })}
              </div>
            ))}
            <span />
            {[1, 2, 3, 4, 5].map((i) => (
              <span key={i} className="text-center text-xs text-muted-foreground tabular-nums" title={t(IMPACT_LABELS[i - 1])}>
                {i}
              </span>
            ))}
          </div>
          <p className="mt-1 flex items-center justify-center gap-1 text-xs font-medium text-muted-foreground">
            {t("Impact")}
            <ArrowRight className="size-3.5 rtl:-scale-x-100" aria-hidden />
          </p>
        </div>
      </div>
      <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground" aria-label={t("Legend")}>
        {(["low", "medium", "high"] as const).map((level) => (
          <li key={level} className="flex items-center gap-1.5">
            <span aria-hidden className={cn("size-3 rounded-sm", LEVEL_STYLE[level].cell)} />
            {t(LEVEL_STYLE[level].label)}
          </li>
        ))}
      </ul>
    </section>
  );
}

function RiskForm({
  projectId,
  risk,
  members,
  tasks,
  canManage,
  readOnly,
  onDone,
}: Props & { risk?: RiskItem; readOnly: boolean; onDone: () => void }) {
  const t = useT();
  const [form, setForm] = useState({
    title: risk?.title ?? "",
    description: risk?.description ?? "",
    category: risk?.category ?? "other",
    likelihood: String(risk?.likelihood ?? 3),
    impact: String(risk?.impact ?? 3),
    mitigation: risk?.mitigation ?? "",
    status: risk?.status ?? "open",
    ownerId: risk?.ownerId ?? "",
    taskId: risk?.taskId ?? "",
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [pending, startTransition] = useTransition();
  const set = (patch: Partial<typeof form>) => setForm((f) => ({ ...f, ...patch }));

  return (
    <form
      className="grid gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        setErrors({});
        startTransition(async () => {
          const res = await saveRisk(projectId, risk?.id ?? null, form);
          if (!res.ok) {
            setErrors(res.fieldErrors ?? { form: res.error });
            return;
          }
          toast.success(risk ? t("Risk updated") : t("Risk added"));
          onDone();
        });
      }}
    >
      <fieldset disabled={readOnly || pending} className="grid gap-4">
        <div className="grid gap-1.5">
          <Label htmlFor="risk-title">
            {t("What could go wrong?")} <span aria-hidden className="text-destructive">*</span>
          </Label>
          <Input id="risk-title" value={form.title} onChange={(e) => set({ title: e.target.value })} maxLength={200} required placeholder={t("Cement prices rise before we buy")} aria-invalid={Boolean(errors.title)} />
          <FieldError message={errors.title} />
        </div>

        <div className="grid items-start gap-4 sm:grid-cols-[1fr_1fr_auto]">
          <div className="grid gap-1.5">
            <Label htmlFor="risk-likelihood">{t("Likelihood")}</Label>
            <SelectBox id="risk-likelihood" value={form.likelihood} onValueChange={(v) => set({ likelihood: v })} className={nativeSelectClass}>
              {LIKELIHOOD_LABELS.map((label, i) => (
                <option key={label} value={i + 1}>
                  {i + 1} · {t(label)}
                </option>
              ))}
            </SelectBox>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="risk-impact">{t("Impact")}</Label>
            <SelectBox id="risk-impact" value={form.impact} onValueChange={(v) => set({ impact: v })} className={nativeSelectClass}>
              {IMPACT_LABELS.map((label, i) => (
                <option key={label} value={i + 1}>
                  {i + 1} · {t(label)}
                </option>
              ))}
            </SelectBox>
          </div>
          <div className="grid gap-1.5">
            <span className="text-sm font-medium">{t("Score")}</span>
            <output aria-live="polite" className="flex h-9 items-center">
              <RiskLevelBadge likelihood={Number(form.likelihood)} impact={Number(form.impact)} t={t} />
            </output>
          </div>
        </div>

        <div className="grid items-start gap-4 sm:grid-cols-2">
          <div className="grid gap-1.5">
            <Label htmlFor="risk-category">{t("Category")}</Label>
            <SelectBox id="risk-category" value={form.category} onValueChange={(v) => set({ category: v })} className={nativeSelectClass}>
              {RISK_CATEGORIES.map((c) => (
                <option key={c.value} value={c.value}>
                  {t(c.label)}
                </option>
              ))}
            </SelectBox>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="risk-status">{t("Status")}</Label>
            <SelectBox id="risk-status" value={form.status} onValueChange={(v) => set({ status: v })} className={nativeSelectClass}>
              {RISK_STATUSES.map((s) => (
                <option key={s.value} value={s.value}>
                  {t(s.label)}
                </option>
              ))}
            </SelectBox>
          </div>
        </div>

        <div className="grid gap-1.5">
          <Label htmlFor="risk-description">
            {t("Details")} <span className="font-normal text-muted-foreground">{t("(optional)")}</span>
          </Label>
          <Textarea id="risk-description" rows={2} value={form.description} onChange={(e) => set({ description: e.target.value })} maxLength={2000} />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="risk-mitigation">
            {t("Plan to reduce it")} <span className="font-normal text-muted-foreground">{t("(optional)")}</span>
          </Label>
          <Textarea id="risk-mitigation" rows={2} value={form.mitigation} onChange={(e) => set({ mitigation: e.target.value })} maxLength={2000} placeholder={t("Buy 60% of the cement now at today's price")} />
        </div>

        <div className="grid items-start gap-4 sm:grid-cols-2">
          <div className="grid gap-1.5">
            <Label htmlFor="risk-owner">{t("Owner|risk")}</Label>
            {canManage ? (
              <SelectBox id="risk-owner" value={form.ownerId} onValueChange={(v) => set({ ownerId: v })} className={nativeSelectClass} aria-describedby="risk-owner-help" aria-invalid={Boolean(errors.ownerId)}>
                <option value="">{t("No owner")}</option>
                {members.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </SelectBox>
            ) : (
              <p id="risk-owner" className="flex h-9 items-center text-sm">
                {risk?.ownerName ?? <span className="text-muted-foreground">{t("The project manager chooses the owner.")}</span>}
              </p>
            )}
            {canManage && (
              <p id="risk-owner-help" className="text-xs text-muted-foreground">
                {t("Who keeps an eye on it. They're told, and added to the project team.")}
              </p>
            )}
            <FieldError message={errors.ownerId} />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="risk-task">{t("Linked task")}</Label>
            <SelectBox id="risk-task" value={form.taskId} onValueChange={(v) => set({ taskId: v })} className={nativeSelectClass}>
              <option value="">{t("Whole project")}</option>
              {tasks.map((task) => (
                <option key={task.id} value={task.id}>
                  #{task.number} {task.title}
                </option>
              ))}
            </SelectBox>
            <FieldError message={errors.taskId} />
          </div>
        </div>
      </fieldset>

      {readOnly && (
        <p className="rounded-lg border bg-muted/50 px-3 py-2 text-sm">{t("Only the project manager, admins, or the risk's owner can change this risk.")}</p>
      )}
      <FieldError message={errors.form} />

      <DialogFooter className={cn(risk && canManage && "sm:justify-between")}>
        {risk && canManage && (
          <Button
            type="button"
            variant={confirmDelete ? "destructive" : "ghost"}
            disabled={pending}
            onBlur={() => setConfirmDelete(false)}
            onClick={() => {
              if (!confirmDelete) return setConfirmDelete(true);
              startTransition(async () => {
                const res = await deleteRisk(risk.id);
                if (!res.ok) return void toast.error(res.error);
                toast.success(t("Risk deleted"));
                onDone();
              });
            }}
          >
            <Trash2 className="size-4" />
            {confirmDelete ? t("Click again to delete") : t("Delete")}
          </Button>
        )}
        <div className="flex gap-2">
          <Button type="button" variant="ghost" onClick={onDone}>
            {readOnly ? t("Close") : t("Cancel")}
          </Button>
          {!readOnly && (
            <Button type="submit" disabled={pending}>
              {pending && <Loader2 className="size-4 animate-spin" />}
              {risk ? t("Save") : canManage ? t("Add risk") : t("Raise risk")}
            </Button>
          )}
        </div>
      </DialogFooter>
    </form>
  );
}
