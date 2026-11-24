"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { AlertTriangle, KeyRound, Search, Users } from "lucide-react";
import { EMPLOYMENT_TYPES, isActive, labelOf, type AttentionKind } from "@/lib/hr";
import { cn } from "@/lib/utils";
import { useT } from "@/i18n/client";
import { Input } from "@/components/ui/input";
import { SelectBox } from "@/components/ui/select-box";
import { EmptyState } from "@/components/page/kit";
import { DepartmentTag, PersonAvatar, useTenureText } from "./hr-ui";

export type PersonRow = {
  id: string;
  code: string;
  name: string;
  nameAlt: string | null;
  jobTitle: string | null;
  department: { id: string; name: string; color: string } | null;
  manager: string | null;
  employmentType: string;
  hireDate: string | null;
  endDate: string | null;
  probationEndDate: string | null;
  hasPhoto: boolean;
  hasLogin: boolean;
  phone: string | null;
  completeness: number;
  alerts: number;
  worstAlert: AttentionKind | null;
};

type Status = "active" | "left" | "all";

/** Search and filter everyone; each row opens the person's file. */
export function PeopleView({ slug, rows, departments, today }: { slug: string; rows: PersonRow[]; departments: { id: string; name: string }[]; today: string }) {
  const t = useT();
  const tenureText = useTenureText();
  const [q, setQ] = useState("");
  const [dept, setDept] = useState("");
  const [status, setStatus] = useState<Status>("active");
  const [type, setType] = useState("");

  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return rows.filter((r) => {
      const active = isActive(r, today);
      if (status === "active" && !active) return false;
      if (status === "left" && active) return false;
      if (dept === "none" ? r.department : dept && r.department?.id !== dept) return false;
      if (type && r.employmentType !== type) return false;
      if (!needle) return true;
      return [r.name, r.nameAlt, r.jobTitle, r.code, r.phone, r.department?.name, r.manager].some((v) => v?.toLowerCase().includes(needle));
    });
  }, [rows, q, dept, status, type, today]);
  const leftCount = rows.filter((r) => !isActive(r, today)).length;

  return (
    <section aria-labelledby="people-list" className="overflow-hidden rounded-2xl border bg-card">
      <div className="flex flex-wrap items-center gap-2 border-b px-4 py-3">
        <h2 id="people-list" className="sr-only">
          {t("Employees")}
        </h2>
        <div className="relative min-w-48 flex-1">
          <Search className="pointer-events-none absolute top-1/2 size-4 -translate-y-1/2 text-muted-foreground inset-s-3" aria-hidden />
          <Input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={t("Search name, job, number, phone…")}
            aria-label={t("Search people")}
            className="h-9 ps-9"
          />
        </div>
        <SelectBox className="h-9" value={dept} onValueChange={setDept} aria-label={t("Department")}>
          <option value="">{t("All departments")}</option>
          {departments.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name}
            </option>
          ))}
          <option value="none">{t("No department")}</option>
        </SelectBox>
        <SelectBox className="h-9" value={type} onValueChange={setType} aria-label={t("Employment type")}>
          <option value="">{t("All types")}</option>
          {EMPLOYMENT_TYPES.map((o) => (
            <option key={o.value} value={o.value}>
              {t(o.label)}
            </option>
          ))}
        </SelectBox>
        <div role="radiogroup" aria-label={t("Status")} className="inline-flex rounded-lg border p-0.5 text-sm">
          {(
            [
              ["active", t("Working")],
              ["left", t.plural(leftCount, "Left ({count})", "Left ({count})")],
              ["all", t("All")],
            ] as const
          ).map(([v, label]) => (
            <button
              key={v}
              type="button"
              role="radio"
              aria-checked={status === v}
              onClick={() => setStatus(v)}
              className="cursor-pointer rounded-md px-2.5 py-1 text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring aria-checked:bg-primary/10 aria-checked:font-medium aria-checked:text-primary"
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {shown.length === 0 ? (
        <EmptyState icon={Users} title={t("No one matches.")} className="m-4 border-0">
          {t("Try another search or clear the filters.")}
        </EmptyState>
      ) : (
        <ul className="divide-y">
          {shown.map((r) => {
            const left = !isActive(r, today);
            const onProbation = !left && r.probationEndDate && r.probationEndDate >= today;
            return (
              <li key={r.id}>
                <Link
                  href={`/w/${slug}/hr/${r.id}`}
                  className={cn("group flex items-center gap-4 px-4 py-3 transition-colors hover:bg-muted/50 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring", left && "opacity-70")}
                >
                  <PersonAvatar id={r.id} name={r.name} hasPhoto={r.hasPhoto} />
                  <div className="grid min-w-0 flex-1 gap-0.5 sm:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_minmax(0,0.9fr)] sm:items-center sm:gap-4">
                    <div className="min-w-0">
                      <p className="flex items-center gap-2">
                        <span className="truncate font-medium group-hover:text-primary" dir="auto">
                          {r.name}
                        </span>
                        {r.hasLogin && <KeyRound className="size-3.5 shrink-0 text-muted-foreground" aria-label={t("Has a Tamm login")} />}
                      </p>
                      <p className="truncate text-xs text-muted-foreground" dir="auto">
                        <span className="tabular-nums" dir="ltr">
                          {r.code}
                        </span>
                        {r.jobTitle && ` · ${r.jobTitle}`}
                      </p>
                    </div>
                    <div className="min-w-0 text-sm text-muted-foreground">
                      {r.department ? <DepartmentTag name={r.department.name} color={r.department.color} /> : !r.manager && <span className="hidden sm:inline">—</span>}
                      {r.manager && (
                        <p className="hidden truncate text-xs sm:block" dir="auto">
                          {t("Reports to {name}", { name: r.manager })}
                        </p>
                      )}
                    </div>
                    <div className="hidden min-w-0 text-sm sm:block">
                      {left ? (
                        <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">{t("Left")}</span>
                      ) : (
                        <>
                          <p className="truncate text-muted-foreground">{tenureText(r.hireDate, today) ?? t(labelOf(EMPLOYMENT_TYPES, r.employmentType))}</p>
                          {onProbation && <p className="text-xs text-amber-700 dark:text-amber-400">{t("On probation")}</p>}
                        </>
                      )}
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-3">
                    {r.alerts > 0 && (
                      <span
                        className={cn(
                          "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold tabular-nums",
                          r.worstAlert === "doc_expired" || r.worstAlert === "contract_ended" ? "bg-destructive/10 text-destructive" : "bg-amber-500/15 text-amber-800 dark:text-amber-300",
                        )}
                      >
                        <AlertTriangle className="size-3.5" aria-hidden />
                        {r.alerts}
                        <span className="sr-only">{t("need attention")}</span>
                      </span>
                    )}
                    <CompletenessRing percent={r.completeness} />
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
      <p className="border-t px-4 py-2 text-xs text-muted-foreground">{t.plural(shown.length, "{count} person shown", "{count} people shown")}</p>
    </section>
  );
}

/** A small ring for how complete the file is. */
export function CompletenessRing({ percent, size = 32 }: { percent: number; size?: number }) {
  const t = useT();
  const r = (size - 4) / 2;
  const c = 2 * Math.PI * r;
  const color = percent >= 90 ? "text-green-600" : percent >= 60 ? "text-primary" : "text-amber-500";
  return (
    <span className="relative grid place-items-center" style={{ width: size, height: size }} role="img" aria-label={t("File {percent}% complete", { percent })} title={t("File {percent}% complete", { percent })}>
      <svg width={size} height={size} className="-rotate-90" aria-hidden>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth="3" className="stroke-muted" />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth="3" strokeLinecap="round" className={cn("stroke-current transition-[stroke-dashoffset] duration-500", color)} strokeDasharray={c} strokeDashoffset={c * (1 - percent / 100)} />
      </svg>
      <span className="absolute text-[9px] font-semibold tabular-nums" aria-hidden>
        {percent}
      </span>
    </span>
  );
}
