import Link from "next/link";
import { AlertTriangle, CalendarClock, FolderKanban, TrendingDown, TrendingUp, Wallet } from "lucide-react";
import { computeForecast } from "@/lib/forecast";
import { requireWorkspace } from "@/lib/auth/session";
import { getWorkspaceAccomplishmentTasks, listProjects } from "@/lib/data/projects";
import { getWorkspaceUsages } from "@/lib/data/resources";
import { getWorkspaceExpenses } from "@/lib/data/expenses";
import { getWorkspaceAdvances } from "@/lib/data/loans";
import { computeAccomplishment, todayISO } from "@/lib/accomplishment";
import { computeBudget } from "@/lib/budget";
import { daysBetween, lateTasks } from "@/lib/schedule";
import { cn, formatDate, formatMoney } from "@/lib/utils";
import { AccomplishmentMeter, ScheduleBadge, fmtPct } from "@/components/projects/accomplishment";
import { ProjectStatusBadge } from "@/components/projects/project-status-badge";
import { getT } from "@/i18n/server";
import { visibleProjectIds } from "@/lib/data/project-access";

export async function generateMetadata() {
  const t = await getT();
  return { title: t("Dashboard") };
}

export default async function DashboardPage({ params }: PageProps<"/w/[slug]/dashboard">) {
  const { slug } = await params;
  const { user, workspace } = await requireWorkspace(slug);
  const t = await getT();
  const [projects, tasksByProject, usagesByProject, expensesByProject, advancesByProject] = await Promise.all([
    listProjects(workspace.id, { only: await visibleProjectIds(workspace.id, user.id, workspace.role) }),
    getWorkspaceAccomplishmentTasks(workspace.id),
    getWorkspaceUsages(workspace.id),
    getWorkspaceExpenses(workspace.id),
    getWorkspaceAdvances(workspace.id),
  ]);
  const today = todayISO();

  const rows = projects
    .map((p) => {
      const tasks = tasksByProject.get(p.id) ?? [];
      const accomplishment = computeAccomplishment(tasks, p, today);
      const money = computeBudget(p.budget, usagesByProject.get(p.id) ?? [], expensesByProject.get(p.id) ?? [], [], advancesByProject.get(p.id) ?? []);
      const forecast = computeForecast({ budget: money.budget, spent: money.actual, donePct: accomplishment.actual, plannedPct: accomplishment.planned });
      // Not over yet, but on course to be (an early guess doesn't count).
      const headingOver = !money.overBudget && forecast.ready && !forecast.early && (forecast.health === "watch" || forecast.health === "bad");
      const late = lateTasks(tasks, today).length;
      const finished = p.status === "completed" || p.status === "cancelled";
      const daysLeft = p.endDate ? daysBetween(today, p.endDate) : null;
      const overdue = !finished && daysLeft !== null && daysLeft < 0;
      // Higher = needs attention sooner.
      const attention =
        (money.overBudget ? 4 : 0) +
        (accomplishment.schedule === "behind" ? 3 : 0) +
        (headingOver && forecast.ready && forecast.health === "bad" ? 2 : 0) +
        (overdue ? 2 : 0) +
        (late > 0 ? 1 : 0);
      return { p, accomplishment, money, forecast, headingOver, late, daysLeft, overdue, finished, attention };
    })
    .sort(
      (a, b) =>
        Number(a.finished) - Number(b.finished) ||
        b.attention - a.attention ||
        (a.p.endDate ?? "9999").localeCompare(b.p.endDate ?? "9999"),
    );

  const open = rows.filter((r) => !r.finished);
  const behind = open.filter((r) => r.accomplishment.schedule === "behind").length;
  const overBudget = open.filter((r) => r.money.overBudget).length;
  const headingOver = open.filter((r) => r.headingOver).length;
  const lateTotal = open.reduce((s, r) => s + r.late, 0);

  // Money can't be added across currencies, so totals are per currency.
  const totals = new Map<string, { budget: number; spent: number }>();
  for (const r of open) {
    const sum = totals.get(r.p.currency) ?? { budget: 0, spent: 0 };
    sum.budget += r.money.budget ?? 0;
    sum.spent += r.money.actual;
    totals.set(r.p.currency, sum);
  }

  const base = `/w/${workspace.slug}`;
  const kpis = [
    { label: t("Open projects"), value: open.length, icon: FolderKanban, tone: "default", hint: t("{count} in total", { count: rows.length }) },
    { label: t("Behind schedule"), value: behind, icon: TrendingDown, tone: behind ? "bad" : "default", hint: t("Done less than planned") },
    {
      label: t("Over budget"),
      value: overBudget,
      icon: AlertTriangle,
      tone: overBudget ? "bad" : "default",
      hint: headingOver
        ? t.plural(headingOver, "Spent more than budget · {count} more heading over", "Spent more than budget · {count} more heading over")
        : t("Spent more than budget"),
    },
    { label: t("Late tasks"), value: lateTotal, icon: CalendarClock, tone: lateTotal ? "bad" : "default", hint: t("Past their end date") },
  ] as const;

  return (
    <div className="grid w-full grid-cols-1 gap-6 px-4 py-6 sm:px-6 lg:py-8">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">{t("Dashboard")}</h1>
        <p className="text-sm text-muted-foreground">
          {t("All projects in {workspace} as of {date}.", { workspace: workspace.name, date: formatDate(today, t.intl) })}
        </p>
      </div>

      <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {kpis.map((k) => (
          <div key={k.label} className="rounded-xl border bg-card p-4">
            <dt className="flex items-center gap-2 text-sm text-muted-foreground">
              <k.icon className={cn("size-4", k.tone === "bad" && "text-destructive")} aria-hidden />
              {k.label}
            </dt>
            <dd className={cn("mt-1 text-3xl font-semibold", k.tone === "bad" && "text-destructive")}>{k.value}</dd>
            <p className="mt-0.5 text-xs text-muted-foreground">{k.hint}</p>
          </div>
        ))}
      </dl>

      {totals.size > 0 && (
        <section aria-labelledby="totals-heading" className="rounded-xl border bg-card p-5">
          <h2 id="totals-heading" className="flex items-center gap-2 font-semibold">
            <Wallet className="size-4 text-muted-foreground" aria-hidden />
            {t("Money across open projects")}
          </h2>
          <ul className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
            {[...totals].map(([currency, sum]) => {
              const pct = sum.budget > 0 ? Math.round((sum.spent / sum.budget) * 1000) / 10 : null;
              const over = sum.budget > 0 && sum.spent > sum.budget;
              return (
                <li key={currency} className="rounded-lg border p-3">
                  <p className="text-xs text-muted-foreground">{currency}</p>
                  <p className="mt-0.5 text-sm">
                    <span className={cn("font-semibold", over && "text-destructive")}>{formatMoney(sum.spent, currency, t.intl)}</span>
                    <span className="text-muted-foreground"> {t("spent of {amount}", { amount: formatMoney(sum.budget, currency, t.intl) })}</span>
                  </p>
                  {pct !== null && (
                    <div
                      role="meter"
                      aria-label={t("{currency} budget used", { currency })}
                      aria-valuenow={pct}
                      aria-valuemin={0}
                      aria-valuemax={100}
                      className={cn("mt-2 h-1.5 overflow-hidden rounded-full", over ? "bg-destructive/15" : "bg-primary/15")}
                    >
                      <div className={cn("h-full rounded-full", over ? "bg-destructive" : "bg-primary")} style={{ width: `${Math.min(100, pct)}%` }} />
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      )}

      <section aria-labelledby="projects-heading" className="overflow-hidden rounded-xl border bg-card">
        <div className="flex items-center justify-between border-b px-4 py-3">
          <h2 id="projects-heading" className="font-semibold">
            {t("Projects")}
          </h2>
          <p className="text-xs text-muted-foreground">{t("Projects that need attention are listed first")}</p>
        </div>
        {rows.length === 0 ? (
          <p className="px-4 py-10 text-center text-sm text-muted-foreground">
            {t("No projects yet.")}{" "}
            <Link href={base} className="font-medium text-primary underline-offset-4 hover:underline">
              {t("Create one")}
            </Link>
            .
          </p>
        ) : (
          <div className="relative overflow-x-auto">
            <table className="w-full min-w-[980px] text-sm">
              <thead className="text-start text-xs text-muted-foreground">
                <tr className="border-b bg-muted/40">
                  <th scope="col" className="py-2 pe-3 ps-4 font-medium">{t("Project")}</th>
                  <th scope="col" className="px-3 py-2 font-medium">{t("Status")}</th>
                  <th scope="col" className="w-56 px-3 py-2 font-medium">{t("Accomplishment")}</th>
                  <th scope="col" className="w-48 px-3 py-2 font-medium">{t("Spent / budget")}</th>
                  <th scope="col" className="px-3 py-2 font-medium">{t("End date")}</th>
                  <th scope="col" className="py-2 pe-4 ps-3 text-end font-medium">{t("Late tasks")}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(({ p, accomplishment: a, money, forecast, headingOver, late, daysLeft, overdue, finished }) => (
                  <tr key={p.id} className={cn("border-b last:border-b-0", finished && "text-muted-foreground")}>
                    <td className="py-3 pe-3 ps-4">
                      <Link href={`${base}/p/${p.key}/overview`} className="flex items-center gap-2 font-medium hover:underline">
                        <span aria-hidden className="size-2.5 shrink-0 rounded-sm" style={{ backgroundColor: p.color }} />
                        {p.name}
                        <span className="font-mono text-xs font-normal text-muted-foreground">{p.key}</span>
                      </Link>
                      {p.client && <p className="ps-4.5 text-xs text-muted-foreground">{p.client}</p>}
                    </td>
                    <td className="px-3 py-3">
                      <ProjectStatusBadge status={p.status} />
                    </td>
                    <td className="px-3 py-3">
                      {a.mode === "empty" ? (
                        <span className="text-xs text-muted-foreground">{t("No tasks yet")}</span>
                      ) : (
                        <div className="grid gap-1">
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-medium tabular-nums">{fmtPct(a.actual)}</span>
                            {!finished && <ScheduleBadge state={a.schedule} short />}
                          </div>
                          <AccomplishmentMeter actual={a.actual} planned={finished ? null : a.planned} size="sm" label={t("{name} accomplishment", { name: p.name })} />
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-3">
                      <p className={cn("tabular-nums", money.overBudget && "font-medium text-destructive")}>
                        {formatMoney(money.actual, p.currency, t.intl)}
                        <span className="text-muted-foreground">
                          {" "}
                          / {money.budget === null ? t("no budget") : formatMoney(money.budget, p.currency, t.intl)}
                        </span>
                      </p>
                      {money.overBudget && (
                        <p className="flex items-center gap-1 text-xs text-destructive">
                          <AlertTriangle className="size-3" aria-hidden />
                          {t("Over budget")}
                        </p>
                      )}
                      {headingOver && forecast.ready ? (
                        <p
                          className={cn(
                            "flex items-center gap-1 text-xs",
                            forecast.health === "bad" ? "font-medium text-destructive" : "text-amber-700 dark:text-amber-400",
                          )}
                        >
                          <TrendingUp className="size-3" aria-hidden />
                          {t("Heading {pct}% over budget", { pct: String(forecast.overPct) })}
                        </p>
                      ) : (
                        !money.overBudget &&
                        money.usedPct !== null && (
                          <p className="text-xs text-muted-foreground">{t("{pct}% used", { pct: String(money.usedPct) })}</p>
                        )
                      )}
                    </td>
                    <td className="px-3 py-3 whitespace-nowrap">
                      <p className="tabular-nums">{formatDate(p.endDate, t.intl)}</p>
                      {!finished && daysLeft !== null && (
                        <p className={cn("text-xs", overdue ? "font-medium text-destructive" : "text-muted-foreground")}>
                          {overdue
                            ? t.plural(-daysLeft, "{count} days overdue", "{count} days overdue")
                            : daysLeft === 0
                              ? t("Ends today")
                              : t.plural(daysLeft, "{count} days left", "{count} days left")}
                        </p>
                      )}
                    </td>
                    <td className={cn("py-3 pe-4 ps-3 text-end font-medium tabular-nums", late > 0 && !finished && "text-destructive")}>
                      {late}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
