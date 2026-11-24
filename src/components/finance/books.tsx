"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Archive, ArchiveRestore, Loader2, Lock, Pencil, Plus, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { archiveLedgerAccount, deleteJournalEntry, saveJournalEntry, saveLedgerAccount, type JournalInput } from "@/lib/actions/finance";
import { ACCOUNT_TYPES } from "@/lib/finance/core";
import { todayISO } from "@/lib/accomplishment";
import { cn, formatDate, formatMoney } from "@/lib/utils";
import { useT } from "@/i18n/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SelectBox } from "@/components/ui/select-box";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { FieldError } from "@/components/projects/project-fields";

type Account = { id: string; code: string; name: string; type: string; system: boolean; money: boolean; archived: boolean; balance: number; description: string | null };

/** The chart of accounts, grouped by type, with balances. */
export function ChartOfAccounts({ slug, accounts, currency }: { slug: string; accounts: Account[]; currency: string }) {
  const t = useT();
  const [editing, setEditing] = useState<Account | "new" | null>(null);
  const [showHidden, setShowHidden] = useState(false);
  const [, start] = useTransition();
  return (
    <section className="grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <label className="flex cursor-pointer items-center gap-2 text-sm text-muted-foreground">
          <input type="checkbox" className="size-4 accent-primary" checked={showHidden} onChange={(e) => setShowHidden(e.target.checked)} />
          {t("Show hidden accounts")}
        </label>
        <Button onClick={() => setEditing("new")}>
          <Plus className="size-4" />
          {t("Add account")}
        </Button>
      </div>
      {ACCOUNT_TYPES.map((type) => {
        const list = accounts.filter((a) => a.type === type.value && (showHidden || !a.archived));
        if (!list.length) return null;
        return (
          <div key={type.value} className="overflow-hidden rounded-2xl border bg-card">
            <h3 className="flex items-center justify-between border-b bg-muted/40 px-5 py-2.5 text-sm font-semibold">
              {t(type.label === "Asset|account" ? "Assets (what we have)" : type.label === "Liability" ? "Liabilities (what we owe)" : type.label === "Equity" ? "Equity (owners)" : type.label === "Income" ? "Income" : "Expenses")}
              <span className="tabular-nums">{formatMoney(list.reduce((s, a) => s + a.balance, 0) / 100, currency, t.intl)}</span>
            </h3>
            <ul className="divide-y">
              {list.map((a) => (
                <li key={a.id} className={cn("flex items-center gap-3 px-5 py-2 text-sm", a.archived && "opacity-60")}>
                  <span className="w-14 shrink-0 text-xs text-muted-foreground tabular-nums" dir="ltr">
                    {a.code}
                  </span>
                  <Link href={`/w/${slug}/finance/accounts/${a.id}`} className="min-w-0 flex-1 truncate hover:text-primary" dir="auto">
                    {t(a.name)}
                    {a.system && <Lock className="ms-1.5 inline size-3 text-muted-foreground" aria-label={t("Used automatically")} />}
                  </Link>
                  <span className="tabular-nums">{a.balance ? formatMoney(a.balance / 100, currency, t.intl) : "—"}</span>
                  {!a.money && (
                    <Button variant="ghost" size="icon" className="size-7" aria-label={t("Edit {name}", { name: t(a.name) })} onClick={() => setEditing(a)}>
                      <Pencil className="size-3.5" />
                    </Button>
                  )}
                  {!a.system && (
                    <Button variant="ghost" size="icon" className="size-7" aria-label={a.archived ? t("Show {name} again", { name: a.name }) : t("Hide {name}", { name: a.name })} onClick={() => start(async () => { const r = await archiveLedgerAccount(slug, a.id, !a.archived); if (!r.ok) toast.error(r.error); })}>
                      {a.archived ? <ArchiveRestore className="size-3.5" /> : <Archive className="size-3.5" />}
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          </div>
        );
      })}
      <AccountDialog slug={slug} account={editing} onClose={() => setEditing(null)} />
    </section>
  );
}

function AccountDialog({ slug, account, onClose }: { slug: string; account: Account | "new" | null; onClose: () => void }) {
  const t = useT();
  const a = account && account !== "new" ? account : null;
  const [f, setF] = useState({ code: "", name: "", type: "expense", description: "" });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [last, setLast] = useState<Account | "new" | null>(null);
  const [pending, start] = useTransition();
  if (account !== last) {
    setLast(account);
    if (account) {
      setErrors({});
      setF(a ? { code: a.code, name: t(a.name), type: a.type, description: a.description ?? "" } : { code: "", name: "", type: "expense", description: "" });
    }
  }
  return (
    <Dialog open={account !== null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <form
          className="grid gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            start(async () => {
              const res = await saveLedgerAccount(slug, a?.id ?? null, { ...f, type: f.type as "asset" | "liability" | "equity" | "income" | "expense" });
              if (!res.ok) return setErrors(res.fieldErrors ?? { form: res.error });
              toast.success(t("Saved"));
              onClose();
            });
          }}
        >
          <DialogHeader>
            <DialogTitle>{a ? t("Edit account") : t("Add account")}</DialogTitle>
            <DialogDescription>{t("For example a separate expense for fuel, or another income source.")}</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="grid gap-1.5">
              <Label htmlFor="la-code">{t("Code")}</Label>
              <Input id="la-code" dir="ltr" value={f.code} onChange={(e) => setF({ ...f, code: e.target.value })} placeholder="6150" aria-invalid={Boolean(errors.code)} />
            </div>
            <div className="grid gap-1.5 sm:col-span-2">
              <Label htmlFor="la-name">{t("Name")}</Label>
              <Input id="la-name" dir="auto" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} maxLength={80} aria-invalid={Boolean(errors.name)} />
            </div>
            <div className="grid gap-1.5 sm:col-span-3">
              <Label htmlFor="la-type">{t("Type")}</Label>
              <SelectBox id="la-type" className="h-9 w-full" value={f.type} onValueChange={(v) => setF({ ...f, type: v })} disabled={a?.system}>
                {ACCOUNT_TYPES.map((x) => (
                  <option key={x.value} value={x.value}>
                    {t(x.label)}
                  </option>
                ))}
              </SelectBox>
            </div>
          </div>
          <FieldError message={errors.code ?? errors.name ?? errors.type ?? errors.form} />
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

type Entry = {
  id: string;
  number: number;
  date: string;
  memo: string;
  source: string;
  href: string | null;
  locked: boolean;
  lines: { id: string; accountId: string; account: string; code: string; debit: number; credit: number; contact: string | null; project: string | null; description: string | null }[];
};

const SOURCE_LABEL: Record<string, string> = {
  manual: "Manual",
  opening: "Opening balance",
  invoice: "Invoice",
  bill: "Bill",
  payment: "Payment",
  transfer: "Transfer",
  expense: "Project expense",
  loan: "Loan",
  repayment: "Loan repayment",
  payroll: "Payroll",
  payroll_paid: "Salaries paid",
};

/** Every entry, newest first; manual ones can be edited or deleted. */
export function Journal({ slug, entries, accounts, projects, currency }: { slug: string; entries: Entry[]; accounts: { id: string; code: string; name: string }[]; projects: { id: string; name: string }[]; currency: string }) {
  const t = useT();
  const [source, setSource] = useState("");
  const [editing, setEditing] = useState<Entry | "new" | null>(null);
  const [, start] = useTransition();
  const shown = entries.filter((e) => !source || e.source === source);
  const m = (c: number) => (c ? formatMoney(c / 100, currency, t.intl) : "");
  return (
    <section className="grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <SelectBox className="h-9" value={source} onValueChange={setSource} aria-label={t("Kind")}>
          <option value="">{t("Every kind of entry")}</option>
          {Object.entries(SOURCE_LABEL).map(([k, v]) => (
            <option key={k} value={k}>
              {t(v)}
            </option>
          ))}
        </SelectBox>
        <Button onClick={() => setEditing("new")}>
          <Plus className="size-4" />
          {t("Manual entry")}
        </Button>
      </div>
      {shown.length === 0 ? (
        <p className="rounded-2xl border bg-card px-5 py-10 text-center text-sm text-muted-foreground">{t("No entries yet.")}</p>
      ) : (
        <ul className="grid gap-3">
          {shown.map((e) => (
            <li key={e.id} className="overflow-hidden rounded-2xl border bg-card">
              <div className="flex flex-wrap items-center gap-2 border-b bg-muted/30 px-4 py-2 text-sm">
                <span className="text-xs text-muted-foreground tabular-nums">#{e.number}</span>
                <span className="text-muted-foreground">{formatDate(e.date, t.intl)}</span>
                <span className="rounded-full bg-muted px-2 py-0.5 text-xs">{t(SOURCE_LABEL[e.source] ?? e.source)}</span>
                {e.href ? (
                  <Link href={e.href} className="min-w-0 flex-1 truncate font-medium hover:text-primary" dir="auto">
                    {e.memo}
                  </Link>
                ) : (
                  <span className="min-w-0 flex-1 truncate font-medium" dir="auto">
                    {e.memo}
                  </span>
                )}
                {e.source === "manual" && !e.locked && (
                  <>
                    <Button variant="ghost" size="icon" className="size-7" aria-label={t("Edit")} onClick={() => setEditing(e)}>
                      <Pencil className="size-3.5" />
                    </Button>
                    <Button variant="ghost" size="icon" className="size-7 text-muted-foreground hover:text-destructive" aria-label={t("Delete")} onClick={() => confirm(t("Delete this entry?")) && start(async () => { const r = await deleteJournalEntry(slug, e.id); if (!r.ok) toast.error(r.error); })}>
                      <Trash2 className="size-3.5" />
                    </Button>
                  </>
                )}
                {e.locked && <Lock className="size-3.5 text-muted-foreground" aria-label={t("In a closed period")} />}
              </div>
              <table className="w-full text-sm">
                <tbody>
                  {e.lines.map((l) => (
                    <tr key={l.id} className="border-b last:border-0">
                      <td className={cn("px-4 py-1.5", l.credit && "ps-10")}>
                        <span className="me-2 text-xs text-muted-foreground tabular-nums" dir="ltr">
                          {l.code}
                        </span>
                        <span dir="auto">{t(l.account)}</span>
                        {(l.contact || l.project || l.description) && <span className="ms-2 text-xs text-muted-foreground" dir="auto">{[l.contact, l.project, l.description && t(l.description)].filter(Boolean).join(" · ")}</span>}
                      </td>
                      <td className="w-32 px-3 py-1.5 text-end tabular-nums">{m(l.debit)}</td>
                      <td className="w-32 px-4 py-1.5 text-end tabular-nums">{m(l.credit)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </li>
          ))}
        </ul>
      )}
      <p className="text-xs text-muted-foreground">{t("Left column: debit. Right column: credit. Entries made by Tamm change by themselves when their record changes.")}</p>
      <EntryDialog slug={slug} entry={editing} accounts={accounts} projects={projects} onClose={() => setEditing(null)} />
    </section>
  );
}

function EntryDialog({ slug, entry, accounts, projects, onClose }: { slug: string; entry: Entry | "new" | null; accounts: { id: string; code: string; name: string }[]; projects: { id: string; name: string }[]; onClose: () => void }) {
  const t = useT();
  const e = entry && entry !== "new" ? entry : null;
  const blankLine = { accountId: "", debit: "", credit: "", projectId: "", description: "" };
  const [f, setF] = useState<JournalInput>({ date: todayISO(), memo: "", lines: [blankLine, blankLine] });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [last, setLast] = useState<Entry | "new" | null>(null);
  const [pending, start] = useTransition();
  if (entry !== last) {
    setLast(entry);
    if (entry) {
      setErrors({});
      setF(
        e
          ? { date: e.date, memo: e.memo, lines: e.lines.map((l) => ({ accountId: l.accountId, debit: l.debit ? (l.debit / 100).toFixed(2) : "", credit: l.credit ? (l.credit / 100).toFixed(2) : "", projectId: "", description: l.description ?? "" })) }
          : { date: todayISO(), memo: "", lines: [blankLine, blankLine] },
      );
    }
  }
  const sum = (k: "debit" | "credit") => f.lines.reduce((s, l) => s + Math.round(Number(String(l[k] ?? "").replace(/,/g, "") || 0) * 100), 0);
  const dr = sum("debit");
  const cr = sum("credit");
  const setLine = (i: number, patch: Partial<(typeof f.lines)[number]>) => setF({ ...f, lines: f.lines.map((l, j) => (j === i ? { ...l, ...patch } : l)) });
  return (
    <Dialog open={entry !== null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-3xl">
        <form
          className="grid gap-4"
          onSubmit={(ev) => {
            ev.preventDefault();
            start(async () => {
              const res = await saveJournalEntry(slug, e?.id ?? null, f);
              if (!res.ok) return setErrors(res.fieldErrors ?? { form: res.error });
              toast.success(t("Entry saved"));
              onClose();
            });
          }}
        >
          <DialogHeader>
            <DialogTitle>{e ? t("Edit entry") : t("Manual entry")}</DialogTitle>
            <DialogDescription>{t("For accountants: corrections, depreciation, owner's money in or out. Debits must equal credits.")}</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 sm:grid-cols-[10rem_1fr]">
            <div className="grid gap-1.5">
              <Label htmlFor="je-date">{t("Date")}</Label>
              <Input id="je-date" type="date" value={f.date} onChange={(ev) => setF({ ...f, date: ev.target.value })} />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="je-memo">{t("What it's for")}</Label>
              <Input id="je-memo" dir="auto" value={f.memo} onChange={(ev) => setF({ ...f, memo: ev.target.value })} maxLength={200} aria-invalid={Boolean(errors.memo)} />
            </div>
          </div>
          <div className="relative overflow-x-auto rounded-xl border">
            <table className="w-full min-w-[40rem] text-sm">
              <thead className="bg-muted/50 text-xs text-muted-foreground">
                <tr>
                  <th className="px-2 py-2 text-start font-medium">{t("Account")}</th>
                  <th className="w-32 px-2 py-2 text-end font-medium">{t("Debit")}</th>
                  <th className="w-32 px-2 py-2 text-end font-medium">{t("Credit")}</th>
                  <th className="px-2 py-2 text-start font-medium">{t("Project")}</th>
                  <th className="w-10" />
                </tr>
              </thead>
              <tbody>
                {f.lines.map((l, i) => (
                  <tr key={i} className="border-t">
                    <td className="p-1.5">
                      <SelectBox className="h-9 w-full" value={l.accountId} onValueChange={(v) => setLine(i, { accountId: v })} placeholder={t("Choose an account")} aria-label={t("Account of line {n}", { n: i + 1 })}>
                        {accounts.map((a) => (
                          <option key={a.id} value={a.id}>
                            {a.code} · {t(a.name)}
                          </option>
                        ))}
                      </SelectBox>
                    </td>
                    <td className="p-1.5">
                      <Input dir="ltr" inputMode="decimal" className="text-end" aria-label={t("Debit")} value={l.debit ?? ""} onChange={(ev) => setLine(i, { debit: ev.target.value, credit: ev.target.value ? "" : l.credit })} />
                    </td>
                    <td className="p-1.5">
                      <Input dir="ltr" inputMode="decimal" className="text-end" aria-label={t("Credit")} value={l.credit ?? ""} onChange={(ev) => setLine(i, { credit: ev.target.value, debit: ev.target.value ? "" : l.debit })} />
                    </td>
                    <td className="p-1.5">
                      <SelectBox className="h-9 w-full" value={l.projectId ?? ""} onValueChange={(v) => setLine(i, { projectId: v })} aria-label={t("Project")}>
                        <option value="">—</option>
                        {projects.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name}
                          </option>
                        ))}
                      </SelectBox>
                    </td>
                    <td className="p-1.5">
                      <Button type="button" variant="ghost" size="icon" className="size-8" aria-label={t("Remove")} disabled={f.lines.length <= 2} onClick={() => setF({ ...f, lines: f.lines.filter((_, j) => j !== i) })}>
                        <X className="size-4" />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className={cn("border-t font-semibold", dr !== cr && "text-destructive")}>
                  <td className="px-2 py-2 text-end">{dr === cr ? t("Balanced") : t("Difference: {amount}", { amount: (Math.abs(dr - cr) / 100).toFixed(2) })}</td>
                  <td className="px-2 py-2 text-end tabular-nums">{(dr / 100).toFixed(2)}</td>
                  <td className="px-2 py-2 text-end tabular-nums">{(cr / 100).toFixed(2)}</td>
                  <td colSpan={2} />
                </tr>
              </tfoot>
            </table>
          </div>
          <Button type="button" variant="outline" size="sm" className="justify-self-start" onClick={() => setF({ ...f, lines: [...f.lines, blankLine] })}>
            <Plus className="size-4" />
            {t("Add a line")}
          </Button>
          <FieldError message={errors.form ?? errors.memo ?? errors.lines} />
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose}>
              {t("Cancel")}
            </Button>
            <Button type="submit" disabled={pending || dr !== cr || dr === 0}>
              {pending && <Loader2 className="size-4 animate-spin" />}
              {t("Save")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
