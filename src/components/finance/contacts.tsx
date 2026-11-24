"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { Archive, ArchiveRestore, ChevronRight, Mail, Pencil, Phone, Plus, Search, Users } from "lucide-react";
import { archiveContact, type ContactInput } from "@/lib/actions/finance";
import { cn, formatMoney } from "@/lib/utils";
import { useT } from "@/i18n/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { EmptyState } from "@/components/page/kit";
import { ContactDialog } from "./ui";

const initials = (name: string) =>
  name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();

type Row = ContactInput & { id: string; archived: boolean; owes: { currency: string; amount: number }[]; overdue: number };

export function ContactsView({ slug, rows, baseCurrency }: { slug: string; rows: Row[]; baseCurrency: string }) {
  const t = useT();
  const [q, setQ] = useState("");
  const [kind, setKind] = useState<"all" | "customer" | "supplier" | "archived">("all");
  const [editing, setEditing] = useState<Row | "new" | null>(null);
  const [, start] = useTransition();
  const shown = useMemo(() => {
    const n = q.trim().toLowerCase();
    return rows.filter(
      (r) =>
        (kind === "archived" ? r.archived : !r.archived && (kind === "all" || r.kind === kind || r.kind === "both")) &&
        (!n || [r.name, r.phone, r.email, r.taxNumber].some((v) => v?.toLowerCase().includes(n))),
    );
  }, [rows, q, kind]);
  return (
    <section className="overflow-hidden rounded-2xl border bg-card">
      <div className="flex flex-wrap items-center gap-2 border-b px-4 py-3">
        <div className="relative min-w-48 flex-1">
          <Search className="pointer-events-none absolute top-1/2 size-4 -translate-y-1/2 text-muted-foreground inset-s-3" aria-hidden />
          <Input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("Search name, phone, email…")} aria-label={t("Search")} className="h-9 ps-9" />
        </div>
        <div role="radiogroup" aria-label={t("Show")} className="inline-flex flex-wrap rounded-lg border p-0.5 text-sm">
          {(
            [
              ["all", t("All")],
              ["customer", t("Customers")],
              ["supplier", t("Suppliers")],
              ["archived", t("Hidden")],
            ] as const
          ).map(([v, label]) => (
            <button key={v} type="button" role="radio" aria-checked={kind === v} onClick={() => setKind(v)} className="cursor-pointer rounded-md px-2.5 py-1 text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring aria-checked:bg-primary/10 aria-checked:font-medium aria-checked:text-primary">
              {label}
            </button>
          ))}
        </div>
        <Button onClick={() => setEditing("new")}>
          <Plus className="size-4" />
          {t("Add")}
        </Button>
      </div>
      {shown.length === 0 ? (
        rows.length === 0 ? (
          <EmptyState icon={Users} title={t("No customers or suppliers yet")} className="m-4 border-0">
            {t("Add the people and companies you bill and buy from.")}
          </EmptyState>
        ) : (
          <p className="px-4 py-10 text-center text-sm text-muted-foreground">{t("Nothing matches.")}</p>
        )
      ) : (
        <ul className="divide-y">
          {shown.map((r) => {
            const owed = r.owes.filter((o) => o.amount !== 0);
            return (
              <li key={r.id} className="group relative flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3.5 transition-colors hover:bg-muted/40 sm:flex-nowrap">
                <span aria-hidden className={cn("grid size-10 shrink-0 place-items-center rounded-xl text-sm font-semibold", r.kind === "supplier" ? "bg-cyan-600/10 text-cyan-700 dark:text-cyan-300" : "bg-primary/10 text-primary")}>
                  {initials(r.name)}
                </span>
                <div className="min-w-0 flex-1 basis-48">
                  <Link href={`/w/${slug}/finance/contacts/${r.id}`} className="font-semibold after:absolute after:inset-0 hover:text-primary focus-visible:outline-none" dir="auto">
                    {r.name}
                  </Link>
                  <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
                    <span className={cn("rounded-full px-1.5 py-px font-medium", r.kind === "supplier" ? "bg-cyan-600/10 text-cyan-800 dark:text-cyan-300" : r.kind === "both" ? "bg-muted text-foreground" : "bg-primary/10 text-primary")}>
                      {r.kind === "customer" ? t("Customer") : r.kind === "supplier" ? t("Supplier") : t("Customer and supplier")}
                    </span>
                    {r.phone && (
                      <span className="inline-flex items-center gap-1">
                        <Phone className="size-3" aria-hidden />
                        <span dir="ltr">{r.phone}</span>
                      </span>
                    )}
                    {r.email && (
                      <span className="inline-flex min-w-0 items-center gap-1">
                        <Mail className="size-3 shrink-0" aria-hidden />
                        <span className="truncate">{r.email}</span>
                      </span>
                    )}
                  </p>
                </div>
                <div className="min-w-32 text-end text-sm">
                  {owed.length === 0 ? (
                    <p className="text-xs text-muted-foreground">{t("Settled")}</p>
                  ) : (
                    owed.map((o) => (
                      <p key={o.currency} className="grid">
                        <span className="text-xs text-muted-foreground">{o.amount > 0 ? (r.kind === "supplier" ? t("We owe them") : t("They owe us")) : t("In credit")}</span>
                        <span className={cn("font-semibold tabular-nums", r.overdue > 0 && o.amount > 0 && "text-destructive")}>{formatMoney(Math.abs(o.amount) / 100, o.currency, t.intl)}</span>
                      </p>
                    ))
                  )}
                  {r.overdue > 0 && <p className="text-xs font-medium text-destructive">{t.plural(r.overdue, "{count} overdue", "{count} overdue")}</p>}
                </div>
                <div className="relative z-10 flex">
                  <Button variant="ghost" size="icon" className="size-9" aria-label={t("Edit {name}", { name: r.name })} onClick={() => setEditing(r)}>
                    <Pencil className="size-4" />
                  </Button>
                  <Button variant="ghost" size="icon" className="size-9" aria-label={r.archived ? t("Show {name} again", { name: r.name }) : t("Hide {name}", { name: r.name })} onClick={() => start(async () => void (await archiveContact(slug, r.id, !r.archived)))}>
                    {r.archived ? <ArchiveRestore className="size-4" /> : <Archive className="size-4" />}
                  </Button>
                </div>
                <ChevronRight className="hidden size-4 shrink-0 text-muted-foreground/60 sm:block rtl:rotate-180" aria-hidden />
              </li>
            );
          })}
        </ul>
      )}
      <ContactDialog slug={slug} open={editing !== null} onOpenChange={(o) => !o && setEditing(null)} contact={editing && editing !== "new" ? editing : null} baseCurrency={baseCurrency} kind={kind === "supplier" ? "supplier" : "customer"} />
    </section>
  );
}

/** "Edit" on a contact's own page. */
export function EditContactButton({ slug, contact, baseCurrency }: { slug: string; contact: ContactInput & { id: string }; baseCurrency: string }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="ghost" size="icon" className="size-8" aria-label={t("Edit {name}", { name: contact.name })} onClick={() => setOpen(true)}>
        <Pencil className="size-4" />
      </Button>
      <ContactDialog slug={slug} open={open} onOpenChange={setOpen} contact={contact} baseCurrency={baseCurrency} />
    </>
  );
}
