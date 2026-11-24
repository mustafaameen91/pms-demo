import type { Metadata } from "next";
import { and, eq, isNull, lt, or } from "drizzle-orm";
import { AlertTriangle, Building2, Calendar, CalendarClock, Gauge, ListChecks, Link2Off, Wallet } from "lucide-react";
import { db } from "@/lib/db";
import { organization, projectShares, projects } from "@/lib/db/schema";
import { getBoard } from "@/lib/data/projects";
import { getProjectResources } from "@/lib/data/resources";
import { getProjectExpenses } from "@/lib/data/expenses";
import { getProjectAdvances } from "@/lib/data/loans";
import { computeAccomplishment, todayISO } from "@/lib/accomplishment";
import { computeBudget } from "@/lib/budget";
import { getWorkspaceAccess } from "@/lib/billing";
import { PROJECT_STATUSES } from "@/lib/constants";
import { formatDate, formatMoney } from "@/lib/utils";
import { AccomplishmentMeter, ScheduleBadge, fmtPct } from "@/components/projects/accomplishment";
import { LightTheme } from "@/components/light-theme";
import { Logo } from "@/components/logo";
import { LanguageSwitcher } from "@/components/shell/language-switcher";
import { getT } from "@/i18n/server";
import { BrandBackdrop } from "@/components/auth/brand-panel";
import { EmptyState, Panel, StatTile } from "@/components/page/kit";

const oneMinuteAgo = () => new Date(Date.now() - 60_000);

// Secret links must never end up in search engines.
export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t("Project progress"), robots: { index: false, follow: false } };
}

/** Public, read-only client view of one project. Access = knowing the token. */
export default async function SharePage({ params }: PageProps<"/share/[token]">) {
  const { token } = await params;
  const t = await getT();
  const [row] = await db
    .select({ share: projectShares, project: projects, workspaceName: organization.name })
    .from(projectShares)
    .innerJoin(projects, eq(projects.id, projectShares.projectId))
    .innerJoin(organization, eq(organization.id, projectShares.workspaceId))
    .where(and(eq(projectShares.token, token), isNull(projectShares.revokedAt)))
    .limit(1);

  const usable = row && (await getWorkspaceAccess(row.share.workspaceId)).allowed;
  if (!row || !usable) {
    return (
      <LightTheme>
        <BrandBackdrop
          band={
            <div className="flex items-center justify-between gap-3">
              <Logo onDark className="text-white" />
              <LanguageSwitcher className="text-white hover:bg-white/15 hover:text-white" />
            </div>
          }
        >
          <div className="mx-auto max-w-md">
            <EmptyState icon={Link2Off} title={t("This link isn't active")} className="border-solid shadow-xl shadow-primary/5">
              {t("It may have been turned off or replaced. Ask the person who shared it for a new link.")}
            </EmptyState>
          </div>
        </BrandBackdrop>
      </LightTheme>
    );
  }

  const { project, share } = row;
  // Record the visit at most once a minute.
  await db
    .update(projectShares)
    .set({ lastViewedAt: new Date() })
    .where(
      and(
        eq(projectShares.id, share.id),
        or(isNull(projectShares.lastViewedAt), lt(projectShares.lastViewedAt, oneMinuteAgo())),
      ),
    );

  const [board, usages, expenses, advances] = await Promise.all([
    getBoard(project.id),
    share.showBudget ? getProjectResources(project.id) : [],
    share.showBudget ? getProjectExpenses(project.id) : [],
    share.showBudget ? getProjectAdvances(project.workspaceId, project.id) : [],
  ]);
  const today = todayISO();
  const statusById = new Map(board.statuses.map((s) => [s.id, s]));
  const tasks = board.tasks.map((task) => ({ ...task, status: statusById.get(task.statusId) }));
  const a = computeAccomplishment(
    tasks.map((task) => ({ ...task, cancelled: task.status?.category === "canceled" })),
    project,
    today,
  );
  const money = share.showBudget ? computeBudget(project.budget, usages, expenses, [], advances) : null;
  const statusLabel = PROJECT_STATUSES.find((s) => s.value === project.status)?.label;

  return (
    <LightTheme>
      <BrandBackdrop
        band={
          <div className="grid gap-6">
            <div className="flex items-center justify-between gap-3">
              <Logo onDark className="text-white" />
              <LanguageSwitcher className="text-white hover:bg-white/15 hover:text-white" />
            </div>
            <div>
              <p className="text-xs font-medium text-white/80">
                {row.workspaceName} · {t("shared project · read-only")}
              </p>
              <h1 className="mt-1 text-3xl font-bold tracking-tight">{project.name}</h1>
              <div className="mt-3 flex flex-wrap gap-2 text-xs text-white/90">
                {statusLabel && <span className="flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1 ring-1 ring-white/15">{t(statusLabel)}</span>}
                {project.client && (
                  <span className="flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1 ring-1 ring-white/15">
                    <Building2 className="size-3.5" aria-hidden /> {project.client}
                  </span>
                )}
                {(project.startDate || project.endDate) && (
                  <span className="flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1 ring-1 ring-white/15 tabular-nums">
                    <Calendar className="size-3.5" aria-hidden />{" "}
                    {t("{start} → {end}", { start: formatDate(project.startDate, t.intl), end: formatDate(project.endDate, t.intl) })}
                  </span>
                )}
              </div>
            </div>
          </div>
        }
      >
        <div className="grid gap-6">
          <section aria-labelledby="progress-heading" className="rounded-2xl border bg-card p-5 shadow-xl shadow-primary/5 sm:p-6">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 id="progress-heading" className="text-sm font-medium text-muted-foreground">
                  {t("Progress")}
                </h2>
                <p className="mt-1 text-5xl font-bold tracking-tight tabular-nums">{fmtPct(a.actual)}</p>
              </div>
              <ScheduleBadge state={a.schedule} className="text-sm" />
            </div>
            <AccomplishmentMeter actual={a.actual} planned={a.planned} size="lg" label={t("Project progress")} className="mt-5" />
            {a.planned !== null && (
              <p className="mt-2 text-sm text-muted-foreground">
                {t("Planned by today: {pct} · as of {date}", { pct: fmtPct(a.planned), date: formatDate(today, t.intl) })}
              </p>
            )}
          </section>

          <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatTile icon={Gauge} label={t("Planned by today")} value={fmtPct(a.planned)} hint={formatDate(today, t.intl)} />
            <StatTile icon={ListChecks} label={t("Work items")} value={tasks.length} />
            {money ? (
              <>
                <StatTile icon={Wallet} label={t("Spent")} value={formatMoney(money.actual, project.currency, t.intl)} tone={money.overBudget ? "bad" : "default"} hint={money.budget === null ? undefined : `${t("Budget")}: ${formatMoney(money.budget, project.currency, t.intl)}`} />
                <StatTile icon={Wallet} label={t("Remaining")} value={money.remaining === null ? "—" : formatMoney(money.remaining, project.currency, t.intl)} tone={money.overBudget ? "bad" : "good"} />
              </>
            ) : (
              <StatTile icon={CalendarClock} label={t("Dates")} value={formatDate(project.endDate, t.intl)} hint={t("{start} → {end}", { start: formatDate(project.startDate, t.intl), end: formatDate(project.endDate, t.intl) })} />
            )}
          </dl>

          <Panel id="tasks-heading" title={t("Work items")} icon={ListChecks} count={tasks.length}>
          {tasks.length === 0 ? (
            <p className="border-t px-5 py-10 text-center text-sm text-muted-foreground">{t("No work items yet.")}</p>
          ) : (
            <div className="relative overflow-x-auto border-t">
              <table className="w-full min-w-[620px] text-sm">
                <thead className="text-start text-xs text-muted-foreground">
                  <tr className="border-b bg-muted/40">
                    <th scope="col" className="py-2 pe-3 ps-5 font-medium">{t("Item")}</th>
                    <th scope="col" className="px-3 py-2 font-medium">{t("Status")}</th>
                    <th scope="col" className="w-40 px-3 py-2 font-medium">{t("Progress")}</th>
                    <th scope="col" className="py-2 pe-5 ps-3 font-medium">{t("Dates")}</th>
                  </tr>
                </thead>
                <tbody>
                  {tasks.map((task) => {
                    const done = task.status?.category === "done" || task.status?.category === "canceled";
                    const late = !done && task.dueDate !== null && task.dueDate < today;
                    return (
                      <tr key={task.id} className="border-b transition-colors last:border-b-0 hover:bg-muted/40">
                        <td className="py-3 pe-3 ps-5 font-medium">{task.title}</td>
                        <td className="px-3 py-3 whitespace-nowrap">{task.status ? t(task.status.name) : null}</td>
                        <td className="px-3 py-3">
                          <div className="flex items-center gap-2">
                            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-primary/15">
                              <div className="h-full rounded-full bg-primary" style={{ width: `${task.progress}%` }} />
                            </div>
                            <span className="w-9 text-end text-xs tabular-nums">{task.progress}%</span>
                          </div>
                        </td>
                        <td className="py-3 pe-5 ps-3 whitespace-nowrap tabular-nums">
                          {task.startDate || task.dueDate
                            ? t("{start} → {end}", { start: formatDate(task.startDate, t.intl), end: formatDate(task.dueDate, t.intl) })
                            : "—"}
                          {late && (
                            <span className="ms-2 inline-flex items-center gap-1 text-xs font-medium text-destructive">
                              <AlertTriangle className="size-3" aria-hidden /> {t("Late")}
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          </Panel>

          <footer className="text-center text-xs text-muted-foreground">{t("Shared with Tamm · updates automatically")}</footer>
        </div>
      </BrandBackdrop>
    </LightTheme>
  );
}
