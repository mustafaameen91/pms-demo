"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import {
  ArrowLeftRight,
  Car,
  CreditCard,
  HardHat,
  History,
  Laptop,
  Loader2,
  MoreHorizontal,
  Package,
  Pencil,
  Plus,
  Printer,
  Search,
  Smartphone,
  Sofa,
  Trash2,
  Undo2,
  Wrench,
  Box,
  CircleCheck,
  UserRound,
} from "lucide-react";
import { toast } from "sonner";
import { assignAsset, deleteAsset, returnAsset, saveAsset, setAssetStatus, type AssetInput } from "@/lib/actions/hr-ops";
import { ASSET_CATEGORIES, ASSET_CONDITIONS, ASSET_STATUSES, assetCode } from "@/lib/hr-rules";
import { labelOf } from "@/lib/hr";
import { CURRENCIES } from "@/lib/constants";
import { cn, formatDate, formatMoney } from "@/lib/utils";
import { useT } from "@/i18n/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { SelectBox } from "@/components/ui/select-box";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { FieldError } from "@/components/projects/project-fields";
import { EmptyState, StatTile } from "@/components/page/kit";
import { PersonAvatar } from "./hr-ui";

export const CATEGORY_ICON: Record<string, typeof Laptop> = {
  laptop: Laptop,
  phone: Smartphone,
  vehicle: Car,
  tool: Wrench,
  equipment: Box,
  safety: HardHat,
  card: CreditCard,
  furniture: Sofa,
  other: Package,
};
export const ASSET_STATUS_STYLE: Record<string, string> = {
  available: "bg-green-600/10 text-green-700 dark:text-green-400",
  assigned: "bg-primary/10 text-primary",
  repair: "bg-amber-500/15 text-amber-800 dark:text-amber-300",
  retired: "bg-muted text-muted-foreground",
  lost: "bg-destructive/10 text-destructive",
};

type Person = { id: string; name: string; code: string; hasPhoto: boolean };
type Asset = {
  id: string;
  number: number;
  name: string;
  category: string;
  serial: string | null;
  value: string | null;
  currency: string;
  purchaseDate: string | null;
  condition: string;
  status: string;
  notes: string | null;
  holder: { assignmentId: string; employeeId: string; name: string; hasPhoto: boolean; since: string } | null;
  history: { id: string; name: string; assignedOn: string; returnedOn: string | null; conditionOut: string; conditionIn: string | null }[];
};

export function AssetsView({ slug, today, currency, people, assets }: { slug: string; today: string; currency: string; people: Person[]; assets: Asset[] }) {
  const t = useT();
  const [q, setQ] = useState("");
  const [cat, setCat] = useState("");
  const [status, setStatus] = useState("");
  const [editing, setEditing] = useState<Asset | "new" | null>(null);
  const [handing, setHanding] = useState<Asset | null>(null);
  const [taking, setTaking] = useState<Asset | null>(null);
  const [history, setHistory] = useState<Asset | null>(null);
  const shown = useMemo(() => {
    const n = q.trim().toLowerCase();
    return assets.filter(
      (a) =>
        (!cat || a.category === cat) &&
        (!status || a.status === status) &&
        (!n || [a.name, a.serial, assetCode(a.number), a.holder?.name].some((v) => v?.toLowerCase().includes(n))),
    );
  }, [assets, q, cat, status]);
  const values = new Map<string, number>();
  for (const a of assets) if (a.value && a.status !== "retired" && a.status !== "lost") values.set(a.currency, (values.get(a.currency) ?? 0) + Number(a.value));
  const valueText = [...values].map(([c, v]) => formatMoney(v, c, t.intl));

  return (
    <div className="grid grid-cols-1 gap-6">
      {assets.length === 0 ? (
        <EmptyState icon={Package} title={t("No assets yet")} action={<Button onClick={() => setEditing("new")}><Plus className="size-4" />{t("Add asset")}</Button>}>
          {t("Add the laptops, phones, cars and tools you hand to people. Each hand-over prints a receipt they sign.")}
        </EmptyState>
      ) : (
        <>
          <dl className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatTile icon={Package} label={t("Assets")} value={assets.filter((a) => a.status !== "retired").length} hint={t("Not counting retired ones")} />
            <StatTile icon={UserRound} label={t("With someone")} value={assets.filter((a) => a.status === "assigned").length} share={assets.length ? assets.filter((a) => a.status === "assigned").length / assets.length : 0} shareLabel={t("Share handed out")} />
            <StatTile icon={CircleCheck} tone="good" label={t("Available")} value={assets.filter((a) => a.status === "available").length} hint={t("Ready to hand over")} />
            <StatTile icon={Wrench} tone={assets.some((a) => a.status === "lost") ? "bad" : "default"} label={t("Value")} value={valueText[0] ?? "—"} hint={valueText.slice(1).join(" · ") || t("Repair: {repair} · Lost: {lost}", { repair: assets.filter((a) => a.status === "repair").length, lost: assets.filter((a) => a.status === "lost").length })} />
          </dl>
          <section aria-label={t("Assets")} className="overflow-hidden rounded-2xl border bg-card">
            <div className="flex flex-wrap items-center gap-2 border-b px-4 py-3">
              <div className="relative min-w-48 flex-1">
                <Search className="pointer-events-none absolute top-1/2 size-4 -translate-y-1/2 text-muted-foreground inset-s-3" aria-hidden />
                <Input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("Search name, number, serial, person…")} aria-label={t("Search assets")} className="h-9 ps-9" />
              </div>
              <SelectBox className="h-9" value={cat} onValueChange={setCat} aria-label={t("Category")}>
                <option value="">{t("All categories")}</option>
                {ASSET_CATEGORIES.map((c) => (
                  <option key={c.value} value={c.value}>
                    {t(c.label)}
                  </option>
                ))}
              </SelectBox>
              <SelectBox className="h-9" value={status} onValueChange={setStatus} aria-label={t("Status")}>
                <option value="">{t("Any status")}</option>
                {ASSET_STATUSES.map((s) => (
                  <option key={s.value} value={s.value}>
                    {t(s.label)}
                  </option>
                ))}
              </SelectBox>
              <Button onClick={() => setEditing("new")}>
                <Plus className="size-4" />
                {t("Add asset")}
              </Button>
            </div>
            {shown.length === 0 ? (
              <p className="px-4 py-10 text-center text-sm text-muted-foreground">{t("No assets match.")}</p>
            ) : (
              <ul className="divide-y">
                {shown.map((a) => {
                  const Icon = CATEGORY_ICON[a.category] ?? Package;
                  return (
                    <li key={a.id} className="flex flex-wrap items-center gap-4 px-4 py-3">
                      <span aria-hidden className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
                        <Icon className="size-5" />
                      </span>
                      <div className="min-w-48 flex-1">
                        <p className="truncate font-medium" dir="auto">
                          {a.name}
                        </p>
                        <p className="truncate text-xs text-muted-foreground">
                          <span dir="ltr">{assetCode(a.number)}</span>
                          {a.serial && (
                            <>
                              {" · "}
                              <span dir="ltr">{a.serial}</span>
                            </>
                          )}
                          {" · "}
                          {t(labelOf(ASSET_CATEGORIES, a.category))}
                          {a.value && ` · ${formatMoney(a.value, a.currency, t.intl)}`}
                        </p>
                      </div>
                      <div className="min-w-44">
                        {a.holder ? (
                          <Link href={`/w/${slug}/hr/${a.holder.employeeId}`} className="flex items-center gap-2 text-sm hover:text-primary">
                            <PersonAvatar id={a.holder.employeeId} name={a.holder.name} hasPhoto={a.holder.hasPhoto} size="sm" className="size-7 text-[10px]" />
                            <span className="min-w-0">
                              <span className="block truncate" dir="auto">
                                {a.holder.name}
                              </span>
                              <span className="block text-xs text-muted-foreground">{t("since {date}", { date: formatDate(a.holder.since, t.intl) })}</span>
                            </span>
                          </Link>
                        ) : (
                          <span className={cn("rounded-full px-2 py-0.5 text-xs font-medium", ASSET_STATUS_STYLE[a.status])}>{t(labelOf(ASSET_STATUSES, a.status))}</span>
                        )}
                      </div>
                      <div className="ms-auto flex items-center gap-1">
                        {a.status === "available" && (
                          <Button size="sm" variant="outline" onClick={() => setHanding(a)}>
                            <ArrowLeftRight className="size-4" />
                            {t("Hand over")}
                          </Button>
                        )}
                        {a.holder && (
                          <>
                            <Button size="sm" variant="outline" onClick={() => setTaking(a)}>
                              <Undo2 className="size-4" />
                              {t("Take back")}
                            </Button>
                            <Button size="icon" variant="ghost" className="size-8" asChild>
                              <a href={`/print/${slug}/hr/handover/${a.holder.assignmentId}`} target="_blank" rel="noopener" aria-label={t("Print handover receipt")} title={t("Print handover receipt")}>
                                <Printer className="size-4" />
                              </a>
                            </Button>
                          </>
                        )}
                        <AssetMenu asset={a} onEdit={() => setEditing(a)} onHistory={() => setHistory(a)} />
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </>
      )}
      <AssetDialog slug={slug} asset={editing} currency={currency} onClose={() => setEditing(null)} today={today} />
      <HandOverDialog slug={slug} asset={handing} people={people} today={today} onClose={() => setHanding(null)} />
      <TakeBackDialog asset={taking} today={today} onClose={() => setTaking(null)} />
      <HistoryDialog slug={slug} asset={history} onClose={() => setHistory(null)} />
    </div>
  );
}

function AssetMenu({ asset: a, onEdit, onHistory }: { asset: Asset; onEdit: () => void; onHistory: () => void }) {
  const t = useT();
  const [, start] = useTransition();
  const status = (s: "available" | "repair" | "retired" | "lost") => start(async () => {
    const res = await setAssetStatus(a.id, s);
    if (!res.ok) toast.error(res.error);
  });
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button size="icon" variant="ghost" className="size-8" aria-label={t("More actions for {name}", { name: a.name })}>
          <MoreHorizontal className="size-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onSelect={onEdit}>
          <Pencil className="size-4" />
          {t("Edit")}
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={onHistory}>
          <History className="size-4" />
          {t("History")}
        </DropdownMenuItem>
        {a.status !== "assigned" && (
          <>
            <DropdownMenuSeparator />
            {a.status !== "available" && <DropdownMenuItem onSelect={() => status("available")}>{t("Mark available")}</DropdownMenuItem>}
            {a.status !== "repair" && <DropdownMenuItem onSelect={() => status("repair")}>{t("Send for repair")}</DropdownMenuItem>}
            {a.status !== "lost" && <DropdownMenuItem onSelect={() => status("lost")}>{t("Mark lost")}</DropdownMenuItem>}
            {a.status !== "retired" && <DropdownMenuItem onSelect={() => status("retired")}>{t("Retire")}</DropdownMenuItem>}
            <DropdownMenuSeparator />
            <DropdownMenuItem
              variant="destructive"
              onSelect={() =>
                confirm(t("Delete {name} and its history? Retire it instead to keep the history.", { name: a.name })) &&
                start(async () => {
                  const res = await deleteAsset(a.id);
                  if (!res.ok) toast.error(res.error);
                })
              }
            >
              <Trash2 className="size-4" />
              {t("Delete")}
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function AssetDialog({ slug, asset, currency, today, onClose }: { slug: string; asset: Asset | "new" | null; currency: string; today: string; onClose: () => void }) {
  const t = useT();
  const a = asset && asset !== "new" ? asset : null;
  const blank = (): AssetInput => ({ name: "", category: "laptop", serial: "", value: "", currency, purchaseDate: today, condition: "new", notes: "" });
  const [f, setF] = useState<AssetInput>(blank);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [last, setLast] = useState<Asset | "new" | null>(null);
  const [pending, start] = useTransition();
  if (asset !== last) {
    setLast(asset);
    if (asset) {
      setErrors({});
      setF(a ? { name: a.name, category: a.category, serial: a.serial, value: a.value, currency: a.currency, purchaseDate: a.purchaseDate, condition: a.condition, notes: a.notes } : blank());
    }
  }
  const currencies = [...new Set([f.currency, ...CURRENCIES])];
  return (
    <Dialog open={asset !== null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
        <form
          className="grid gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            start(async () => {
              const res = await saveAsset(slug, a?.id ?? null, f);
              if (!res.ok) return setErrors(res.fieldErrors ?? { form: res.error });
              toast.success(a ? t("Saved") : t("Asset added"));
              onClose();
            });
          }}
        >
          <DialogHeader>
            <DialogTitle>{a ? t("Edit asset") : t("Add asset")}</DialogTitle>
            <DialogDescription>{a ? assetCode(a.number) : t("Numbered automatically (AST-001…).")}</DialogDescription>
          </DialogHeader>
          <div className="grid gap-1.5">
            <Label htmlFor="as-name">{t("Name")}</Label>
            <Input id="as-name" dir="auto" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder={t("Dell Latitude 5440")} maxLength={120} aria-invalid={Boolean(errors.name)} />
            <FieldError message={errors.name} />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-1.5">
              <Label htmlFor="as-cat">{t("Category")}</Label>
              <SelectBox id="as-cat" className="h-9 w-full" value={f.category} onValueChange={(v) => setF({ ...f, category: v })}>
                {ASSET_CATEGORIES.map((c) => (
                  <option key={c.value} value={c.value}>
                    {t(c.label)}
                  </option>
                ))}
              </SelectBox>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="as-serial">{t("Tag / serial number")}</Label>
              <Input id="as-serial" dir="ltr" value={f.serial ?? ""} onChange={(e) => setF({ ...f, serial: e.target.value })} maxLength={120} />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="as-value">{t("Value")}</Label>
              <div className="flex gap-2">
                <Input id="as-value" dir="ltr" inputMode="decimal" value={f.value ?? ""} onChange={(e) => setF({ ...f, value: e.target.value })} aria-invalid={Boolean(errors.value)} />
                <SelectBox className="h-9" value={f.currency} onValueChange={(v) => setF({ ...f, currency: v })} aria-label={t("Currency")}>
                  {currencies.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </SelectBox>
              </div>
              <FieldError message={errors.value} />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="as-date">{t("Purchase date")}</Label>
              <Input id="as-date" type="date" value={f.purchaseDate ?? ""} onChange={(e) => setF({ ...f, purchaseDate: e.target.value })} />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="as-cond">{t("Condition")}</Label>
              <SelectBox id="as-cond" className="h-9 w-full" value={f.condition} onValueChange={(v) => setF({ ...f, condition: v })}>
                {ASSET_CONDITIONS.map((c) => (
                  <option key={c.value} value={c.value}>
                    {t(c.label)}
                  </option>
                ))}
              </SelectBox>
            </div>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="as-notes">
              {t("Notes")} <span className="font-normal text-muted-foreground">{t("(optional)")}</span>
            </Label>
            <Textarea id="as-notes" dir="auto" rows={2} value={f.notes ?? ""} onChange={(e) => setF({ ...f, notes: e.target.value })} maxLength={1000} />
          </div>
          <FieldError message={errors.form} />
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose}>
              {t("Cancel")}
            </Button>
            <Button type="submit" disabled={pending}>
              {pending && <Loader2 className="size-4 animate-spin" />}
              {t("Save")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** Hand an asset to someone, then offer the receipt to print. */
export function HandOverDialog({ slug, asset, people, today, onClose, employeeId }: { slug: string; asset: Asset | { id: string; name: string; condition: string } | null; people: Person[]; today: string; onClose: () => void; employeeId?: string }) {
  const t = useT();
  const [f, setF] = useState({ employeeId: employeeId ?? "", date: today, condition: "good", note: "" });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [done, setDone] = useState<string | null>(null);
  const [last, setLast] = useState<string | null>(null);
  const [pending, start] = useTransition();
  if ((asset?.id ?? null) !== last) {
    setLast(asset?.id ?? null);
    if (asset) {
      setF({ employeeId: employeeId ?? "", date: today, condition: asset.condition === "broken" ? "poor" : asset.condition, note: "" });
      setErrors({});
      setDone(null);
    }
  }
  return (
    <Dialog open={asset !== null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        {done ? (
          <div className="grid grid-cols-1 gap-4">
            <DialogHeader>
              <DialogTitle>{t("Handed over")}</DialogTitle>
              <DialogDescription>{t("Print the receipt and have them sign it.")}</DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="ghost" onClick={onClose}>
                {t("Close")}
              </Button>
              <Button asChild>
                <a href={`/print/${slug}/hr/handover/${done}`} target="_blank" rel="noopener" onClick={onClose}>
                  <Printer className="size-4" />
                  {t("Print receipt")}
                </a>
              </Button>
            </DialogFooter>
          </div>
        ) : (
          <form
            className="grid gap-4"
            onSubmit={(e) => {
              e.preventDefault();
              if (!asset) return;
              start(async () => {
                const res = await assignAsset(asset.id, f);
                if (!res.ok) return setErrors(res.fieldErrors ?? { form: res.error });
                setDone(res.data!.assignmentId);
              });
            }}
          >
            <DialogHeader>
              <DialogTitle>{t("Hand over {name}", { name: asset?.name ?? "" })}</DialogTitle>
            </DialogHeader>
            {!employeeId && (
              <div className="grid gap-1.5">
                <Label htmlFor="ho-person">{t("To")}</Label>
                <SelectBox id="ho-person" className="h-9 w-full" value={f.employeeId} onValueChange={(v) => setF({ ...f, employeeId: v })} placeholder={t("Choose a person")} aria-invalid={Boolean(errors.employeeId)}>
                  {people.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} · {p.code}
                    </option>
                  ))}
                </SelectBox>
                <FieldError message={errors.employeeId} />
              </div>
            )}
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-1.5">
                <Label htmlFor="ho-date">{t("Date")}</Label>
                <Input id="ho-date" type="date" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="ho-cond">{t("Condition")}</Label>
                <SelectBox id="ho-cond" className="h-9 w-full" value={f.condition} onValueChange={(v) => setF({ ...f, condition: v })}>
                  {ASSET_CONDITIONS.map((c) => (
                    <option key={c.value} value={c.value}>
                      {t(c.label)}
                    </option>
                  ))}
                </SelectBox>
              </div>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="ho-note">
                {t("Note")} <span className="font-normal text-muted-foreground">{t("(optional)")}</span>
              </Label>
              <Input id="ho-note" dir="auto" value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} placeholder={t("With charger and bag")} maxLength={500} />
            </div>
            <FieldError message={errors.form} />
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={onClose}>
                {t("Cancel")}
              </Button>
              <Button type="submit" disabled={pending}>
                {pending && <Loader2 className="size-4 animate-spin" />}
                {t("Hand over")}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

export function TakeBackDialog({ asset, today, onClose }: { asset: { name: string; condition: string; holder: { assignmentId: string; name: string } | null } | null; today: string; onClose: () => void }) {
  const t = useT();
  const [f, setF] = useState({ date: today, condition: "good", note: "", then: "available" as "available" | "repair" | "lost" | "retired" });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [last, setLast] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const key = asset?.holder?.assignmentId ?? null;
  if (key !== last) {
    setLast(key);
    if (asset) {
      setF({ date: today, condition: asset.condition, note: "", then: "available" });
      setErrors({});
    }
  }
  return (
    <Dialog open={asset !== null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <form
          className="grid gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (!asset?.holder) return;
            start(async () => {
              const res = await returnAsset(asset.holder!.assignmentId, f);
              if (!res.ok) return setErrors(res.fieldErrors ?? { form: res.error });
              toast.success(t("Taken back"));
              onClose();
            });
          }}
        >
          <DialogHeader>
            <DialogTitle>{t("Take back {name}", { name: asset?.name ?? "" })}</DialogTitle>
            <DialogDescription>{asset?.holder && t("From {name}", { name: asset.holder.name })}</DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-4">
            <div className="grid gap-1.5">
              <Label htmlFor="tb-date">{t("Date")}</Label>
              <Input id="tb-date" type="date" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} aria-invalid={Boolean(errors.date)} />
              <FieldError message={errors.date} />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="tb-cond">{t("Condition now")}</Label>
              <SelectBox id="tb-cond" className="h-9 w-full" value={f.condition} onValueChange={(v) => setF({ ...f, condition: v })}>
                {ASSET_CONDITIONS.map((c) => (
                  <option key={c.value} value={c.value}>
                    {t(c.label)}
                  </option>
                ))}
              </SelectBox>
            </div>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="tb-then">{t("Then")}</Label>
            <SelectBox id="tb-then" className="h-9 w-full" value={f.then} onValueChange={(v) => setF({ ...f, then: v as typeof f.then })}>
              <option value="available">{t("Available for someone else")}</option>
              <option value="repair">{t("Send for repair")}</option>
              <option value="lost">{t("It was lost")}</option>
              <option value="retired">{t("Retire it")}</option>
            </SelectBox>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="tb-note">
              {t("Note")} <span className="font-normal text-muted-foreground">{t("(optional)")}</span>
            </Label>
            <Input id="tb-note" dir="auto" value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} placeholder={t("Screen scratched")} maxLength={500} />
          </div>
          <FieldError message={errors.form} />
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose}>
              {t("Cancel")}
            </Button>
            <Button type="submit" disabled={pending}>
              {pending && <Loader2 className="size-4 animate-spin" />}
              {t("Take back")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function HistoryDialog({ slug, asset, onClose }: { slug: string; asset: Asset | null; onClose: () => void }) {
  const t = useT();
  return (
    <Dialog open={asset !== null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("History of {name}", { name: asset?.name ?? "" })}</DialogTitle>
          <DialogDescription>{asset && assetCode(asset.number)}</DialogDescription>
        </DialogHeader>
        {asset && asset.history.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("Never handed to anyone yet.")}</p>
        ) : (
          <ol className="grid gap-3">
            {asset?.history.map((h) => (
              <li key={h.id} className="flex items-start gap-3 text-sm">
                <span aria-hidden className={cn("mt-1.5 size-2 rounded-full", h.returnedOn ? "bg-muted-foreground/40" : "bg-primary")} />
                <div className="min-w-0 flex-1">
                  <p className="font-medium" dir="auto">
                    {h.name}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {formatDate(h.assignedOn, t.intl)} → {h.returnedOn ? formatDate(h.returnedOn, t.intl) : t("now")} · {t(labelOf(ASSET_CONDITIONS, h.conditionOut))}
                    {h.conditionIn && ` → ${t(labelOf(ASSET_CONDITIONS, h.conditionIn))}`}
                  </p>
                </div>
                <a href={`/print/${slug}/hr/handover/${h.id}`} target="_blank" rel="noopener" className="text-primary" aria-label={t("Print receipt")}>
                  <Printer className="size-4" />
                </a>
              </li>
            ))}
          </ol>
        )}
      </DialogContent>
    </Dialog>
  );
}
