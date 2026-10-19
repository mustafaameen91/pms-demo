"use client";

import { useState, useTransition } from "react";
import { Loader2, MoreHorizontal, Plus } from "lucide-react";
import { toast } from "sonner";
import { recordPayment, savePlatformSettings, setSubscriptionStatus } from "@/lib/actions/admin";
import { accessFor } from "@/lib/access";
import { todayISO } from "@/lib/accomplishment";
import type { AdminWorkspace } from "@/lib/data/admin";
import { CURRENCIES } from "@/lib/constants";
import { cn, formatDate, formatMoney } from "@/lib/utils";
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { FieldError } from "@/components/projects/project-fields";
import { nativeSelectClass } from "@/components/resources/resource-fields";
import { useT } from "@/i18n/client";
import type { T } from "@/i18n/translate";

type Settings = {
  price: string | null;
  currency: string;
  billingPeriod: string;
  paymentInstructions: string | null;
  contact: string | null;
};
type Payment = {
  id: string;
  workspaceName: string;
  amount: string;
  currency: string;
  method: string;
  reference: string | null;
  coversUntil: string;
  createdAt: Date;
  recordedBy: string | null;
};

/** Stored as-is on the payment; only the visible label is translated. */
const METHODS = ["Cash", "Bank transfer", "ZainCash", "FIB", "Qi Card", "Other"];

function addMonths(iso: string, months: number) {
  const [y, m, d] = iso.split("-").map(Number);
  // Clamp to the last day of the target month (Jan 31 + 1 month = Feb 28/29).
  const last = new Date(Date.UTC(y, m - 1 + months + 1, 0)).getUTCDate();
  return new Date(Date.UTC(y, m - 1 + months, Math.min(d, last))).toISOString().slice(0, 10);
}

function statusOf(w: AdminWorkspace, t: T) {
  const a = accessFor(w.status ? { status: w.status, paidUntil: w.paidUntil } : null);
  if (!a.allowed) {
    return a.kind === "pending"
      ? { kind: a.kind, label: t("Awaiting payment"), tone: "bad" }
      : a.kind === "expired"
        ? { kind: a.kind, label: t("Expired {date}", { date: formatDate(a.paidUntil, t.intl) }), tone: "bad" }
        : { kind: a.kind, label: t("Cancelled"), tone: "muted" };
  }
  if (a.kind === "complimentary") return { kind: a.kind, label: t("Complimentary"), tone: "good" };
  const date = formatDate(a.paidUntil, t.intl);
  return {
    kind: a.kind,
    label: a.kind === "trial" ? t("Trial until {date}", { date }) : t("Paid until {date}", { date }),
    tone: a.endingSoon ? "warn" : "good",
  };
}

export function AdminPanel({
  workspaces,
  payments,
  settings,
}: {
  workspaces: AdminWorkspace[];
  payments: Payment[];
  settings: Settings;
}) {
  const t = useT();
  const [paying, setPaying] = useState<AdminWorkspace | null>(null);
  const [pending, startTransition] = useTransition();
  const statuses = workspaces.map((w) => statusOf(w, t));
  const counts = {
    active: statuses.filter((s) => s.tone === "good" || s.tone === "warn").length,
    waiting: statuses.filter((s) => s.kind === "pending").length,
    expired: statuses.filter((s) => s.kind === "expired").length,
    soon: statuses.filter((s) => s.tone === "warn").length,
  };

  const setStatus = (w: AdminWorkspace, action: "complimentary" | "cancel" | "pending", message: string) =>
    startTransition(async () => {
      const result = await setSubscriptionStatus({ workspaceId: w.id, action });
      if (result.ok) toast.success(message);
      else toast.error(result.error);
    });

  return (
    <div className="grid w-full grid-cols-1 gap-6 px-4 py-6 sm:px-6 lg:py-8">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">{t("Customers")}</h1>
        <p className="text-sm text-muted-foreground">
          {t("Record payments you receive to activate or extend a workspace. Plan: Pro (unlimited).")}
        </p>
      </div>

      <dl className="grid gap-4 sm:grid-cols-4">
        {[
          { label: t("Workspaces"), value: workspaces.length },
          { label: t("Active"), value: counts.active },
          { label: t("Awaiting payment"), value: counts.waiting, bad: counts.waiting > 0 },
          { label: t("Expired / ending in 7 days"), value: `${counts.expired} / ${counts.soon}`, bad: counts.expired > 0 },
        ].map((k) => (
          <div key={k.label} className="rounded-xl border bg-card p-4">
            <dt className="text-sm text-muted-foreground">{k.label}</dt>
            <dd className={cn("mt-1 text-2xl font-semibold", k.bad && "text-destructive")}>{k.value}</dd>
          </div>
        ))}
      </dl>

      <section aria-labelledby="ws-heading" className="overflow-hidden rounded-xl border bg-card">
        <h2 id="ws-heading" className="border-b px-4 py-3 font-semibold">
          {t("Workspaces")}
        </h2>
        <div className="relative overflow-x-auto">
          <table className="w-full min-w-[900px] text-sm">
            <thead className="text-start text-xs text-muted-foreground">
              <tr className="border-b bg-muted/40">
                <th scope="col" className="py-2 pe-3 ps-4 font-medium">{t("Workspace")}</th>
                <th scope="col" className="px-3 py-2 font-medium">{t("Owner")}</th>
                <th scope="col" className="px-3 py-2 text-end font-medium">{t("Members")}</th>
                <th scope="col" className="px-3 py-2 text-end font-medium">{t("Projects")}</th>
                <th scope="col" className="px-3 py-2 font-medium">{t("Subscription")}</th>
                <th scope="col" className="px-3 py-2 font-medium">{t("Last payment")}</th>
                <th scope="col" className="py-2 pe-4 ps-3"><span className="sr-only">{t("Actions")}</span></th>
              </tr>
            </thead>
            <tbody>
              {workspaces.map((w, i) => {
                const s = statuses[i];
                return (
                  <tr key={w.id} className="border-b last:border-b-0">
                    <td className="py-2.5 pe-3 ps-4">
                      <p className="font-medium">{w.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {t("since {date}", { date: formatDate(new Date(w.createdAt).toISOString().slice(0, 10), t.intl) })}
                      </p>
                    </td>
                    <td className="max-w-56 truncate px-3 py-2.5 text-muted-foreground">{w.owners ?? "—"}</td>
                    <td className="px-3 py-2.5 text-end tabular-nums">{w.members}</td>
                    <td className="px-3 py-2.5 text-end tabular-nums">{w.projectCount}</td>
                    <td className="px-3 py-2.5">
                      <span
                        className={cn(
                          "inline-flex rounded-full border px-2 py-0.5 text-xs font-medium whitespace-nowrap",
                          s.tone === "good" && "border-primary/30 bg-primary/10 text-primary",
                          s.tone === "warn" && "border-amber-500/40 bg-amber-500/10 text-amber-800 dark:text-amber-300",
                          s.tone === "bad" && "border-destructive/30 bg-destructive/10 text-destructive",
                          s.tone === "muted" && "text-muted-foreground",
                        )}
                      >
                        {s.label}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 whitespace-nowrap text-muted-foreground tabular-nums">
                      {w.lastPayment ? formatDate(w.lastPayment, t.intl) : "—"}
                    </td>
                    <td className="py-2 pe-4 ps-3">
                      <div className="flex justify-end gap-1">
                        <Button size="sm" onClick={() => setPaying(w)} aria-label={t("Record payment for {name}", { name: w.name })}>
                          <Plus className="size-4" />
                          {t("Record payment")}
                        </Button>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="size-8" disabled={pending} aria-label={t("More actions for {name}", { name: w.name })}>
                              <MoreHorizontal className="size-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onSelect={() => setStatus(w, "complimentary", t("{name}: free access, no expiry", { name: w.name }))}>
                              {t("Give free access (no expiry)")}
                            </DropdownMenuItem>
                            <DropdownMenuItem onSelect={() => setStatus(w, "pending", t("{name}: awaiting payment", { name: w.name }))}>
                              {t("Set to awaiting payment")}
                            </DropdownMenuItem>
                            <DropdownMenuItem variant="destructive" onSelect={() => setStatus(w, "cancel", t("{name}: cancelled (locked)", { name: w.name }))}>
                              {t("Cancel and lock")}
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <section aria-labelledby="payments-heading" className="overflow-hidden rounded-xl border bg-card">
        <h2 id="payments-heading" className="border-b px-4 py-3 font-semibold">
          {t("Recent payments")}
        </h2>
        {payments.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-muted-foreground">{t("No payments recorded yet.")}</p>
        ) : (
          <div className="relative overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead className="text-start text-xs text-muted-foreground">
                <tr className="border-b bg-muted/40">
                  <th scope="col" className="py-2 pe-3 ps-4 font-medium">{t("Date")}</th>
                  <th scope="col" className="px-3 py-2 font-medium">{t("Workspace")}</th>
                  <th scope="col" className="px-3 py-2 font-medium">{t("Method")}</th>
                  <th scope="col" className="px-3 py-2 font-medium">{t("Covers until")}</th>
                  <th scope="col" className="px-3 py-2 font-medium">{t("Recorded by")}</th>
                  <th scope="col" className="py-2 pe-4 ps-3 text-end font-medium">{t("Amount")}</th>
                </tr>
              </thead>
              <tbody>
                {payments.map((p) => (
                  <tr key={p.id} className="border-b last:border-b-0">
                    <td className="py-2.5 pe-3 ps-4 tabular-nums">{formatDate(new Date(p.createdAt).toISOString().slice(0, 10), t.intl)}</td>
                    <td className="px-3 py-2.5">{p.workspaceName}</td>
                    <td className="px-3 py-2.5">
                      {t(p.method)}
                      {p.reference && <span className="text-muted-foreground"> · {p.reference}</span>}
                    </td>
                    <td className="px-3 py-2.5 tabular-nums">{formatDate(p.coversUntil, t.intl)}</td>
                    <td className="px-3 py-2.5 text-muted-foreground">{p.recordedBy ?? "—"}</td>
                    <td className="py-2.5 pe-4 ps-3 text-end font-medium tabular-nums">{formatMoney(p.amount, p.currency, t.intl)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <SettingsForm settings={settings} />

      <PaymentDialog workspace={paying} settings={settings} onClose={() => setPaying(null)} />
    </div>
  );
}

function PaymentDialog({
  workspace,
  settings,
  onClose,
}: {
  workspace: AdminWorkspace | null;
  settings: Settings;
  onClose: () => void;
}) {
  const t = useT();
  return (
    <Dialog open={Boolean(workspace)} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("Record payment")}</DialogTitle>
          <DialogDescription>{workspace?.name} — {t("money you received outside the app.")}</DialogDescription>
        </DialogHeader>
        {workspace && <PaymentForm key={workspace.id} workspace={workspace} settings={settings} onDone={onClose} />}
      </DialogContent>
    </Dialog>
  );
}

function PaymentForm({
  workspace,
  settings,
  onDone,
}: {
  workspace: AdminWorkspace;
  settings: Settings;
  onDone: () => void;
}) {
  const t = useT();
  const today = todayISO();
  // Extend from the current end date if it's still in the future, otherwise from today.
  const base = workspace.paidUntil && workspace.paidUntil >= today ? workspace.paidUntil : today;
  const [coversUntil, setCoversUntil] = useState(addMonths(base, settings.billingPeriod === "year" ? 12 : 1));
  const [amount, setAmount] = useState(settings.price ? String(Number(settings.price)) : "");
  const [currency, setCurrency] = useState(settings.currency);
  const [method, setMethod] = useState(METHODS[0]);
  const [reference, setReference] = useState("");
  const [note, setNote] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [pending, startTransition] = useTransition();

  return (
    <form
      className="grid gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        startTransition(async () => {
          const result = await recordPayment({
            workspaceId: workspace.id,
            amount,
            currency: currency as (typeof CURRENCIES)[number],
            method,
            reference,
            note,
            coversUntil,
          });
          if (!result.ok) {
            setErrors(result.fieldErrors ?? {});
            if (!result.fieldErrors) toast.error(result.error);
            return;
          }
          toast.success(t("{name} is active until {date}", { name: workspace.name, date: formatDate(coversUntil, t.intl) }));
          onDone();
        });
      }}
    >
      <div className="grid items-start gap-4 sm:grid-cols-[2fr_1fr]">
        <div className="grid gap-1.5">
          <Label htmlFor="pay-amount">{t("Amount received")}</Label>
          <Input id="pay-amount" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} required className="tabular-nums" aria-invalid={Boolean(errors.amount)} />
          <FieldError message={errors.amount} />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="pay-currency">{t("Currency")}</Label>
          <select id="pay-currency" value={currency} onChange={(e) => setCurrency(e.target.value)} className={nativeSelectClass}>
            {CURRENCIES.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </div>
      </div>
      <div className="grid items-start gap-4 sm:grid-cols-2">
        <div className="grid gap-1.5">
          <Label htmlFor="pay-method">{t("Method")}</Label>
          <select id="pay-method" value={method} onChange={(e) => setMethod(e.target.value)} className={nativeSelectClass}>
            {METHODS.map((m) => (
              <option key={m} value={m}>
                {t(m)}
              </option>
            ))}
          </select>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="pay-ref">
            {t("Reference")} <span className="font-normal text-muted-foreground">{t("(optional)")}</span>
          </Label>
          <Input id="pay-ref" value={reference} onChange={(e) => setReference(e.target.value)} placeholder={t("Transfer no., receipt no.")} maxLength={120} />
        </div>
      </div>
      <fieldset className="grid gap-2">
        <legend className="mb-1 text-sm font-medium">{t("Active until")}</legend>
        <div className="flex flex-wrap gap-2">
          {[1, 3, 6, 12].map((m) => {
            const value = addMonths(base, m);
            return (
              <Button key={m} type="button" size="sm" variant={coversUntil === value ? "default" : "outline"} onClick={() => setCoversUntil(value)}>
                {t.plural(m, "+{count} month", "+{count} months")}
              </Button>
            );
          })}
        </div>
        <label htmlFor="pay-until" className="sr-only">
          {t("Active until date")}
        </label>
        <Input id="pay-until" type="date" value={coversUntil} min={today} onChange={(e) => setCoversUntil(e.target.value)} className="w-full sm:w-56" aria-invalid={Boolean(errors.coversUntil)} />
        <FieldError message={errors.coversUntil} />
        <p className="text-xs text-muted-foreground">
          {workspace.paidUntil && workspace.paidUntil >= today
            ? t("Currently paid until {date}; extending from then.", { date: formatDate(workspace.paidUntil, t.intl) })
            : t("Starts today.")}
        </p>
      </fieldset>
      <div className="grid gap-1.5">
        <Label htmlFor="pay-note">
          {t("Note")} <span className="font-normal text-muted-foreground">{t("(optional)")}</span>
        </Label>
        <Textarea id="pay-note" value={note} onChange={(e) => setNote(e.target.value)} rows={2} maxLength={500} />
      </div>
      <DialogFooter>
        <Button type="button" variant="ghost" onClick={onDone}>
          {t("Cancel")}
        </Button>
        <Button type="submit" disabled={pending}>
          {pending && <Loader2 className="size-4 animate-spin" />}
          {t("Record & activate")}
        </Button>
      </DialogFooter>
    </form>
  );
}

function SettingsForm({ settings }: { settings: Settings }) {
  const t = useT();
  const [price, setPrice] = useState(settings.price ? String(Number(settings.price)) : "");
  const [currency, setCurrency] = useState(settings.currency);
  const [period, setPeriod] = useState(settings.billingPeriod);
  const [instructions, setInstructions] = useState(settings.paymentInstructions ?? "");
  const [contact, setContact] = useState(settings.contact ?? "");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [pending, startTransition] = useTransition();

  return (
    <section aria-labelledby="settings-heading" className="rounded-xl border bg-card p-5 sm:p-6">
      <h2 id="settings-heading" className="font-semibold">
        {t("Price & payment instructions")}
      </h2>
      <p className="mt-1 text-sm text-muted-foreground">{t("Shown to customers on their Billing page.")}</p>
      <form
        className="mt-4 grid gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          startTransition(async () => {
            const result = await savePlatformSettings({
              price,
              currency: currency as (typeof CURRENCIES)[number],
              billingPeriod: period as "month" | "year",
              paymentInstructions: instructions,
              contact,
            });
            if (!result.ok) {
              setErrors(result.fieldErrors ?? {});
              return;
            }
            setErrors({});
            toast.success(t("Settings saved"));
          });
        }}
      >
        <div className="grid items-start gap-4 sm:grid-cols-3">
          <div className="grid gap-1.5">
            <Label htmlFor="set-price">{t("Pro price")}</Label>
            <Input id="set-price" inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} placeholder="25" className="tabular-nums" aria-invalid={Boolean(errors.price)} />
            <FieldError message={errors.price} />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="set-currency">{t("Currency")}</Label>
            <select id="set-currency" value={currency} onChange={(e) => setCurrency(e.target.value)} className={nativeSelectClass}>
              {CURRENCIES.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="set-period">{t("Per")}</Label>
            <select id="set-period" value={period} onChange={(e) => setPeriod(e.target.value)} className={nativeSelectClass}>
              <option value="month">{t("Month")}</option>
              <option value="year">{t("Year")}</option>
            </select>
          </div>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="set-instructions">{t("How customers pay you")}</Label>
          <Textarea
            id="set-instructions"
            value={instructions}
            onChange={(e) => setInstructions(e.target.value)}
            rows={4}
            maxLength={3000}
            placeholder={t(
              "e.g.\nZainCash: 0780 000 0000 (Name)\nBank transfer: Bank name, account no.\nPlease include your workspace name in the transfer note.",
            )}
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="set-contact">{t("Contact for billing questions")}</Label>
          <Input id="set-contact" value={contact} onChange={(e) => setContact(e.target.value)} placeholder={t("WhatsApp +964 …, email")} maxLength={500} />
        </div>
        <div className="flex justify-end">
          <Button type="submit" disabled={pending}>
            {pending && <Loader2 className="size-4 animate-spin" />}
            {t("Save")}
          </Button>
        </div>
      </form>
    </section>
  );
}
