import Link from "next/link";
import { notFound } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { AlertTriangle, ArrowDownLeft, ArrowUpRight, BookOpen, Clock, Coins, Contact, FileInput, FileOutput, Hash, Mail, MapPin, Phone, Printer, Scale, type LucideIcon } from "lucide-react";
import { db } from "@/lib/db";
import { contacts } from "@/lib/db/schema";
import { financePage } from "@/lib/finance/page";
import { contactStatement } from "@/lib/finance/statement";
import { cn, formatDate, formatMoney } from "@/lib/utils";
import { getT } from "@/i18n/server";
import { BAND_PILL, PageHeader, PageShell, Panel, StatTile } from "@/components/page/kit";
import { StateBadge } from "@/components/finance/ui";
import { EditContactButton } from "@/components/finance/contacts";
import { billRows, invoiceRows } from "@/lib/data/finance";
import { FinanceTabs } from "@/components/finance/finance-tabs";
import { Button } from "@/components/ui/button";

export default async function ContactPage({ params }: PageProps<"/w/[slug]/finance/contacts/[id]">) {
  const { slug, id } = await params;
  const { workspace, settings, today, base } = await financePage(slug);
  const t = await getT();
  const [c] = await db.select().from(contacts).where(and(eq(contacts.id, id), eq(contacts.workspaceId, workspace.id)));
  if (!c) notFound();
  const s = await contactStatement(workspace.id, id, today);
  const label = { invoice: t("Invoice"), bill: t("Bill"), payment_in: t("Payment received"), payment_out: t("Payment made") };
  const href = (l: (typeof s.lines)[number]) => (l.kind === "invoice" ? `${base}/invoices/${l.id}` : l.kind === "bill" ? `${base}/bills/${l.id}` : `/print/${workspace.slug}/finance/payments/${l.id}`);
  const [invs, bls] = await Promise.all([c.kind !== "supplier" ? invoiceRows(workspace.id, today, { contactId: id }) : [], c.kind !== "customer" ? billRows(workspace.id, today, { contactId: id }) : []]);
  const live = (st: string) => st !== "draft" && st !== "cancelled";
  const openDocs = [
    ...invs.filter((r) => live(r.state) && r.open > 0).map((r) => ({ id: r.inv.id, code: r.code, href: `${base}/invoices/${r.inv.id}`, due: r.inv.dueDate, open: r.open, currency: r.inv.currency, state: r.state })),
    ...bls.filter((r) => live(r.state) && r.open > 0).map((r) => ({ id: r.bill.id, code: r.code, href: `${base}/bills/${r.bill.id}`, due: r.bill.dueDate, open: r.open, currency: r.bill.currency, state: r.state })),
  ].sort((x, y) => x.due.localeCompare(y.due));
  // Headline numbers in the contact's main currency (the one with most movement).
  const cur = s.balances[0]?.currency ?? c.currency ?? "";
  const inCur = s.lines.filter((l) => l.currency === cur);
  const billed = inCur.filter((l) => l.kind === "invoice" || l.kind === "bill").reduce((x, l) => x + l.amount, 0);
  const paid = inCur.filter((l) => l.kind === "payment_in" || l.kind === "payment_out").reduce((x, l) => x + l.amount, 0);
  const balance = s.balances.find((b) => b.currency === cur)?.balance ?? 0;
  const overdue = openDocs.filter((d) => d.state === "overdue" && d.currency === cur);
  const m = (v: number) => formatMoney(v / 100, cur || settings.baseCurrency, t.intl);
  const supplier = c.kind === "supplier";
  const initials = c.name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();
  const details: { icon: LucideIcon; label: string; value: string | null; dir?: "ltr" }[] = [
    { icon: Phone, label: t("Phone"), value: c.phone, dir: "ltr" },
    { icon: Mail, label: t("Email"), value: c.email },
    { icon: MapPin, label: t("Address"), value: c.address },
    { icon: Hash, label: t("Tax number"), value: c.taxNumber, dir: "ltr" },
    { icon: Coins, label: t("Currency"), value: c.currency },
  ];

  return (
    <PageShell>
      <PageHeader
        back={{ href: `${base}/contacts`, label: t("Customers & suppliers") }}
        mark={
          <span aria-hidden className="grid size-14 shrink-0 place-items-center rounded-2xl bg-white/15 text-lg font-bold text-white shadow-lg shadow-black/10 ring-1 ring-white/25 backdrop-blur-sm">
            {initials}
          </span>
        }
        title={<span dir="auto">{c.name}</span>}
        description={
          <span className="flex flex-wrap items-center gap-2">
            <span className={cn("rounded-full px-2.5 py-0.5 text-xs font-semibold", BAND_PILL)}>
              {c.kind === "customer" ? t("Customer") : supplier ? t("Supplier") : t("Customer and supplier")}
            </span>
            {c.archivedAt && <span className="rounded-full bg-white/15 px-2.5 py-0.5 text-xs ring-1 ring-white/25">{t("Hidden")}</span>}
          </span>
        }
        actions={
          <>
            {c.kind !== "supplier" && (
              <Button asChild>
                <Link href={`${base}/invoices/new?contact=${c.id}`}>
                  <FileOutput className="size-4" />
                  {t("New invoice")}
                </Link>
              </Button>
            )}
            {c.kind !== "customer" && (
              <Button variant={c.kind === "supplier" ? "default" : "outline"} asChild>
                <Link href={`${base}/bills/new?contact=${c.id}`}>
                  <FileInput className="size-4" />
                  {t("New bill")}
                </Link>
              </Button>
            )}
            <Button variant="outline" asChild>
              <a href={`/print/${workspace.slug}/finance/statement/${c.id}`} target="_blank" rel="noopener">
                <Printer className="size-4" />
                {t("Print statement")}
              </a>
            </Button>
          </>
        }
      >
        <FinanceTabs slug={workspace.slug} />
      </PageHeader>
      <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile icon={supplier ? FileInput : FileOutput} label={supplier ? t("Billed to us") : t("Invoiced")} value={m(billed)} hint={t("All time")} />
        <StatTile icon={supplier ? ArrowUpRight : ArrowDownLeft} tone="good" label={supplier ? t("Paid to them") : t("Received")} value={m(paid)} share={billed ? Math.min(1, paid / billed) : 0} shareLabel={t("Share paid")} />
        <StatTile icon={Scale} label={balance >= 0 ? (supplier ? t("We owe them") : t("They owe us")) : t("In their favour")} value={m(Math.abs(balance))} />
        <StatTile icon={AlertTriangle} tone={overdue.length ? "bad" : "default"} label={t("Overdue")} value={m(overdue.reduce((x, d) => x + d.open, 0))} hint={t.plural(overdue.length, "{count} document", "{count} documents")} />
      </dl>
      {s.balances.length > 1 && (
        <p className="-mt-2 text-sm text-muted-foreground">
          {t("Also in other currencies:")}{" "}
          {s.balances
            .filter((b) => b.currency !== cur)
            .map((b) => formatMoney(b.balance / 100, b.currency, t.intl))
            .join(" · ")}
        </p>
      )}
      <div className="grid grid-cols-1 items-start gap-6 xl:grid-cols-[minmax(0,1fr)_22rem]">
      <Panel id="ct-statement" title={t("Statement")} icon={BookOpen} count={s.lines.length}>
        {s.lines.length === 0 ? (
          <p className="px-5 pb-5 text-sm text-muted-foreground">{t("Nothing yet.")}</p>
        ) : (
          <div className="relative overflow-x-auto border-t">
            <table className="w-full min-w-[36rem] text-sm">
              <thead className="text-xs text-muted-foreground">
                <tr className="border-b">
                  <th className="px-5 py-2 text-start font-medium">{t("Date")}</th>
                  <th className="px-3 py-2 text-start font-medium">{t("What")}</th>
                  <th className="px-3 py-2 text-end font-medium">{t("Amount")}</th>
                  <th className="px-5 py-2 text-end font-medium">{t("Balance|account")}</th>
                </tr>
              </thead>
              <tbody>
                {[...s.lines].reverse().map((l) => (
                  <tr key={`${l.kind}-${l.id}`} className="border-b last:border-0">
                    <td className="px-5 py-2 whitespace-nowrap text-muted-foreground">{formatDate(l.date, t.intl)}</td>
                    <td className="px-3 py-2">
                      <Link href={href(l)} className="hover:text-primary">
                        {label[l.kind]} <span dir="ltr">{l.code}</span>
                      </Link>
                    </td>
                    <td className={cn("px-3 py-2 text-end tabular-nums", l.sign < 0 && "text-green-700 dark:text-green-400")}>
                      {l.sign < 0 ? "−" : "+"}
                      {formatMoney(l.amount / 100, l.currency, t.intl)}
                    </td>
                    <td className="px-5 py-2 text-end font-medium tabular-nums">{formatMoney(l.balance / 100, l.currency, t.intl)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
        <aside className="grid gap-6">
          <Panel id="ct-open" title={supplier ? t("Bills to pay") : t("Open invoices")} icon={Clock} count={openDocs.length}>
            {openDocs.length === 0 ? (
              <p className="px-5 pb-5 text-sm text-muted-foreground">{t("Nothing open. All settled.")}</p>
            ) : (
              <ul className="divide-y border-t">
                {openDocs.map((d) => (
                  <li key={d.id}>
                    <Link href={d.href} className="flex items-center gap-3 px-5 py-3 text-sm transition-colors hover:bg-muted/40">
                      <span className="min-w-0 flex-1">
                        <span className="block font-medium" dir="ltr">
                          {d.code}
                        </span>
                        <span className="block text-xs text-muted-foreground">{t("due {date}", { date: formatDate(d.due, t.intl) })}</span>
                      </span>
                      <span className="grid justify-items-end gap-1">
                        <span className="font-semibold tabular-nums">{formatMoney(d.open / 100, d.currency, t.intl)}</span>
                        <StateBadge state={d.state} />
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
          <Panel
            id="ct-details"
            title={t("Details")}
            icon={Contact}
            action={
              <EditContactButton
                slug={workspace.slug}
                baseCurrency={settings.baseCurrency}
                contact={{ id: c.id, kind: c.kind as "customer" | "supplier" | "both", name: c.name, email: c.email ?? "", phone: c.phone ?? "", address: c.address ?? "", taxNumber: c.taxNumber ?? "", currency: c.currency ?? settings.baseCurrency, notes: c.notes ?? "" }}
              />
            }
          >
            <dl className="grid gap-3.5 px-5 pb-5 text-sm">
              {details.map((d) => (
                <div key={d.label} className="flex items-start gap-3">
                  <d.icon className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
                  <div className="min-w-0">
                    <dt className="text-xs text-muted-foreground">{d.label}</dt>
                    <dd className={cn("mt-0.5 font-medium break-words", !d.value && "font-normal text-muted-foreground/70")} dir={d.value ? (d.dir ?? "auto") : undefined}>
                      {d.value || "—"}
                    </dd>
                  </div>
                </div>
              ))}
              {c.notes && (
                <div className="border-t pt-3">
                  <dt className="text-xs text-muted-foreground">{t("Notes")}</dt>
                  <dd className="mt-0.5 whitespace-pre-wrap" dir="auto">
                    {c.notes}
                  </dd>
                </div>
              )}
            </dl>
          </Panel>
        </aside>
      </div>
    </PageShell>
  );
}
