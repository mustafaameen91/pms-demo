"use client";

import Link from "next/link";
import { AlertTriangle, Building, Cake, CircleCheck, Clock, FileWarning, PartyPopper, UserRoundPen } from "lucide-react";
import { EMPLOYEE_DOC_TYPES, labelOf, type AttentionKind } from "@/lib/hr";
import { cn, formatDate } from "@/lib/utils";
import { useT } from "@/i18n/client";
import { Panel } from "@/components/page/kit";
import { PersonAvatar } from "./hr-ui";

type Person = { id: string; name: string; jobTitle: string | null; hasPhoto: boolean };

const KIND_ICON: Record<AttentionKind, typeof Clock> = {
  doc_expired: FileWarning,
  doc_expiring: FileWarning,
  probation_ending: Clock,
  contract_ending: Clock,
  contract_ended: AlertTriangle,
  incomplete: UserRoundPen,
};

/** Expired / expiring papers, probation and contracts ending, files missing details. */
export function AttentionPanel({
  slug,
  items,
  more,
}: {
  slug: string;
  today: string;
  items: { kind: AttentionKind; days: number | null; date: string | null; docType?: string; person: Person }[];
  more: number;
}) {
  const t = useT();
  const text = (i: (typeof items)[number]) => {
    const doc = i.docType ? t(labelOf(EMPLOYEE_DOC_TYPES, i.docType)) : "";
    const d = i.days ?? 0;
    switch (i.kind) {
      case "doc_expired":
        return t.plural(-d, "{doc} expired {count} day ago", "{doc} expired {count} days ago", { doc });
      case "doc_expiring":
        return d === 0 ? t("{doc} expires today", { doc }) : t.plural(d, "{doc} expires in {count} day", "{doc} expires in {count} days", { doc });
      case "probation_ending":
        return d === 0 ? t("Probation ends today") : t.plural(d, "Probation ends in {count} day", "Probation ends in {count} days");
      case "contract_ending":
        return d === 0 ? t("Contract ends today") : t.plural(d, "Contract ends in {count} day", "Contract ends in {count} days");
      case "contract_ended":
        return t("Contract ended {date}: renew it or record the last day", { date: formatDate(i.date, t.intl) });
      case "incomplete":
        return t("File is missing important details");
    }
  };
  const urgent = (k: AttentionKind) => k === "doc_expired" || k === "contract_ended";
  return (
    <Panel id="hr-attention" title={t("Needs attention")} icon={AlertTriangle} count={items.length + more} tone={items.some((i) => urgent(i.kind)) ? "danger" : undefined}>
      {items.length === 0 ? (
        <p className="flex items-center gap-2 px-5 pb-5 text-sm text-muted-foreground">
          <CircleCheck className="size-4 text-green-600" aria-hidden />
          {t("All papers valid and files complete.")}
        </p>
      ) : (
        <ul className="grid pb-2">
          {items.map((i, n) => {
            const Icon = KIND_ICON[i.kind];
            return (
              <li key={n}>
                <Link
                  href={`/w/${slug}/hr/${i.person.id}${i.docType ? "?tab=documents" : ""}`}
                  className="flex items-center gap-3 px-5 py-2.5 transition-colors hover:bg-muted/60 focus-visible:outline-2 focus-visible:outline-ring"
                >
                  <PersonAvatar id={i.person.id} name={i.person.name} hasPhoto={i.person.hasPhoto} size="sm" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium" dir="auto">
                      {i.person.name}
                    </span>
                    <span className={cn("flex items-center gap-1 text-xs", urgent(i.kind) ? "text-destructive" : i.kind === "incomplete" ? "text-muted-foreground" : "text-amber-700 dark:text-amber-400")}>
                      <Icon className="size-3.5 shrink-0" aria-hidden />
                      <span className="truncate">{text(i)}</span>
                    </span>
                  </span>
                </Link>
              </li>
            );
          })}
          {more > 0 && <li className="px-5 py-2 text-xs text-muted-foreground">{t("and {count} more", { count: more })}</li>}
        </ul>
      )}
    </Panel>
  );
}

/** Birthdays and work anniversaries in the next 30 days. */
export function CelebrationsPanel({ slug, items }: { slug: string; items: { kind: "birthday" | "anniversary"; days: number; years: number; person: Person }[] }) {
  const t = useT();
  if (items.length === 0) return null;
  return (
    <Panel id="hr-celebrations" title={t("Coming up|celebrations")} icon={PartyPopper}>
      <ul className="grid pb-2">
        {items.map((c, n) => (
          <li key={n}>
            <Link href={`/w/${slug}/hr/${c.person.id}`} className="flex items-center gap-3 px-5 py-2.5 transition-colors hover:bg-muted/60 focus-visible:outline-2 focus-visible:outline-ring">
              <span className="relative">
                <PersonAvatar id={c.person.id} name={c.person.name} hasPhoto={c.person.hasPhoto} size="sm" />
                <span aria-hidden className={cn("absolute -bottom-1 grid size-4.5 place-items-center rounded-full text-white ring-2 ring-card inset-e-[-4px]", c.kind === "birthday" ? "bg-pink-500" : "bg-violet-600")}>
                  {c.kind === "birthday" ? <Cake className="size-2.5" /> : <PartyPopper className="size-2.5" />}
                </span>
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium" dir="auto">
                  {c.person.name}
                </span>
                <span className="block truncate text-xs text-muted-foreground">
                  {c.kind === "birthday" ? t("Birthday") : t.plural(c.years, "{count} year at the company", "{count} years at the company")}
                </span>
              </span>
              <span className={cn("rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap", c.days === 0 ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground")}>
                {c.days === 0 ? t("Today") : c.days === 1 ? t("Tomorrow") : t.plural(c.days, "in {count} day", "in {count} days")}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </Panel>
  );
}

/** How many people are in each department, as bars. */
export function DepartmentsPanel({ departments, noDepartment, total }: { departments: { id: string; name: string; color: string; count: number }[]; noDepartment: number; total: number }) {
  const t = useT();
  if (departments.length === 0 || total === 0) return null;
  const rows = [...departments].sort((a, b) => b.count - a.count);
  if (noDepartment) rows.push({ id: "", name: t("No department"), color: "#94a3b8", count: noDepartment });
  return (
    <Panel id="hr-departments" title={t("By department")} icon={Building}>
      <ul className="grid gap-3 px-5 pb-5">
        {rows.map((d) => (
          <li key={d.id || "none"} className="grid gap-1">
            <div className="flex items-center justify-between gap-2 text-sm">
              <span className="truncate" dir="auto">
                {d.name}
              </span>
              <span className="text-muted-foreground tabular-nums">{d.count.toLocaleString(t.intl)}</span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-muted" aria-hidden>
              <div className="h-full rounded-full" style={{ width: `${Math.max(d.count ? 4 : 0, (d.count / total) * 100)}%`, backgroundColor: d.color }} />
            </div>
          </li>
        ))}
      </ul>
    </Panel>
  );
}
