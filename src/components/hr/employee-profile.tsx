"use client";

import { useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Banknote,
  Briefcase,
  Camera,
  ChevronRight,
  Eye,
  EyeOff,
  FileText,
  History,
  KeyRound,
  Loader2,
  LogOut,
  Mail,
  MoreHorizontal,
  Network,
  NotebookPen,
  Paperclip,
  Pencil,
  Phone,
  Plus,
  RotateCcw,
  Trash2,
  User,
  HardHat,
  X,
  ClipboardCheck,
  Cake,
  Building2,
  Clock,
  HeartPulse,
  CalendarCheck,
  CalendarClock,
  CalendarDays,
  LayoutGrid,
  MapPin,
  Package,
  Plane,
} from "lucide-react";
import { toast } from "sonner";
import type { Employee, EmployeeDocument } from "@/lib/data/hr";
import {
  deleteEmployee,
  deleteEmployeeDocument,
  saveEmployeeDocument,
  setEmployeeLeft,
  setEmployeePhoto,
  updateEmployee,
  type EmployeeInput,
} from "@/lib/actions/hr";
import {
  EMPLOYEE_DOC_TYPES,
  EMPLOYMENT_TYPES,
  GENDERS,
  MARITAL_STATUSES,
  PAY_BASES,
  expiryState,
  grossPay,
  isActive,
  labelOf,
} from "@/lib/hr";
import { CURRENCIES } from "@/lib/constants";
import { LEAVING_REASONS } from "@/lib/hr-rules";
import { todayISO } from "@/lib/accomplishment";
import { describeActivity } from "@/lib/activity-text";
import { cn, formatDate, formatMoney, timeAgo } from "@/lib/utils";
import { useT } from "@/i18n/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { SelectBox } from "@/components/ui/select-box";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { FieldError } from "@/components/projects/project-fields";
import { Panel } from "@/components/page/kit";
import { DepartmentTag, ExpiryBadge, PersonAvatar, useTenureText } from "./hr-ui";

type Brief = { id: string; name: string; jobTitle: string | null; hasPhoto: boolean };
type Section = "job" | "personal" | "pay" | "links" | "notes";

type Props = {
  slug: string;
  today: string;
  employee: Employee;
  code: string;
  completeness: { percent: number; missing: string[] };
  documents: EmployeeDocument[];
  departments: { id: string; name: string; color: string }[];
  managers: Brief[];
  chain: Brief[];
  reports: Brief[];
  links: { members: { id: string; name: string; email: string }[]; workers: { id: string; name: string; role: string | null }[] };
  history: { id: string; type: string; data: Record<string, unknown>; at: Date; actor: string | null }[];
  shifts: { id: string; name: string; workStart: string; workEnd: string }[];
  /** Panels rendered by the page (leave, attendance, assets, contracts, payslips), shown in their tabs. */
  slots: { contracts: React.ReactNode; payslips: React.ReactNode; attendance: React.ReactNode; leave: React.ReactNode; assets: React.ReactNode };
  counts: { assetsHeld: number };
  /** For the overview tiles. */
  overview: { leave: { name: string; available: number; total: number } | null; month: { worked: number; absent: number; late: number; leave: number } | null };
};

/** Which section holds a missing detail, so "Missing: Phone" opens the right form. */
const MISSING_SECTION: Record<string, Section> = {
  "Job title": "job",
  Department: "job",
  "Hire date": "job",
  "Date of birth": "personal",
  Phone: "personal",
  "ID number": "personal",
  "Emergency contact": "personal",
  Pay: "pay",
  "Bank account": "pay",
};

const toInput = (e: Employee): EmployeeInput => ({
  name: e.name,
  nameAlt: e.nameAlt,
  jobTitle: e.jobTitle,
  departmentId: e.departmentId,
  managerId: e.managerId,
  employmentType: e.employmentType as EmployeeInput["employmentType"],
  workLocation: e.workLocation,
  hireDate: e.hireDate,
  probationEndDate: e.probationEndDate,
  contractEndDate: e.contractEndDate,
  birthDate: e.birthDate,
  gender: e.gender,
  nationality: e.nationality,
  nationalId: e.nationalId,
  maritalStatus: e.maritalStatus,
  phone: e.phone,
  email: e.email,
  address: e.address,
  emergencyName: e.emergencyName,
  emergencyPhone: e.emergencyPhone,
  payBasis: e.payBasis as EmployeeInput["payBasis"],
  basicPay: e.basicPay,
  allowances: e.allowances,
  currency: e.currency,
  bankName: e.bankName,
  bankAccount: e.bankAccount,
  notes: e.notes,
  userId: e.userId,
  resourceId: e.resourceId,
  shiftId: e.shiftId,
});

const PROFILE_TABS = ["overview", "job", "personal", "documents", "time", "assets", "history"] as const;
type ProfileTab = (typeof PROFILE_TABS)[number];

export function EmployeeProfile(p: Props) {
  const t = useT();
  const tenureText = useTenureText();
  const e = p.employee;
  const [editing, setEditing] = useState<Section | null>(null);
  const [showPay, setShowPay] = useState(false);
  const asked = useSearchParams().get("tab") as ProfileTab | null;
  const [tab, setTabState] = useState<ProfileTab>(asked && PROFILE_TABS.includes(asked) ? asked : "overview");
  // The open tab is kept in the address so a refresh or a shared link opens it again.
  const setTab = (v: ProfileTab) => {
    setTabState(v);
    const url = new URL(window.location.href);
    if (v === "overview") url.searchParams.delete("tab");
    else url.searchParams.set("tab", v);
    url.hash = "";
    window.history.replaceState(null, "", url);
  };
  const active = isActive(e, p.today);
  const dep = p.departments.find((d) => d.id === e.departmentId);
  const manager = p.chain[0];
  const onProbation = active && e.probationEndDate && e.probationEndDate >= p.today;
  const tenure = tenureText(e.hireDate, e.endDate && e.endDate < p.today ? e.endDate : p.today);
  const base = `/w/${p.slug}/hr`;
  const linkedMember = e.userId ? p.links.members.find((m) => m.id === e.userId) : undefined;
  const linkedWorker = e.resourceId ? p.links.workers.find((w) => w.id === e.resourceId) : undefined;
  const shift = p.shifts.find((x) => x.id === e.shiftId);
  const docAlerts = p.documents.filter((d) => ["expired", "expiring"].includes(expiryState(d.expiryDate, p.today))).length;

  // Dates worth knowing about soon: probation, contract, papers, birthday.
  const upcoming = [
    ...(onProbation && e.probationEndDate ? [{ key: "probation", label: t("Probation ends"), date: e.probationEndDate, icon: Briefcase }] : []),
    ...(active && e.contractEndDate ? [{ key: "contract", label: t("Contract ends"), date: e.contractEndDate, icon: FileText }] : []),
    ...p.documents
      .filter((d) => d.expiryDate && ["expired", "expiring"].includes(expiryState(d.expiryDate, p.today)))
      .map((d) => ({ key: d.id, label: d.title || t(labelOf(EMPLOYEE_DOC_TYPES, d.type)), date: d.expiryDate!, icon: FileText })),
    ...(e.birthDate ? [{ key: "birthday", label: t("Birthday"), date: nextYearly(e.birthDate, p.today), icon: Cake }] : []),
  ].sort((a, b) => a.date.localeCompare(b.date));

  const tabs: { key: ProfileTab; label: string; icon: typeof User; badge?: number; alert?: boolean }[] = [
    { key: "overview", label: t("Overview"), icon: LayoutGrid },
    { key: "job", label: t("Job and pay"), icon: Briefcase },
    { key: "personal", label: t("Personal"), icon: User },
    { key: "documents", label: t("Documents"), icon: FileText, badge: p.documents.length, alert: docAlerts > 0 },
    { key: "time", label: t("Time and leave"), icon: CalendarCheck },
    { key: "assets", label: t("Assets"), icon: Package, badge: p.counts.assetsHeld },
    { key: "history", label: t("History"), icon: History },
  ];

  const jobFacts: [string, React.ReactNode, Section?][] = [
    [t("Job title"), e.jobTitle, "job"],
    [t("Department"), dep ? <DepartmentTag name={dep.name} color={dep.color} /> : null, "job"],
    [t("Reports to"), manager ? <PersonLink slug={p.slug} person={manager} /> : null, "job"],
    [t("Employment type"), t(labelOf(EMPLOYMENT_TYPES, e.employmentType))],
    [t("Work location"), e.workLocation, "job"],
    [t("Work hours"), shift ? `${shift.name} · ${shift.workStart}–${shift.workEnd}` : t("Company hours")],
    [t("Hire date"), e.hireDate ? formatDate(e.hireDate, t.intl) : null, "job"],
    [t("Probation ends"), e.probationEndDate ? <DateWithState date={e.probationEndDate} today={p.today} /> : null, "job"],
    [t("Contract ends"), e.contractEndDate ? <DateWithState date={e.contractEndDate} today={p.today} /> : null, "job"],
    ...(e.endDate ? ([[t("Last day"), [formatDate(e.endDate, t.intl), e.endReason ? t(labelOf(LEAVING_REASONS, e.endReason)) : null, e.endNote].filter(Boolean).join(" · ")]] as [string, React.ReactNode][]) : []),
  ];
  const personalFacts: [string, React.ReactNode, Section?][] = [
    [t("Date of birth"), e.birthDate ? `${formatDate(e.birthDate, t.intl)} · ${t.plural(ageOn(e.birthDate, p.today), "{count} year old", "{count} years old")}` : null, "personal"],
    [t("Gender"), e.gender ? t(labelOf(GENDERS, e.gender)) : null, "personal"],
    [t("Nationality"), e.nationality, "personal"],
    [t("ID number"), e.nationalId ? <span dir="ltr">{e.nationalId}</span> : null, "personal"],
    [t("Marital status"), e.maritalStatus ? t(labelOf(MARITAL_STATUSES, e.maritalStatus)) : null, "personal"],
    [t("Address"), e.address, "personal"],
  ];

  const reportingLine = (
    <Panel id="emp-org" title={t("Reporting line")} icon={Network} action={<EditButton onClick={() => setEditing("job")} label={t("Change manager")} />}>
      <div className="grid gap-1 px-5 pb-5">
        {p.chain.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("Doesn't report to anyone (top of the chart).")}</p>
        ) : (
          <ol className="grid gap-1">
            {[...p.chain].reverse().map((m, i) => (
              <li key={m.id} className="flex items-center gap-2" style={{ paddingInlineStart: `${i * 12}px` }}>
                <PersonLink slug={p.slug} person={m} compact />
              </li>
            ))}
          </ol>
        )}
        <div className="my-1 flex items-center gap-2 rounded-xl bg-primary/5 p-2 ring-1 ring-primary/20" style={{ marginInlineStart: `${p.chain.length * 12}px` }}>
          <PersonAvatar id={e.id} name={e.name} hasPhoto={Boolean(e.photoPath)} size="sm" />
          <span className="min-w-0">
            <span className="block truncate text-sm font-semibold" dir="auto">
              {e.name}
            </span>
            {e.jobTitle && (
              <span className="block truncate text-xs text-muted-foreground" dir="auto">
                {e.jobTitle}
              </span>
            )}
          </span>
        </div>
        {p.reports.length > 0 && (
          <>
            <p className="mt-2 text-xs font-semibold tracking-wider text-muted-foreground uppercase">{t.plural(p.reports.length, "{count} direct report", "{count} direct reports")}</p>
            <ul className="grid gap-1">
              {p.reports.map((r) => (
                <li key={r.id}>
                  <PersonLink slug={p.slug} person={r} compact />
                </li>
              ))}
            </ul>
          </>
        )}
        <Link href={`${base}/org`} className="mt-2 inline-flex items-center gap-1 text-sm text-primary hover:underline">
          {t("Open the org chart")}
          <ChevronRight className="size-4 rtl:rotate-180" aria-hidden />
        </Link>
      </div>
    </Panel>
  );

  const sideFacts: { icon: typeof User; label: string; value: React.ReactNode; section?: Section }[] = [
    { icon: Building2, label: t("Department"), value: dep ? <DepartmentTag name={dep.name} color={dep.color} /> : null, section: "job" },
    { icon: Network, label: t("Reports to"), value: manager ? <PersonLink slug={p.slug} person={manager} /> : null, section: "job" },
    { icon: CalendarDays, label: t("Hire date"), value: e.hireDate ? [formatDate(e.hireDate, t.intl), tenure].filter(Boolean).join(" · ") : null, section: "job" },
    { icon: MapPin, label: t("Work location"), value: e.workLocation, section: "job" },
    { icon: Clock, label: t("Work hours"), value: shift ? `${shift.name} · ${shift.workStart}–${shift.workEnd}` : t("Company hours") },
    {
      icon: Phone,
      label: t("Phone"),
      value: e.phone ? (
        <a className="text-primary hover:underline" href={`tel:${e.phone}`} dir="ltr">
          {e.phone}
        </a>
      ) : null,
      section: "personal",
    },
    {
      icon: Mail,
      label: t("Email"),
      value: e.email ? (
        <a className="break-all text-primary hover:underline" href={`mailto:${e.email}`}>
          {e.email}
        </a>
      ) : null,
      section: "personal",
    },
    { icon: HeartPulse, label: t("Emergency contact"), value: e.emergencyName || e.emergencyPhone ? [e.emergencyName, e.emergencyPhone].filter(Boolean).join(" · ") : null, section: "personal" },
  ];

  return (
    <>
      <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-[19rem_minmax(0,1fr)] 2xl:grid-cols-[21rem_minmax(0,1fr)]">
        {/* Identity card: stays in view while the tabs on the right scroll. */}
        <aside className="grid gap-4 lg:sticky lg:top-6">
          <section aria-labelledby="emp-name" className="overflow-hidden rounded-2xl border bg-card">
            <div aria-hidden className="relative h-24 overflow-hidden">
              <div className="absolute inset-0 text-white/20 [background-image:radial-gradient(currentColor_1px,transparent_1px)] [background-size:14px_14px]" />
              <div className="absolute -bottom-16 size-40 rounded-full bg-brand-accent/20 blur-2xl inset-e-[-2rem]" />
            </div>
            <div className="-mt-12 grid justify-items-center gap-3 px-5 pb-5 text-center">
              <PhotoButton id={e.id} name={e.name} hasPhoto={Boolean(e.photoPath)} />
              <div className="grid gap-1">
                <h1 id="emp-name" className="text-xl font-bold tracking-tight" dir="auto">
                  {e.name}
                </h1>
                {e.nameAlt && (
                  <p className="text-sm text-muted-foreground" dir="auto">
                    {e.nameAlt}
                  </p>
                )}
                <p className="text-sm text-muted-foreground" dir="auto">
                  {e.jobTitle || t(labelOf(EMPLOYMENT_TYPES, e.employmentType))}
                </p>
              </div>
              <div className="flex flex-wrap justify-center gap-1.5">
                <span className="rounded-md border bg-background px-1.5 py-0.5 text-xs font-semibold text-muted-foreground tabular-nums" dir="ltr">
                  {p.code}
                </span>
                {!active ? (
                  <StatusChip tone="muted">{t("Left on {date}", { date: formatDate(e.endDate, t.intl) })}</StatusChip>
                ) : e.endDate ? (
                  <StatusChip tone="warn">{t("Last day {date}", { date: formatDate(e.endDate, t.intl) })}</StatusChip>
                ) : onProbation ? (
                  <StatusChip tone="warn">{t("On probation until {date}", { date: formatDate(e.probationEndDate, t.intl) })}</StatusChip>
                ) : (
                  <StatusChip tone="good">{t("Working")}</StatusChip>
                )}
              </div>
              <div className="flex w-full items-center gap-2 pt-1">
                <Button className="flex-1" onClick={() => setEditing("job")}>
                  <Pencil className="size-4" />
                  {t("Edit")}
                </Button>
                {e.phone && (
                  <Button variant="outline" size="icon" asChild>
                    <a href={`tel:${e.phone}`} aria-label={t("Call {name}", { name: e.name })} title={e.phone}>
                      <Phone className="size-4" />
                    </a>
                  </Button>
                )}
                {e.email && (
                  <Button variant="outline" size="icon" asChild>
                    <a href={`mailto:${e.email}`} aria-label={t("Email {name}", { name: e.name })} title={e.email}>
                      <Mail className="size-4" />
                    </a>
                  </Button>
                )}
                <MoreMenu employee={e} slug={p.slug} active={active} />
              </div>
            </div>
            <dl className="grid gap-3.5 border-t px-5 py-4 text-sm">
              {sideFacts.map((f) => (
                <div key={f.label} className="flex items-start gap-3">
                  <f.icon className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
                  <div className="min-w-0 flex-1">
                    <dt className="text-xs text-muted-foreground">{f.label}</dt>
                    <dd className="mt-0.5 font-medium">
                      {f.value ? (
                        <bdi>{f.value}</bdi>
                      ) : f.section ? (
                        <button type="button" onClick={() => setEditing(f.section!)} className="cursor-pointer font-normal text-primary/80 hover:text-primary hover:underline focus-visible:outline-2 focus-visible:outline-ring">
                          + {t("Add")}
                        </button>
                      ) : null}
                    </dd>
                  </div>
                </div>
              ))}
            </dl>
            {p.completeness.percent < 100 && (
              <div className="grid gap-2.5 border-t bg-muted/30 px-5 py-4">
                <div className="flex items-center justify-between gap-3 text-sm">
                  <span className="font-medium">{t("File {percent}% complete", { percent: p.completeness.percent })}</span>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-muted" aria-hidden>
                  <div className="h-full rounded-full bg-primary" style={{ width: `${p.completeness.percent}%` }} />
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="text-xs text-muted-foreground">{t("Missing:")}</span>
                  {p.completeness.missing.map((m) =>
                    m === "Photo" ? (
                      <span key={m} className="rounded-full border border-dashed px-2 py-0.5 text-xs text-muted-foreground">
                        {t(m)}
                      </span>
                    ) : (
                      <button
                        key={m}
                        type="button"
                        onClick={() => setEditing(MISSING_SECTION[m] ?? "job")}
                        className="cursor-pointer rounded-full border border-dashed border-primary/40 px-2 py-0.5 text-xs text-primary transition-colors hover:bg-primary/10 focus-visible:outline-2 focus-visible:outline-ring"
                      >
                        + {t(m)}
                      </button>
                    ),
                  )}
                </div>
              </div>
            )}
          </section>
        </aside>

        <div className="grid min-w-0 grid-cols-1 gap-6">
          <div role="tablist" aria-label={t("Sections of {name}'s file", { name: e.name })} className="flex gap-1 overflow-x-auto rounded-2xl border bg-card p-1.5">
            {tabs.map((x) => (
              <button
                key={x.key}
                type="button"
                role="tab"
                id={`tab-${x.key}`}
                aria-selected={tab === x.key}
                aria-controls={`panel-${x.key}`}
                onClick={() => setTab(x.key)}
                className={cn(
                  "inline-flex h-10 shrink-0 cursor-pointer items-center gap-2 rounded-xl px-3.5 text-sm whitespace-nowrap text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring",
                  tab === x.key && "bg-primary/10 font-semibold text-primary hover:bg-primary/15 hover:text-primary",
                )}
              >
                <x.icon className="size-4" aria-hidden />
                {x.label}
                {x.badge ? (
                  <span className={cn("rounded-full px-1.5 text-[11px] font-semibold tabular-nums", x.alert ? "bg-destructive/10 text-destructive" : "bg-muted text-muted-foreground")}>{x.badge}</span>
                ) : x.alert ? (
                  <span aria-hidden className="size-1.5 rounded-full bg-destructive" />
                ) : null}
              </button>
            ))}
          </div>

          <section role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`} className="grid grid-cols-1 gap-6">
            {tab === "overview" && (
              <>
                <dl className="grid grid-cols-2 gap-3 sm:gap-4 2xl:grid-cols-4">
                  <OverviewTile icon={CalendarDays} label={t("Service")} value={tenure ?? "—"} hint={e.hireDate ? t("Since {date}", { date: formatDate(e.hireDate, t.intl) }) : t("No hire date yet")} />
                  <OverviewTile
                    icon={Plane}
                    label={p.overview.leave ? t(p.overview.leave.name) : t("Leave")}
                    value={
                      !p.overview.leave
                        ? "—"
                        : p.overview.leave.available < 0
                          ? t.plural(Math.round(-p.overview.leave.available * 10) / 10, "{count} day over", "{count} days over")
                          : t.plural(Math.round(p.overview.leave.available * 10) / 10, "{count} day left", "{count} days left")
                    }
                    hint={p.overview.leave ? t("of {total} this year", { total: Math.round(p.overview.leave.total * 10) / 10 }) : undefined}
                    tone={p.overview.leave && p.overview.leave.available < 0 ? "bad" : undefined}
                    onClick={() => setTab("time")}
                  />
                  <OverviewTile
                    icon={CalendarCheck}
                    label={t("This month")}
                    value={p.overview.month ? t.plural(p.overview.month.worked, "{count} day worked", "{count} days worked") : "—"}
                    hint={p.overview.month ? t("{absent} absent · {late} late · {leave} on leave", { absent: p.overview.month.absent, late: p.overview.month.late, leave: p.overview.month.leave }) : t("Not employed this month.")}
                    tone={p.overview.month && p.overview.month.absent > 0 ? "bad" : undefined}
                    onClick={() => setTab("time")}
                  />
                  <OverviewTile
                    icon={FileText}
                    label={t("Documents")}
                    value={p.documents.length}
                    hint={docAlerts ? t.plural(docAlerts, "{count} needs renewing", "{count} need renewing") : p.documents.length ? t("All valid") : t("None added yet")}
                    tone={docAlerts ? "bad" : undefined}
                    onClick={() => setTab("documents")}
                  />
                </dl>
                <div className="grid grid-cols-1 items-start gap-6 xl:grid-cols-2">
                  <Panel id="emp-upcoming" title={t("Coming up|celebrations")} icon={CalendarClock} count={upcoming.length}>
                    {upcoming.length === 0 ? (
                      <p className="px-5 pb-5 text-sm text-muted-foreground">{t("Nothing in the coming weeks.")}</p>
                    ) : (
                      <ul className="grid gap-1 px-3 pb-3">
                        {upcoming.slice(0, 6).map((u) => (
                          <li key={u.key} className="flex items-center gap-3 rounded-lg px-2 py-2">
                            <span aria-hidden className="grid size-8 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
                              <u.icon className="size-4" />
                            </span>
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-sm font-medium" dir="auto">
                                {u.label}
                              </span>
                              <span className="block text-xs text-muted-foreground">{formatDate(u.date, t.intl)}</span>
                            </span>
                            {u.key !== "birthday" ? <ExpiryBadge date={u.date} today={p.today} /> : null}
                          </li>
                        ))}
                      </ul>
                    )}
                  </Panel>
                  {reportingLine}
                </div>
                <Panel
                  id="emp-recent"
                  title={t("Recent changes")}
                  icon={History}
                  action={
                    p.history.length > 4 ? (
                      <Button variant="ghost" size="sm" onClick={() => setTab("history")}>
                        {t("See all")}
                      </Button>
                    ) : undefined
                  }
                >
                  {p.history.length === 0 ? (
                    <p className="px-5 pb-5 text-sm text-muted-foreground">{t("No changes yet.")}</p>
                  ) : (
                    <ol className="grid gap-4 px-5 pb-5">
                      {p.history.slice(0, 4).map((h) => (
                        <li key={h.id} className="relative ps-5 text-sm before:absolute before:top-1.5 before:size-2 before:rounded-full before:bg-primary/60 before:inset-s-0 after:absolute after:top-4 after:bottom-[-1rem] after:w-px after:bg-border after:inset-s-[3.5px] last:after:hidden">
                          <span className="font-medium">{h.actor ?? t("System (actor)")}</span> <span className="text-muted-foreground">{describeActivity(h.type, h.data, null, t)}</span>
                          <span className="block text-xs text-muted-foreground">{timeAgo(h.at, t.intl, t("just now"))}</span>
                        </li>
                      ))}
                    </ol>
                  )}
                </Panel>
              </>
            )}

        {tab === "job" && (
          <div className="grid items-start gap-6 lg:grid-cols-2">
            <Panel id="emp-job" title={t("Job")} icon={Briefcase} action={<EditButton onClick={() => setEditing("job")} label={t("Edit job details")} />}>
              <Facts onAdd={setEditing} items={jobFacts} />
            </Panel>
            <Panel
              id="emp-pay"
              title={t("Pay")}
              icon={Banknote}
              action={
                <div className="flex items-center gap-1">
                  <Button variant="ghost" size="sm" onClick={() => setShowPay((v) => !v)} aria-pressed={showPay}>
                    {showPay ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                    {showPay ? t("Hide") : t("Show")}
                  </Button>
                  <EditButton onClick={() => setEditing("pay")} label={t("Edit pay")} />
                </div>
              }
            >
              <PayView employee={e} show={showPay} />
            </Panel>
            <div className="lg:col-span-2">{p.slots.contracts}</div>
          </div>
        )}

        {tab === "personal" && (
          <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
            <div className="grid grid-cols-1 gap-6">
              <Panel id="emp-personal" title={t("Personal")} icon={User} action={<EditButton onClick={() => setEditing("personal")} label={t("Edit personal details")} />}>
                <Facts onAdd={setEditing} items={personalFacts} />
              </Panel>
              <Panel id="emp-notes" title={t("Notes")} icon={NotebookPen} action={<EditButton onClick={() => setEditing("notes")} label={t("Edit notes")} />}>
                <p className={cn("px-5 pb-5 text-sm whitespace-pre-wrap", !e.notes && "text-muted-foreground")} dir="auto">
                  {e.notes || t("Nothing written yet. Only owners and admins can see notes.")}
                </p>
              </Panel>
            </div>
            <Panel id="emp-links" title={t("In Tamm")} icon={KeyRound} action={<EditButton onClick={() => setEditing("links")} label={t("Change links")} />}>
              <ul className="grid gap-3 px-5 pb-5 text-sm">
                <li className="flex items-start gap-3">
                  <KeyRound className="mt-0.5 size-4 text-muted-foreground" aria-hidden />
                  {linkedMember ? (
                    <span>
                      <span className="block font-medium">{t("Has a login")}</span>
                      <span className="block text-muted-foreground">{linkedMember.email}</span>
                    </span>
                  ) : (
                    <span className="text-muted-foreground">{t("No login. Invite them from Members if they need to use Tamm.")}</span>
                  )}
                </li>
                <li className="flex items-start gap-3">
                  <HardHat className="mt-0.5 size-4 text-muted-foreground" aria-hidden />
                  {linkedWorker ? (
                    <span>
                      <span className="block font-medium">{t("Worker in Resources")}</span>
                      <span className="block text-muted-foreground">{t("Same person as the worker in Resources. Attendance and payroll (coming in the next HR steps) will use their project days.")}</span>
                    </span>
                  ) : (
                    <span className="text-muted-foreground">{t("Not linked to a worker in Resources.")}</span>
                  )}
                </li>
              </ul>
            </Panel>
          </div>
        )}

        {tab === "documents" && <DocumentsPanel employeeId={e.id} documents={p.documents} today={p.today} />}

        {tab === "time" && (
          <div className="grid items-start gap-6 lg:grid-cols-2">
            {p.slots.attendance}
            {p.slots.leave}
            <div className="lg:col-span-2">{p.slots.payslips}</div>
          </div>
        )}

        {tab === "assets" && p.slots.assets}

        {tab === "history" && (
          <Panel id="emp-history" title={t("History")} icon={History}>
            {p.history.length === 0 ? (
              <p className="px-5 pb-5 text-sm text-muted-foreground">{t("No changes yet.")}</p>
            ) : (
              <ol className="grid gap-4 px-5 pb-5">
                {p.history.map((h) => (
                  <li key={h.id} className="relative ps-5 text-sm before:absolute before:top-1.5 before:size-2 before:rounded-full before:bg-primary/60 before:inset-s-0 after:absolute after:top-4 after:bottom-[-1rem] after:w-px after:bg-border after:inset-s-[3.5px] last:after:hidden">
                    <span className="font-medium">{h.actor ?? t("System (actor)")}</span> <span className="text-muted-foreground">{describeActivity(h.type, h.data, null, t)}</span>
                    <span className="block text-xs text-muted-foreground">{timeAgo(h.at, t.intl, t("just now"))}</span>
                  </li>
                ))}
              </ol>
            )}
          </Panel>
        )}
          </section>
        </div>
      </div>

      <EditDialog
        section={editing}
        onClose={() => setEditing(null)}
        employee={e}
        departments={p.departments}
        managers={p.managers}
        links={p.links}
        shifts={p.shifts}
      />
    </>
  );
}

/** Next yearly occurrence of a date (birthday), on or after today. */
function nextYearly(date: string, today: string) {
  const y = Number(today.slice(0, 4));
  const md = date.slice(5);
  const thisYear = `${y}-${md === "02-29" ? "02-28" : md}`;
  return thisYear >= today ? thisYear : `${y + 1}-${md === "02-29" ? "02-28" : md}`;
}

function StatusChip({ tone, children }: { tone: "good" | "warn" | "muted"; children: React.ReactNode }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium",
        tone === "good" && "bg-green-600/10 text-green-700 dark:text-green-400",
        tone === "warn" && "bg-amber-500/15 text-amber-800 dark:text-amber-300",
        tone === "muted" && "bg-muted text-muted-foreground",
      )}
    >
      <span aria-hidden className={cn("size-1.5 rounded-full", tone === "good" ? "bg-green-600" : tone === "warn" ? "bg-amber-500" : "bg-muted-foreground")} />
      {children}
    </span>
  );
}

/** A headline number on the overview; clicking opens the tab with the details. */
function OverviewTile({ icon: Icon, label, value, hint, tone, onClick }: { icon: typeof User; label: string; value: React.ReactNode; hint?: string; tone?: "bad"; onClick?: () => void }) {
  const body = (
    <>
      <div className="flex items-start justify-between gap-3">
        <dt className="text-sm font-medium text-muted-foreground">{label}</dt>
        <span aria-hidden className={cn("hidden size-9 shrink-0 place-items-center rounded-xl sm:grid", tone === "bad" ? "bg-destructive/10 text-destructive" : "bg-primary/10 text-primary")}>
          <Icon className="size-4.5" />
        </span>
      </div>
      <dd className={cn("mt-2 text-lg leading-tight font-bold tracking-tight sm:text-2xl", tone === "bad" && "text-destructive")}>{value}</dd>
      {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
    </>
  );
  return onClick ? (
    <div className="min-w-0 rounded-2xl border bg-card transition-shadow hover:shadow-md">
      <button type="button" onClick={onClick} className="flex h-full w-full cursor-pointer flex-col justify-start p-4 text-start sm:p-5 focus-visible:rounded-2xl focus-visible:outline-2 focus-visible:outline-ring">
        {body}
      </button>
    </div>
  ) : (
    <div className="min-w-0 rounded-2xl border bg-card p-4 sm:p-5">{body}</div>
  );
}

const ageOn = (birth: string, today: string) => {
  const [by, bm, bd] = birth.split("-").map(Number);
  const [ty, tm, td] = today.split("-").map(Number);
  return ty - by - (tm < bm || (tm === bm && td < bd) ? 1 : 0);
};

function EditButton({ onClick, label }: { onClick: () => void; label: string }) {
  return (
    <Button variant="ghost" size="icon" className="size-8" onClick={onClick} aria-label={label} title={label}>
      <Pencil className="size-4" />
    </Button>
  );
}

/** Label/value pairs; an empty value offers "+ Add" (opening its section) instead of a dash. */
function Facts({ items, cols = 2, onAdd }: { items: [string, React.ReactNode, Section?][]; cols?: 2 | 3; onAdd?: (s: Section) => void }) {
  const t = useT();
  return (
    <dl className={cn("grid gap-x-6 gap-y-4 px-5 pb-5 sm:grid-cols-2", cols === 3 && "xl:grid-cols-3")}>
      {items.map(([label, value, section]) => (
        <div key={label} className="min-w-0 rounded-lg">
          <dt className="text-xs font-medium text-muted-foreground">{label}</dt>
          {/* bdi: a Latin value in Arabic (or the reverse) keeps the page's alignment. */}
          <dd className="mt-0.5 text-sm">
            {value ? (
              <bdi className="font-medium">{value}</bdi>
            ) : section && onAdd ? (
              <button type="button" onClick={() => onAdd(section)} className="cursor-pointer text-sm text-primary/80 transition-colors hover:text-primary hover:underline focus-visible:outline-2 focus-visible:outline-ring">
                + {t("Add")}
              </button>
            ) : (
              <span className="text-muted-foreground/70">—</span>
            )}
          </dd>
        </div>
      ))}
    </dl>
  );
}

function DateWithState({ date, today }: { date: string; today: string }) {
  const t = useT();
  const state = expiryState(date, today);
  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      {formatDate(date, t.intl)}
      {(state === "expiring" || state === "expired") && <ExpiryBadge date={date} today={today} />}
    </span>
  );
}

function PersonLink({ slug, person, compact }: { slug: string; person: Brief; compact?: boolean }) {
  return (
    <Link href={`/w/${slug}/hr/${person.id}`} className={cn("group inline-flex min-w-0 items-center gap-2 rounded-lg", compact && "w-full p-1.5 transition-colors hover:bg-muted/60")}>
      <PersonAvatar id={person.id} name={person.name} hasPhoto={person.hasPhoto} size="sm" />
      <span className="min-w-0">
        <span className="block truncate text-sm font-medium group-hover:text-primary" dir="auto">
          {person.name}
        </span>
        {compact && person.jobTitle && (
          <span className="block truncate text-xs text-muted-foreground" dir="auto">
            {person.jobTitle}
          </span>
        )}
      </span>
    </Link>
  );
}

/** Amounts are hidden until "Show", so the screen is safe to share. */
function PayView({ employee: e, show }: { employee: Employee; show: boolean }) {
  const t = useT();
  const basis = PAY_BASES.find((b) => b.value === e.payBasis) ?? PAY_BASES[0];
  const money = (v: string | number | null) => (show ? formatMoney(v, e.currency, t.intl) : "••••••");
  if (!e.basicPay && e.allowances.length === 0)
    return <p className="px-5 pb-5 text-sm text-muted-foreground">{t("No pay recorded yet.")}</p>;
  const total = grossPay(e);
  return (
    <div className="grid gap-4 px-5 pb-5">
      <div className="flex flex-wrap items-end justify-between gap-3 rounded-xl bg-linear-to-br from-primary/10 to-violet-500/5 p-4">
        <div>
          <p className="text-xs font-medium text-muted-foreground">{t("Total {per}", { per: t(basis.per) })}</p>
          <p className="text-3xl font-bold tracking-tight tabular-nums" aria-live="polite">
            {money(total)}
          </p>
        </div>
        <p className="text-xs text-muted-foreground">{t("{basis} · before deductions", { basis: t(basis.label) })}</p>
      </div>
      <ul className="grid gap-2 text-sm">
        <li className="flex justify-between gap-3">
          <span className="text-muted-foreground">{t("Basic pay")}</span>
          <span className="font-medium tabular-nums">{money(e.basicPay)}</span>
        </li>
        {e.allowances.map((a, i) => (
          <li key={i} className="flex justify-between gap-3">
            <span className="text-muted-foreground" dir="auto">
              {a.name}
            </span>
            <span className="font-medium tabular-nums">{money(a.amount)}</span>
          </li>
        ))}
      </ul>
      {(e.bankName || e.bankAccount) && (
        <p className="border-t pt-3 text-sm">
          <span className="text-muted-foreground">{t("Paid to|bank")} </span>
          <span className="font-medium" dir="auto">
            {e.bankName}
          </span>{" "}
          {e.bankAccount && (
            <span className="tabular-nums" dir="ltr">
              {show ? e.bankAccount : `•••• ${e.bankAccount.slice(-4)}`}
            </span>
          )}
        </p>
      )}
    </div>
  );
}

function PhotoButton({ id, name, hasPhoto }: { id: string; name: string; hasPhoto: boolean }) {
  const t = useT();
  const input = useRef<HTMLInputElement>(null);
  const [pending, startTransition] = useTransition();
  const [version, setVersion] = useState(0);
  const send = (fd: FormData) =>
    startTransition(async () => {
      const res = await setEmployeePhoto(id, fd);
      if (!res.ok) return void toast.error(res.error);
      setVersion((v) => v + 1);
    });
  return (
    <div className="relative">
      <PersonAvatar id={id} name={name} hasPhoto={hasPhoto} version={version} size="xl" className="ring-4 ring-card" />
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button size="icon" variant="secondary" className="absolute -bottom-1 size-8 rounded-full border shadow-sm inset-e-[-2px]" aria-label={t("Change photo")} disabled={pending}>
            {pending ? <Loader2 className="size-4 animate-spin" /> : <Camera className="size-4" />}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start">
          <DropdownMenuItem onSelect={() => input.current?.click()}>
            <Camera className="size-4" />
            {hasPhoto ? t("Upload a new photo") : t("Upload a photo")}
          </DropdownMenuItem>
          {hasPhoto && (
            <DropdownMenuItem
              onSelect={() => {
                const fd = new FormData();
                fd.set("remove", "1");
                send(fd);
              }}
            >
              <X className="size-4" />
              {t("Remove photo")}
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
      <input
        ref={input}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        className="sr-only"
        tabIndex={-1}
        aria-hidden
        onChange={(ev) => {
          const f = ev.target.files?.[0];
          ev.target.value = "";
          if (!f) return;
          const fd = new FormData();
          fd.set("photo", f);
          send(fd);
        }}
      />
    </div>
  );
}

function MoreMenu({ employee: e, slug, active }: { employee: Employee; slug: string; active: boolean }) {
  const t = useT();
  const router = useRouter();
  const [leaving, setLeaving] = useState(false);
  const [pending, startTransition] = useTransition();
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="icon" aria-label={t("More actions")}>
            <MoreHorizontal className="size-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {e.endDate ? (
            <DropdownMenuItem
              onSelect={() =>
                startTransition(async () => {
                  const res = await setEmployeeLeft(e.id, null, null);
                  if (!res.ok) return void toast.error(res.error);
                  toast.success(active ? t("Leaving cancelled") : t("{name} is back at work", { name: e.name }));
                })
              }
            >
              <RotateCcw className="size-4" />
              {active ? t("Cancel leaving") : t("Rehire")}
            </DropdownMenuItem>
          ) : (
            <DropdownMenuItem onSelect={() => setLeaving(true)}>
              <LogOut className="size-4" />
              {t("Record leaving")}
            </DropdownMenuItem>
          )}
          <DropdownMenuItem asChild>
            <Link href={`/w/${slug}/hr/${e.id}/leaving`}>
              <ClipboardCheck className="size-4" />
              {t("Leaving & final settlement")}
            </Link>
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            variant="destructive"
            disabled={pending}
            onSelect={() => {
              if (!confirm(t("Delete {name}'s file and all their documents? Only do this for a file made by mistake. For someone who left, use “Record leaving” instead.", { name: e.name }))) return;
              startTransition(async () => {
                const res = await deleteEmployee(e.id);
                if (!res.ok) return void toast.error(res.error);
                toast.success(t("File deleted"));
                router.push(`/w/${slug}/hr`);
              });
            }}
          >
            <Trash2 className="size-4" />
            {t("Delete file")}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <LeavingDialog open={leaving} onOpenChange={setLeaving} employee={e} slug={slug} />
    </>
  );
}

function LeavingDialog({ open, onOpenChange, employee: e, slug }: { open: boolean; onOpenChange: (o: boolean) => void; employee: Employee; slug: string }) {
  const t = useT();
  const router = useRouter();
  const [date, setDate] = useState(() => todayISO());
  const [reason, setReason] = useState<string>("resigned");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string>();
  const [pending, startTransition] = useTransition();
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <form
          className="grid gap-4"
          onSubmit={(ev) => {
            ev.preventDefault();
            startTransition(async () => {
              const res = await setEmployeeLeft(e.id, date, reason, note);
              if (!res.ok) return setError(res.error);
              toast.success(t("Leaving recorded"));
              onOpenChange(false);
              router.push(`/w/${slug}/hr/${e.id}/leaving`);
            });
          }}
        >
          <DialogHeader>
            <DialogTitle>{t("{name} is leaving", { name: e.name })}</DialogTitle>
            <DialogDescription>{t("Their file is kept with all its history. People who report to them will report to their manager after the last day.")}</DialogDescription>
          </DialogHeader>
          <div className="grid gap-1.5">
            <Label htmlFor="leave-date">{t("Last working day")}</Label>
            <Input id="leave-date" type="date" value={date} onChange={(ev) => setDate(ev.target.value)} required aria-invalid={Boolean(error)} />
            <FieldError message={error} />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="leave-reason">{t("Reason")}</Label>
            <SelectBox id="leave-reason" className="h-9 w-full" value={reason} onValueChange={setReason}>
              {LEAVING_REASONS.map((r) => (
                <option key={r.value} value={r.value}>
                  {t(r.label)}
                </option>
              ))}
            </SelectBox>
            <p className="text-xs text-muted-foreground">{t("“Resigned” can lower end-of-service pay, if your HR settings say so.")}</p>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="leave-note">
              {t("Note")} <span className="font-normal text-muted-foreground">{t("(optional)")}</span>
            </Label>
            <Textarea id="leave-note" dir="auto" rows={2} value={note} onChange={(ev) => setNote(ev.target.value)} maxLength={500} />
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              {t("Cancel")}
            </Button>
            <Button type="submit" disabled={pending}>
              {pending && <Loader2 className="size-4 animate-spin" />}
              {t("Record leaving")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

const SECTION_TITLE: Record<Section, string> = {
  job: "Job details",
  personal: "Personal details",
  pay: "Pay",
  links: "Links in Tamm",
  notes: "Notes",
};

/** One form per section; it saves the whole file so nothing else changes. */
function EditDialog({
  section,
  onClose,
  employee,
  departments,
  managers,
  links,
  shifts,
}: {
  section: Section | null;
  onClose: () => void;
  employee: Employee;
  departments: Props["departments"];
  managers: Brief[];
  links: Props["links"];
  shifts: Props["shifts"];
}) {
  const t = useT();
  const [form, setForm] = useState<EmployeeInput>(() => toInput(employee));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [pending, startTransition] = useTransition();
  const [lastSection, setLastSection] = useState<Section | null>(null);
  // Fresh values every time a section opens.
  if (section !== lastSection) {
    setLastSection(section);
    if (section) {
      setForm(toInput(employee));
      setErrors({});
    }
  }
  const set = <K extends keyof EmployeeInput>(k: K, v: EmployeeInput[K]) => setForm((f) => ({ ...f, [k]: v }));
  const field = (k: keyof EmployeeInput, label: string, props: React.ComponentProps<typeof Input> = {}) => (
    <div className="grid gap-1.5">
      <Label htmlFor={`ef-${k}`}>{label}</Label>
      <Input id={`ef-${k}`} dir="auto" value={(form[k] as string | null) ?? ""} onChange={(ev) => set(k, ev.target.value as never)} aria-invalid={Boolean(errors[k])} {...props} />
      <FieldError message={errors[k]} />
    </div>
  );
  const select = (k: keyof EmployeeInput, label: string, options: { value: string; label: string }[], empty?: string) => (
    <div className="grid gap-1.5">
      <Label htmlFor={`ef-${k}`}>{label}</Label>
      <SelectBox id={`ef-${k}`} className="h-9 w-full" value={(form[k] as string | null) ?? ""} onValueChange={(v) => set(k, v as never)} aria-invalid={Boolean(errors[k])}>
        {empty !== undefined && <option value="">{empty}</option>}
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </SelectBox>
      <FieldError message={errors[k]} />
    </div>
  );
  const allowances = form.allowances ?? [];
  const currencies = [...new Set([form.currency ?? "USD", ...CURRENCIES])];

  return (
    <Dialog open={section !== null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-xl">
        <form
          className="grid gap-4"
          onSubmit={(ev) => {
            ev.preventDefault();
            setErrors({});
            startTransition(async () => {
              const res = await updateEmployee(employee.id, form);
              if (!res.ok) return setErrors(res.fieldErrors ?? { form: res.error });
              toast.success(t("Saved"));
              onClose();
            });
          }}
        >
          <DialogHeader>
            <DialogTitle>{section && t(SECTION_TITLE[section])}</DialogTitle>
            <DialogDescription>{employee.name}</DialogDescription>
          </DialogHeader>

          {section === "job" && (
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2">{field("name", t("Full name"), { maxLength: 120 })}</div>
              <div className="sm:col-span-2">{field("nameAlt", t("Name in the other language (optional)"), { maxLength: 120 })}</div>
              {field("jobTitle", t("Job title"), { maxLength: 120 })}
              {select("departmentId", t("Department"), departments.map((d) => ({ value: d.id, label: d.name })), t("No department"))}
              {select("managerId", t("Reports to"), managers.map((m) => ({ value: m.id, label: m.jobTitle ? `${m.name} · ${m.jobTitle}` : m.name })), t("No one (top of the chart)"))}
              {select("employmentType", t("Employment type"), EMPLOYMENT_TYPES.map((o) => ({ value: o.value, label: t(o.label) })))}
              <div className="sm:col-span-2">{field("workLocation", t("Work location"), { maxLength: 160, placeholder: t("Head office, Site 3…") })}</div>
              {field("hireDate", t("Hire date"), { type: "date", dir: undefined })}
              {field("probationEndDate", t("Probation ends"), { type: "date", dir: undefined })}
              {field("contractEndDate", t("Contract ends"), { type: "date", dir: undefined })}
              {select("shiftId", t("Work hours"), shifts.map((x) => ({ value: x.id, label: `${x.name} · ${x.workStart}–${x.workEnd}` })), t("Company hours"))}
            </div>
          )}

          {section === "personal" && (
            <div className="grid gap-4 sm:grid-cols-2">
              {field("birthDate", t("Date of birth"), { type: "date", dir: undefined })}
              {select("gender", t("Gender"), GENDERS.map((o) => ({ value: o.value, label: t(o.label) })), t("Not set"))}
              {field("nationality", t("Nationality"), { maxLength: 80 })}
              {field("nationalId", t("ID number"), { maxLength: 80 })}
              {select("maritalStatus", t("Marital status"), MARITAL_STATUSES.map((o) => ({ value: o.value, label: t(o.label) })), t("Not set"))}
              {field("phone", t("Phone"), { type: "tel", maxLength: 60, dir: "ltr" })}
              <div className="sm:col-span-2">{field("email", t("Email"), { type: "email", maxLength: 160, dir: "ltr" })}</div>
              <div className="sm:col-span-2">{field("address", t("Address"), { maxLength: 300 })}</div>
              <fieldset className="grid gap-4 rounded-xl border p-3 sm:col-span-2 sm:grid-cols-2">
                <legend className="px-1 text-sm font-medium">{t("Emergency contact")}</legend>
                {field("emergencyName", t("Name and relation"), { maxLength: 120, placeholder: t("Sara, wife") })}
                {field("emergencyPhone", t("Phone"), { type: "tel", maxLength: 60, dir: "ltr" })}
              </fieldset>
            </div>
          )}

          {section === "pay" && (
            <div className="grid gap-4">
              <div className="grid gap-4 sm:grid-cols-3">
                {select("payBasis", t("Pay period"), PAY_BASES.map((o) => ({ value: o.value, label: t(o.label) })))}
                {field("basicPay", t("Basic pay"), { inputMode: "decimal", dir: "ltr", placeholder: "0" })}
                {select("currency", t("Currency"), currencies.map((c) => ({ value: c, label: c })))}
              </div>
              <fieldset className="grid gap-2">
                <legend className="mb-1 text-sm font-medium">{t("Allowances")}</legend>
                {allowances.length === 0 && <p className="text-sm text-muted-foreground">{t("Housing, transport, phone… added on top of basic pay.")}</p>}
                {allowances.map((a, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <Input
                      dir="auto"
                      aria-label={t("Allowance name")}
                      placeholder={t("Transport")}
                      value={a.name}
                      maxLength={80}
                      onChange={(ev) => set("allowances", allowances.map((x, j) => (j === i ? { ...x, name: ev.target.value } : x)))}
                    />
                    <Input
                      dir="ltr"
                      inputMode="decimal"
                      aria-label={t("Amount")}
                      placeholder="0"
                      className="w-32"
                      value={a.amount ?? ""}
                      onChange={(ev) => set("allowances", allowances.map((x, j) => (j === i ? { ...x, amount: ev.target.value } : x)))}
                    />
                    <Button type="button" variant="ghost" size="icon" aria-label={t("Remove")} onClick={() => set("allowances", allowances.filter((_, j) => j !== i))}>
                      <X className="size-4" />
                    </Button>
                  </div>
                ))}
                <Button type="button" variant="outline" size="sm" className="justify-self-start" onClick={() => set("allowances", [...allowances, { name: "", amount: "" }])} disabled={allowances.length >= 20}>
                  <Plus className="size-4" />
                  {t("Add allowance")}
                </Button>
                <FieldError message={errors.allowances} />
              </fieldset>
              <div className="grid gap-4 border-t pt-4 sm:grid-cols-2">
                {field("bankName", t("Bank"), { maxLength: 120 })}
                {field("bankAccount", t("Account number / IBAN"), { maxLength: 80, dir: "ltr" })}
              </div>
            </div>
          )}

          {section === "links" && (
            <div className="grid gap-4">
              {select("userId", t("Tamm login (member)"), links.members.map((m) => ({ value: m.id, label: `${m.name} · ${m.email}` })), t("No login"))}
              {select("resourceId", t("Worker in Resources"), links.workers.map((w) => ({ value: w.id, label: w.role ? `${w.name} · ${w.role}` : w.name })), t("Not linked"))}
              <p className="text-sm text-muted-foreground">{t("Linking tells Tamm these are the same person. Attendance and payroll (coming in the next HR steps) will use it.")}</p>
            </div>
          )}

          {section === "notes" && (
            <div className="grid gap-1.5">
              <Label htmlFor="ef-notes">{t("Notes")}</Label>
              <Textarea id="ef-notes" dir="auto" rows={6} value={form.notes ?? ""} onChange={(ev) => set("notes", ev.target.value)} maxLength={2000} />
            </div>
          )}

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

// --- Documents ---

function DocumentsPanel({ employeeId, documents, today }: { employeeId: string; documents: EmployeeDocument[]; today: string }) {
  const t = useT();
  const [editing, setEditing] = useState<EmployeeDocument | "new" | null>(null);
  const [pending, startTransition] = useTransition();
  const sorted = [...documents].sort((a, b) => {
    const rank = (d: EmployeeDocument) => ({ expired: 0, expiring: 1, valid: 2, none: 3 })[expiryState(d.expiryDate, today)];
    return rank(a) - rank(b) || (a.expiryDate ?? "9").localeCompare(b.expiryDate ?? "9");
  });
  return (
    <div id="documents" className="scroll-mt-6">
      <Panel
        id="emp-docs"
        title={t("Documents")}
        icon={FileText}
        count={documents.length}
        action={
          <Button variant="outline" size="sm" onClick={() => setEditing("new")}>
            <Plus className="size-4" />
            {t("Add document")}
          </Button>
        }
      >
        {sorted.length === 0 ? (
          <p className="px-5 pb-5 text-sm text-muted-foreground">{t("Add passport, ID, residency, permits or contracts. You'll be reminded 30 days before any of them expires.")}</p>
        ) : (
          <ul className="divide-y border-t">
            {sorted.map((d) => (
              <li key={d.id} className="flex flex-wrap items-center gap-3 px-5 py-3">
                <span aria-hidden className="grid size-9 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
                  <FileText className="size-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium" dir="auto">
                    {d.title || t(labelOf(EMPLOYEE_DOC_TYPES, d.type))}
                    {d.docNumber && (
                      <span className="ms-2 text-xs font-normal text-muted-foreground tabular-nums" dir="ltr">
                        {d.docNumber}
                      </span>
                    )}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">
                    {[d.title ? t(labelOf(EMPLOYEE_DOC_TYPES, d.type)) : null, d.issueDate ? t("Issued {date}", { date: formatDate(d.issueDate, t.intl) }) : null, d.expiryDate ? t("Expires {date}", { date: formatDate(d.expiryDate, t.intl) }) : null]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                </div>
                <ExpiryBadge date={d.expiryDate} today={today} />
                <div className="flex items-center">
                  {d.filePath && (
                    <Button variant="ghost" size="icon" className="size-8" asChild>
                      <a href={`/api/files/hr/document/${d.id}`} target="_blank" rel="noopener" aria-label={t("Open file {name}", { name: d.fileName ?? "" })} title={d.fileName ?? undefined}>
                        <Paperclip className="size-4" />
                      </a>
                    </Button>
                  )}
                  <Button variant="ghost" size="icon" className="size-8" onClick={() => setEditing(d)} aria-label={t("Edit")}>
                    <Pencil className="size-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-8 text-muted-foreground hover:text-destructive"
                    disabled={pending}
                    aria-label={t("Delete")}
                    onClick={() => {
                      if (!confirm(t("Delete this document and its file?"))) return;
                      startTransition(async () => {
                        const res = await deleteEmployeeDocument(d.id);
                        if (!res.ok) toast.error(res.error);
                      });
                    }}
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Panel>
      <DocumentDialog employeeId={employeeId} doc={editing} onClose={() => setEditing(null)} />
    </div>
  );
}

function DocumentDialog({ employeeId, doc, onClose }: { employeeId: string; doc: EmployeeDocument | "new" | null; onClose: () => void }) {
  const t = useT();
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [removeFile, setRemoveFile] = useState(false);
  const [pending, startTransition] = useTransition();
  const d = doc && doc !== "new" ? doc : null;
  return (
    <Dialog open={doc !== null} onOpenChange={(o) => !o && (onClose(), setErrors({}), setRemoveFile(false))}>
      <DialogContent className="sm:max-w-lg">
        <form
          key={d?.id ?? "new"}
          className="grid gap-4"
          onSubmit={(ev) => {
            ev.preventDefault();
            const fd = new FormData(ev.currentTarget);
            if (d) fd.set("docId", d.id);
            if (removeFile) fd.set("removeFile", "1");
            setErrors({});
            startTransition(async () => {
              const res = await saveEmployeeDocument(employeeId, fd);
              if (!res.ok) return setErrors(res.fieldErrors ?? { form: res.error });
              toast.success(d ? t("Saved") : t("Document added"));
              setRemoveFile(false);
              onClose();
            });
          }}
        >
          <DialogHeader>
            <DialogTitle>{d ? t("Edit document") : t("Add document")}</DialogTitle>
            <DialogDescription>{t("Give it an expiry date to be reminded 30 days before.")}</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-1.5">
              <Label htmlFor="doc-type">{t("Type")}</Label>
              <SelectBox id="doc-type" name="type" className="h-9 w-full" defaultValue={d?.type ?? "passport"}>
                {EMPLOYEE_DOC_TYPES.map((o) => (
                  <option key={o.value} value={o.value}>
                    {t(o.label)}
                  </option>
                ))}
              </SelectBox>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="doc-number">{t("Number")}</Label>
              <Input id="doc-number" name="docNumber" dir="ltr" defaultValue={d?.docNumber ?? ""} maxLength={80} />
            </div>
            <div className="grid gap-1.5 sm:col-span-2">
              <Label htmlFor="doc-title">
                {t("Title")} <span className="font-normal text-muted-foreground">{t("(optional)")}</span>
              </Label>
              <Input id="doc-title" name="title" dir="auto" defaultValue={d?.title ?? ""} maxLength={120} placeholder={t("e.g. Engineering degree")} />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="doc-issue">{t("Issued on")}</Label>
              <Input id="doc-issue" name="issueDate" type="date" defaultValue={d?.issueDate ?? ""} aria-invalid={Boolean(errors.issueDate)} />
              <FieldError message={errors.issueDate} />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="doc-expiry">{t("Expires on")}</Label>
              <Input id="doc-expiry" name="expiryDate" type="date" defaultValue={d?.expiryDate ?? ""} aria-invalid={Boolean(errors.expiryDate)} />
              <FieldError message={errors.expiryDate} />
            </div>
            <div className="grid gap-1.5 sm:col-span-2">
              <Label htmlFor="doc-file">{d?.filePath ? t("Replace the file") : t("File")}</Label>
              {d?.filePath && !removeFile && (
                <p className="flex items-center gap-2 text-sm">
                  <Paperclip className="size-4 text-muted-foreground" aria-hidden />
                  <span className="truncate">{d.fileName}</span>
                  <Button type="button" variant="link" size="sm" className="h-auto p-0 text-destructive" onClick={() => setRemoveFile(true)}>
                    {t("Remove")}
                  </Button>
                </p>
              )}
              <Input id="doc-file" name="file" type="file" accept="application/pdf,image/jpeg,image/png,image/webp" aria-invalid={Boolean(errors.file)} />
              <p className="text-xs text-muted-foreground">{t("PDF or photo, up to 8 MB.")}</p>
              <FieldError message={errors.file} />
            </div>
            <div className="grid gap-1.5 sm:col-span-2">
              <Label htmlFor="doc-note">
                {t("Note")} <span className="font-normal text-muted-foreground">{t("(optional)")}</span>
              </Label>
              <Input id="doc-note" name="note" dir="auto" defaultValue={d?.note ?? ""} maxLength={500} />
            </div>
          </div>
          <FieldError message={errors.form} />
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose}>
              {t("Cancel")}
            </Button>
            <Button type="submit" disabled={pending}>
              {pending && <Loader2 className="size-4 animate-spin" />}
              {d ? t("Save") : t("Add document")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
