import Link from "next/link";
import {
  AlertTriangle,
  Bell,
  CalendarClock,
  CalendarDays,
  CircleAlert,
  FolderKanban,
  Gauge,
  Hourglass,
  ListChecks,
  PartyPopper,
  ShieldCheck,
  Sparkles,
  TrendingDown,
  Wallet,
} from "lucide-react";
import { requireWorkspace } from "@/lib/auth/session";
import { getProjectHealth, type ProjectHealth } from "@/lib/data/project-health";
import { ProjectHealthTable } from "@/components/projects/project-health-table";
import { AccomplishmentMeter, fmtPct } from "@/components/projects/accomplishment";
import { todayISO } from "@/lib/accomplishment";
import { cn, formatDate, formatMoney } from "@/lib/utils";
import { getT } from "@/i18n/server";
import type { T } from "@/i18n/translate";
import { listPortfolios } from "@/lib/data/portfolios";
import { listMyTasks } from "@/lib/data/my-tasks";
import { listPendingApprovals } from "@/lib/data/expenses";
import { unreadCount } from "@/lib/data/notifications";
import { visibleProjectIds } from "@/lib/data/project-access";
import { PortfolioFilter } from "@/components/portfolios/portfolio-filter";
import { DayLink, HeroBand, ProgressRing } from "@/components/dashboard/dashboard-parts";
import { Panel, StatTile } from "@/components/page/kit";

export async function generateMetadata() {
  const t = await getT();
  return { title: t("Dashboard") };
}

const average = (xs: number[]) => (xs.length ? Math.round((xs.reduce((s, x) => s + x, 0) / xs.length) * 10) / 10 : null);

export default async function DashboardPage({ params, searchParams }: PageProps<"/w/[slug]/dashboard">) {
  const [{ slug }, query] = await Promise.all([params, searchParams]);
  const { user, workspace } = await requireWorkspace(slug);
  const t = await getT();
  const today = todayISO();
  const isAdmin = workspace.role === "owner" || workspace.role === "admin";
  const [allRows, portfolios, myTasks, approvals, unread] = await Promise.all([
    getProjectHealth(workspace, user.id),
    listPortfolios(workspace.id),
    visibleProjectIds(workspace.id, user.id, workspace.role).then((only) => listMyTasks(workspace.id, user.id, only)),
    listPendingApprovals(workspace.id, user.id, isAdmin),
    unreadCount(user.id, workspace.id),
  ]);
  // ?portfolio=<id> or "none": the numbers below cover just that group.
  const portfolio = typeof query.portfolio === "string" && (query.portfolio === "none" || portfolios.some((p) => p.id === query.portfolio)) ? query.portfolio : "";
  const rows = portfolio ? allRows.filter((r) => (portfolio === "none" ? !r.p.portfolioId : r.p.portfolioId === portfolio)) : allRows;
  const base = `/w/${workspace.slug}`;

  const open = rows.filter((r) => !r.finished);
  const count = (state: string | null) => open.filter((r) => r.accomplishment.schedule === state).length;
  const behind = count("behind");
  const overBudget = open.filter((r) => r.money.overBudget).length;
  const headingOver = open.filter((r) => r.headingOver).length;
  const lateTotal = open.reduce((s, r) => s + r.late, 0);
  const needAttention = open.filter((r) => r.attention > 0);

  // The portfolio at a glance: average done vs average planned for today.
  const avgActual = average(open.flatMap((r) => (r.accomplishment.actual === null ? [] : [r.accomplishment.actual])));
  const avgPlanned = average(open.flatMap((r) => (r.accomplishment.planned === null ? [] : [r.accomplishment.planned])));

  // My day: open tasks assigned to me.
  const mine = myTasks.filter((x) => x.category !== "done");
  const myOverdue = mine.filter((x) => x.dueDate && x.dueDate < today).length;
  const myToday = mine.filter((x) => x.dueDate === today).length;
  const waiting = approvals.filter((a) => a.requesterId !== user.id).length;

  // Money can't be added across currencies, so totals are per currency.
  const totals = new Map<string, { budget: number; spent: number; projects: number }>();
  for (const r of open) {
    const sum = totals.get(r.p.currency) ?? { budget: 0, spent: 0, projects: 0 };
    sum.budget += r.money.budget ?? 0;
    sum.spent += r.money.actual;
    sum.projects += 1;
    totals.set(r.p.currency, sum);
  }

  // Currencies with a budget or spending (a list of "$0" says nothing).
  const money = [...totals].filter(([, sum]) => sum.budget > 0 || sum.spent > 0);

  // Deadlines: overdue first, then the soonest end dates.
  const deadlines = open
    .filter((r) => r.daysLeft !== null)
    .sort((a, b) => a.daysLeft! - b.daysLeft!)
    .slice(0, 5);

  const firstName = user.name.trim().split(/\s+/)[0] ?? user.name;
  const summary =
    open.length === 0
      ? t("No open projects yet. Start one and its progress shows up here.")
      : needAttention.length
        ? t.plural(needAttention.length, "{count} project needs your attention", "{count} projects need your attention")
        : t("Everything is on track. Nice work.");

  const schedule = [
    { key: "ahead", label: t("Ahead"), n: count("ahead"), className: "bg-green-600 dark:bg-green-500" },
    { key: "on_track", label: t("On track"), n: count("on_track"), className: "bg-primary" },
    { key: "behind", label: t("Behind"), n: behind, className: "bg-destructive" },
    { key: "none", label: t("No schedule"), n: count(null), className: "bg-muted-foreground/30" },
  ];

  return (
    <div className="grid w-full grid-cols-1 gap-6 px-4 py-6 sm:px-6 lg:py-8">
      {/* ── Hero ─────────────────────────────────────────────────────────── */}
      <HeroBand>
        <div className="flex flex-col gap-6 p-6 sm:p-8 md:flex-row md:items-center md:justify-between">
          <div className="min-w-0">
            <p className="flex items-center gap-2 text-sm font-medium text-white/80">
              <CalendarDays className="size-4" aria-hidden />
              {formatDate(today, t.intl)} · {workspace.name}
            </p>
            <h1 className="mt-2 text-3xl font-bold tracking-tight text-balance sm:text-4xl">{t("Welcome back, {name}", { name: firstName })}</h1>
            <p className="mt-2 flex items-center gap-2 text-base text-white/90">
              {needAttention.length ? <CircleAlert className="size-4.5 shrink-0" aria-hidden /> : <Sparkles className="size-4.5 shrink-0" aria-hidden />}
              {summary}
            </p>
            {portfolios.length > 0 && (
              <div className="mt-5 inline-flex rounded-xl bg-card px-3 py-1.5 text-card-foreground shadow-sm">
                <PortfolioFilter portfolios={portfolios} value={portfolio} />
              </div>
            )}
          </div>
          {open.length > 0 && (
            <div className="flex items-center gap-5 rounded-2xl bg-white/10 p-4 pe-6 ring-1 ring-white/15 backdrop-blur-sm">
              <div className="relative">
                <ProgressRing
                  actual={avgActual}
                  planned={avgPlanned}
                  label={t("Average progress {actual}, planned {planned} by today", { actual: fmtPct(avgActual), planned: fmtPct(avgPlanned) })}
                />
                <span className="absolute inset-0 grid place-items-center text-2xl font-bold tabular-nums">{fmtPct(avgActual)}</span>
              </div>
              <dl className="grid gap-2 text-sm">
                <div>
                  <dt className="text-white/75">{t("Average progress")}</dt>
                  <dd className="font-semibold">{t.plural(open.length, "across {count} open project", "across {count} open projects")}</dd>
                </div>
                <div className="flex items-center gap-2">
                  <span aria-hidden className="h-3 w-1 rounded-full bg-brand-accent" />
                  <dt className="text-white/75">{t("Planned by today")}</dt>
                  <dd className="font-semibold tabular-nums">{fmtPct(avgPlanned)}</dd>
                </div>
              </dl>
            </div>
          )}
        </div>
      </HeroBand>

      {/* ── My day ───────────────────────────────────────────────────────── */}
      <nav aria-label={t("Your day")} className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <DayLink href={`${base}/my-tasks`} icon={CircleAlert} label={t("My overdue tasks")} count={myOverdue} urgent />
        <DayLink href={`${base}/my-tasks`} icon={ListChecks} label={t("Due today")} count={myToday} />
        <DayLink href={`${base}/approvals`} icon={ShieldCheck} label={t("Waiting for your approval")} count={waiting} />
        <DayLink href={`${base}/inbox`} icon={Bell} label={t("Unread in inbox")} count={unread} />
      </nav>

      {/* ── Headline numbers ─────────────────────────────────────────────── */}
      <dl className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile label={t("Open projects")} value={open.length} icon={FolderKanban} hint={t("{count} in total", { count: rows.length })} />
        <StatTile
          label={t("Behind schedule")}
          value={behind}
          icon={TrendingDown}
          tone={behind ? "bad" : "good"}
          hint={t("Done less than planned")}
          share={open.length ? behind / open.length : 0}
          shareLabel={t("Share of open projects behind schedule")}
        />
        <StatTile
          label={t("Over budget")}
          value={overBudget}
          icon={AlertTriangle}
          tone={overBudget ? "bad" : "good"}
          hint={
            headingOver
              ? t.plural(headingOver, "Spent more than budget · {count} more heading over", "Spent more than budget · {count} more heading over")
              : t("Spent more than budget")
          }
          share={open.length ? overBudget / open.length : 0}
          shareLabel={t("Share of open projects over budget")}
        />
        <StatTile label={t("Late tasks")} value={lateTotal} icon={CalendarClock} tone={lateTotal ? "bad" : "good"} hint={t("Past their end date")} />
      </dl>

      {/* ── Health and attention | money and deadlines ───────────────────── */}
      <div className="grid gap-6 xl:grid-cols-3">
        <Panel id="schedule-heading" title={t("Schedule health")} icon={Gauge} className="xl:col-span-2">
          <div className="px-5 pb-5">
            {open.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">{t("No open projects.")}</p>
            ) : (
              <>
                <div className="flex h-3 gap-0.5 overflow-hidden rounded-full" role="img" aria-label={schedule.map((s) => `${s.label}: ${s.n}`).join(", ")}>
                  {schedule
                    .filter((s) => s.n > 0)
                    .map((s) => (
                      <div key={s.key} className={cn("h-full first:rounded-s-full last:rounded-e-full", s.className)} style={{ flexGrow: s.n }} title={`${s.label}: ${s.n}`} />
                    ))}
                </div>
                <ul className="mt-3 flex flex-wrap gap-x-5 gap-y-1.5 text-sm">
                  {schedule.map((s) => (
                    <li key={s.key} className="flex items-center gap-2">
                      <span aria-hidden className={cn("size-2.5 rounded-full", s.className)} />
                      <span className="text-muted-foreground">{s.label}</span>
                      <span className="font-semibold tabular-nums">{s.n}</span>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </div>
          <div className="border-t">
            <h3 className="px-5 pt-4 pb-2 text-sm font-semibold">{t("Needs attention")}</h3>
            {needAttention.length === 0 ? (
              <div className="flex items-center gap-3 px-5 pb-5 text-sm text-muted-foreground">
                <span className="grid size-9 place-items-center rounded-xl bg-green-600/10 text-green-700 dark:text-green-400">
                  <PartyPopper className="size-4.5" aria-hidden />
                </span>
                {t("Nothing needs attention right now.")}
              </div>
            ) : (
              <ul className="divide-y">
                {needAttention.slice(0, 5).map((r) => (
                  <AttentionRow key={r.p.id} r={r} base={base} t={t} />
                ))}
              </ul>
            )}
          </div>
        </Panel>

        <div className="grid content-start gap-6">
          <Panel id="money-heading" title={t("Budget")} icon={Wallet}>
            {money.length === 0 ? (
              <p className="px-5 pb-5 text-sm text-muted-foreground">{open.length ? t("No budgets or spending yet.") : t("No open projects.")}</p>
            ) : (
              <ul className="grid gap-4 px-5 pb-5">
                {money.map(([currency, sum]) => {
                  const pct = sum.budget > 0 ? Math.round((sum.spent / sum.budget) * 1000) / 10 : null;
                  const over = sum.budget > 0 && sum.spent > sum.budget;
                  return (
                    <li key={currency}>
                      <div className="flex items-baseline justify-between gap-2">
                        <p className={cn("text-2xl font-bold tracking-tight tabular-nums", over && "text-destructive")}>{formatMoney(sum.spent, currency, t.intl)}</p>
                        {pct !== null && <p className={cn("text-sm font-semibold tabular-nums", over ? "text-destructive" : "text-primary")}>{t("{pct}% used", { pct })}</p>}
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {sum.budget > 0 ? t("spent of {amount}", { amount: formatMoney(sum.budget, currency, t.intl) }) : t("no budget")}
                      </p>
                      {pct !== null && (
                        <div
                          role="meter"
                          aria-label={t("{currency} budget used", { currency })}
                          aria-valuenow={pct}
                          aria-valuemin={0}
                          aria-valuemax={100}
                          className="mt-2 h-2 overflow-hidden rounded-full bg-muted"
                        >
                          <div
                            className={cn("h-full rounded-full", over ? "bg-destructive" : "bg-primary")}
                            style={{ width: `${Math.min(100, pct)}%` }}
                          />
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </Panel>

          <Panel id="deadlines-heading" title={t("Coming up")} icon={Hourglass}>
            {deadlines.length === 0 ? (
              <p className="px-5 pb-5 text-sm text-muted-foreground">{t("No end dates set.")}</p>
            ) : (
              <ul className="divide-y border-t">
                {deadlines.map((r) => (
                  <li key={r.p.id}>
                    <Link href={`${base}/p/${r.p.key}/overview`} className="flex items-center gap-3 px-5 py-3 transition-colors hover:bg-accent">
                      <span aria-hidden className="size-2.5 shrink-0 rounded-sm" style={{ backgroundColor: r.p.color }} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium">{r.p.name}</span>
                        <span className="block text-xs text-muted-foreground">{formatDate(r.p.endDate, t.intl)}</span>
                      </span>
                      <span
                        className={cn(
                          "shrink-0 rounded-full px-2 py-0.5 text-xs font-medium tabular-nums",
                          r.overdue ? "bg-destructive/10 text-destructive" : r.daysLeft! <= 7 ? "bg-amber-500/15 text-amber-800 dark:text-amber-300" : "bg-muted text-muted-foreground",
                        )}
                      >
                        {r.overdue
                          ? t.plural(-r.daysLeft!, "{count} days overdue", "{count} days overdue")
                          : r.daysLeft === 0
                            ? t("Ends today")
                            : t.plural(r.daysLeft!, "{count} days left", "{count} days left")}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>
      </div>

      {/* ── All projects ─────────────────────────────────────────────────── */}
      <Panel
        id="projects-heading"
        title={t("All projects")}
        icon={FolderKanban}
        className="overflow-hidden"
        action={<p className="hidden text-xs text-muted-foreground sm:block">{t("Projects that need attention are listed first")}</p>}
      >
        {rows.length === 0 ? (
          <p className="border-t px-4 py-10 text-center text-sm text-muted-foreground">
            {t("No projects yet.")}{" "}
            <Link href={base} className="font-medium text-primary underline-offset-4 hover:underline">
              {t("Create one")}
            </Link>
            .
          </p>
        ) : (
          <div className="border-t">
            <ProjectHealthTable rows={rows} base={base} />
          </div>
        )}
      </Panel>
    </div>
  );
}

/** Why a project is flagged, in words (never colour alone), with its progress against plan. */
function AttentionRow({ r, base, t }: { r: ProjectHealth; base: string; t: T }) {
  const reasons = [
    r.money.overBudget && t("Over budget"),
    r.accomplishment.schedule === "behind" && t("Behind schedule"),
    r.headingOver && t("Heading over budget"),
    r.overdue && t("Past its end date"),
    r.late > 0 && t.plural(r.late, "{count} late task", "{count} late tasks"),
  ].filter(Boolean) as string[];
  const a = r.accomplishment;
  return (
    <li>
      <Link href={`${base}/p/${r.p.key}/overview`} className="grid gap-3 px-5 py-3.5 transition-colors hover:bg-accent sm:grid-cols-[1fr_14rem] sm:items-center">
        <span className="min-w-0">
          <span className="flex items-center gap-2">
            <span aria-hidden className="size-2.5 shrink-0 rounded-sm" style={{ backgroundColor: r.p.color }} />
            <span className="truncate font-medium">{r.p.name}</span>
            <span className="font-mono text-xs text-muted-foreground">{r.p.key}</span>
          </span>
          <span className="mt-1.5 flex flex-wrap gap-1.5">
            {reasons.map((x) => (
              <span key={x} className="rounded-full bg-destructive/10 px-2 py-0.5 text-xs font-medium text-destructive">
                {x}
              </span>
            ))}
          </span>
        </span>
        {a.mode !== "empty" && (
          <span className="grid gap-1">
            <span className="flex justify-between text-xs text-muted-foreground">
              <span className="font-semibold text-foreground tabular-nums">{fmtPct(a.actual)}</span>
              {a.planned !== null && <span className="tabular-nums">{t("planned {pct}", { pct: fmtPct(a.planned) })}</span>}
            </span>
            <AccomplishmentMeter actual={a.actual} planned={a.planned} size="sm" label={t("{name} accomplishment", { name: r.p.name })} />
          </span>
        )}
      </Link>
    </li>
  );
}
