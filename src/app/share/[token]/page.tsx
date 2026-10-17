import type { Metadata } from "next";
import { and, eq, isNull, lt, or } from "drizzle-orm";
import { AlertTriangle, Building2, Calendar } from "lucide-react";
import { db } from "@/lib/db";
import { organization, projectShares, projects } from "@/lib/db/schema";
import { getBoard } from "@/lib/data/projects";
import { getProjectResources } from "@/lib/data/resources";
import { getProjectExpenses } from "@/lib/data/expenses";
import { computeAccomplishment, todayISO } from "@/lib/accomplishment";
import { computeBudget } from "@/lib/budget";
import { getWorkspaceAccess } from "@/lib/billing";
import { PROJECT_STATUSES } from "@/lib/constants";
import { cn, formatDate, formatMoney } from "@/lib/utils";
import { AccomplishmentMeter, ScheduleBadge, fmtPct } from "@/components/projects/accomplishment";
import { LightTheme } from "@/components/light-theme";
import { Logo } from "@/components/logo";

const oneMinuteAgo = () => new Date(Date.now() - 60_000);

// Secret links must never end up in search engines.
export const metadata: Metadata = { title: "Project progress", robots: { index: false, follow: false } };

/** Public, read-only client view of one project. Access = knowing the token. */
export default async function SharePage({ params }: PageProps<"/share/[token]">) {
  const { token } = await params;
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
      <LightTheme className="flex flex-col items-center justify-center px-4 text-center">
        <Logo />
        <h1 className="mt-6 text-xl font-semibold">This link isn&apos;t active</h1>
        <p className="mt-2 max-w-sm text-sm text-muted-foreground">
          It may have been turned off or replaced. Ask the person who shared it for a new link.
        </p>
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

  const [board, usages, expenses] = await Promise.all([
    getBoard(project.id),
    share.showBudget ? getProjectResources(project.id) : [],
    share.showBudget ? getProjectExpenses(project.id) : [],
  ]);
  const today = todayISO();
  const statusById = new Map(board.statuses.map((s) => [s.id, s]));
  const tasks = board.tasks.map((t) => ({ ...t, status: statusById.get(t.statusId) }));
  const a = computeAccomplishment(
    tasks.map((t) => ({ ...t, cancelled: t.status?.category === "canceled" })),
    project,
    today,
  );
  const money = share.showBudget ? computeBudget(project.budget, usages, expenses) : null;
  const statusLabel = PROJECT_STATUSES.find((s) => s.value === project.status)?.label;

  return (
    <LightTheme>
      <main className="mx-auto grid w-full max-w-4xl grid-cols-1 gap-6 px-4 py-8 sm:px-6">
        <header>
          <p className="text-xs text-muted-foreground">
            {row.workspaceName} · shared project · read-only
          </p>
          <h1 className="mt-1 text-2xl font-semibold">{project.name}</h1>
          <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-sm text-muted-foreground">
            {statusLabel && <span>{statusLabel}</span>}
            {project.client && (
              <span className="flex items-center gap-1.5">
                <Building2 className="size-4" aria-hidden /> {project.client}
              </span>
            )}
            {(project.startDate || project.endDate) && (
              <span className="flex items-center gap-1.5">
                <Calendar className="size-4" aria-hidden /> {formatDate(project.startDate)} → {formatDate(project.endDate)}
              </span>
            )}
          </div>
        </header>

        <section aria-labelledby="progress-heading" className="rounded-xl border p-5 sm:p-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 id="progress-heading" className="text-sm font-medium text-muted-foreground">
                Progress
              </h2>
              <p className="mt-1 text-5xl font-semibold tracking-tight">{fmtPct(a.actual)}</p>
            </div>
            <ScheduleBadge state={a.schedule} className="text-sm" />
          </div>
          <AccomplishmentMeter actual={a.actual} planned={a.planned} size="lg" label="Project progress" className="mt-5" />
          {a.planned !== null && (
            <p className="mt-2 text-sm text-muted-foreground">
              Planned by today: {fmtPct(a.planned)} · as of {formatDate(today)}
            </p>
          )}
        </section>

        {money && (
          <section aria-labelledby="budget-heading" className="rounded-xl border p-5 sm:p-6">
            <h2 id="budget-heading" className="font-semibold">
              Budget
            </h2>
            <dl className="mt-3 grid grid-cols-3 gap-3">
              <div>
                <dt className="text-xs text-muted-foreground">Budget</dt>
                <dd className="font-semibold">{money.budget === null ? "—" : formatMoney(money.budget, project.currency)}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Spent</dt>
                <dd className={cn("font-semibold", money.overBudget && "text-destructive")}>{formatMoney(money.actual, project.currency)}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Remaining</dt>
                <dd className="font-semibold">{money.remaining === null ? "—" : formatMoney(money.remaining, project.currency)}</dd>
              </div>
            </dl>
          </section>
        )}

        <section aria-labelledby="tasks-heading" className="overflow-hidden rounded-xl border">
          <h2 id="tasks-heading" className="border-b px-4 py-3 font-semibold">
            Work items
          </h2>
          {tasks.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-muted-foreground">No work items yet.</p>
          ) : (
            <div className="relative overflow-x-auto">
              <table className="w-full min-w-[620px] text-sm">
                <thead className="text-left text-xs text-muted-foreground">
                  <tr className="border-b bg-muted/60">
                    <th scope="col" className="py-2 pr-3 pl-4 font-medium">Item</th>
                    <th scope="col" className="px-3 py-2 font-medium">Status</th>
                    <th scope="col" className="w-40 px-3 py-2 font-medium">Progress</th>
                    <th scope="col" className="py-2 pr-4 pl-3 font-medium">Dates</th>
                  </tr>
                </thead>
                <tbody>
                  {tasks.map((t) => {
                    const done = t.status?.category === "done" || t.status?.category === "canceled";
                    const late = !done && t.dueDate !== null && t.dueDate < today;
                    return (
                      <tr key={t.id} className="border-b last:border-b-0">
                        <td className="py-2.5 pr-3 pl-4 font-medium">{t.title}</td>
                        <td className="px-3 py-2.5 whitespace-nowrap">{t.status?.name}</td>
                        <td className="px-3 py-2.5">
                          <div className="flex items-center gap-2">
                            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-primary/15">
                              <div className="h-full rounded-full bg-primary" style={{ width: `${t.progress}%` }} />
                            </div>
                            <span className="w-9 text-right text-xs tabular-nums">{t.progress}%</span>
                          </div>
                        </td>
                        <td className="py-2.5 pr-4 pl-3 whitespace-nowrap tabular-nums">
                          {t.startDate || t.dueDate ? `${formatDate(t.startDate)} → ${formatDate(t.dueDate)}` : "—"}
                          {late && (
                            <span className="ml-2 inline-flex items-center gap-1 text-xs font-medium text-destructive">
                              <AlertTriangle className="size-3" aria-hidden /> Late
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
        </section>

        <footer className="text-center text-xs text-muted-foreground">Shared with PMS · updates automatically</footer>
      </main>
    </LightTheme>
  );
}
