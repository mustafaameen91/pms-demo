import Link from "next/link";
import type { Metadata } from "next";
import { AlertTriangle, CalendarClock, FolderKanban, TrendingDown, Wallet } from "lucide-react";
import { requireWorkspace } from "@/lib/auth/session";
import { getWorkspaceAccomplishmentTasks, listProjects } from "@/lib/data/projects";
import { getWorkspaceUsages } from "@/lib/data/resources";
import { getWorkspaceExpenses } from "@/lib/data/expenses";
import { computeAccomplishment, todayISO } from "@/lib/accomplishment";
import { computeBudget } from "@/lib/budget";
import { daysBetween, lateTasks } from "@/lib/schedule";
import { cn, formatDate, formatMoney } from "@/lib/utils";
import { AccomplishmentMeter, ScheduleBadge, fmtPct } from "@/components/projects/accomplishment";
import { ProjectStatusBadge } from "@/components/projects/project-status-badge";

export const metadata: Metadata = { title: "Dashboard" };

export default async function DashboardPage({ params }: PageProps<"/w/[slug]/dashboard">) {
  const { slug } = await params;
  const { workspace } = await requireWorkspace(slug);
  const [projects, tasksByProject, usagesByProject, expensesByProject] = await Promise.all([
    listProjects(workspace.id),
    getWorkspaceAccomplishmentTasks(workspace.id),
    getWorkspaceUsages(workspace.id),
    getWorkspaceExpenses(workspace.id),
  ]);
  const today = todayISO();

  const rows = projects
    .map((p) => {
      const tasks = tasksByProject.get(p.id) ?? [];
      const accomplishment = computeAccomplishment(tasks, p, today);
      const money = computeBudget(p.budget, usagesByProject.get(p.id) ?? [], expensesByProject.get(p.id) ?? []);
      const late = lateTasks(tasks, today).length;
      const finished = p.status === "completed" || p.status === "cancelled";
      const daysLeft = p.endDate ? daysBetween(today, p.endDate) : null;
      const overdue = !finished && daysLeft !== null && daysLeft < 0;
      // Higher = needs attention sooner.
      const attention =
        (money.overBudget ? 4 : 0) + (accomplishment.schedule === "behind" ? 3 : 0) + (overdue ? 2 : 0) + (late > 0 ? 1 : 0);
      return { p, accomplishment, money, late, daysLeft, overdue, finished, attention };
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
  const lateTotal = open.reduce((s, r) => s + r.late, 0);

  // Money can't be added across currencies, so totals are per currency.
  const totals = new Map<string, { budget: number; spent: number }>();
  for (const r of open) {
    const t = totals.get(r.p.currency) ?? { budget: 0, spent: 0 };
    t.budget += r.money.budget ?? 0;
    t.spent += r.money.actual;
    totals.set(r.p.currency, t);
  }

  const base = `/w/${workspace.slug}`;
  const kpis = [
    { label: "Open projects", value: open.length, icon: FolderKanban, tone: "default", hint: `${rows.length} in total` },
    { label: "Behind schedule", value: behind, icon: TrendingDown, tone: behind ? "bad" : "default", hint: "Done less than planned" },
    { label: "Over budget", value: overBudget, icon: AlertTriangle, tone: overBudget ? "bad" : "default", hint: "Spent more than budget" },
    { label: "Late tasks", value: lateTotal, icon: CalendarClock, tone: lateTotal ? "bad" : "default", hint: "Past their end date" },
  ] as const;

  return (
    <div className="mx-auto grid w-full max-w-6xl grid-cols-1 gap-6 px-4 py-6 sm:px-6 lg:py-8">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Dashboard</h1>
        <p className="text-sm text-muted-foreground">All projects in {workspace.name} as of {formatDate(today)}.</p>
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
            Money across open projects
          </h2>
          <ul className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {[...totals].map(([currency, t]) => {
              const pct = t.budget > 0 ? Math.round((t.spent / t.budget) * 1000) / 10 : null;
              const over = t.budget > 0 && t.spent > t.budget;
              return (
                <li key={currency} className="rounded-lg border p-3">
                  <p className="text-xs text-muted-foreground">{currency}</p>
                  <p className="mt-0.5 text-sm">
                    <span className={cn("font-semibold", over && "text-destructive")}>{formatMoney(t.spent, currency)}</span>
                    <span className="text-muted-foreground"> spent of {formatMoney(t.budget, currency)}</span>
                  </p>
                  {pct !== null && (
                    <div
                      role="meter"
                      aria-label={`${currency} budget used`}
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
            Projects
          </h2>
          <p className="text-xs text-muted-foreground">Projects that need attention are listed first</p>
        </div>
        {rows.length === 0 ? (
          <p className="px-4 py-10 text-center text-sm text-muted-foreground">
            No projects yet.{" "}
            <Link href={base} className="font-medium text-primary underline-offset-4 hover:underline">
              Create one
            </Link>
            .
          </p>
        ) : (
          <div className="relative overflow-x-auto">
            <table className="w-full min-w-[980px] text-sm">
              <thead className="text-start text-xs text-muted-foreground">
                <tr className="border-b bg-muted/40">
                  <th scope="col" className="py-2 pe-3 ps-4 font-medium">Project</th>
                  <th scope="col" className="px-3 py-2 font-medium">Status</th>
                  <th scope="col" className="w-56 px-3 py-2 font-medium">Accomplishment</th>
                  <th scope="col" className="w-48 px-3 py-2 font-medium">Spent / budget</th>
                  <th scope="col" className="px-3 py-2 font-medium">End date</th>
                  <th scope="col" className="py-2 pe-4 ps-3 text-end font-medium">Late tasks</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(({ p, accomplishment: a, money, late, daysLeft, overdue, finished }) => (
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
                        <span className="text-xs text-muted-foreground">No tasks yet</span>
                      ) : (
                        <div className="grid gap-1">
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-medium tabular-nums">{fmtPct(a.actual)}</span>
                            {!finished && <ScheduleBadge state={a.schedule} short />}
                          </div>
                          <AccomplishmentMeter actual={a.actual} planned={finished ? null : a.planned} size="sm" label={`${p.name} accomplishment`} />
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-3">
                      <p className={cn("tabular-nums", money.overBudget && "font-medium text-destructive")}>
                        {formatMoney(money.actual, p.currency)}
                        <span className="text-muted-foreground"> / {money.budget === null ? "no budget" : formatMoney(money.budget, p.currency)}</span>
                      </p>
                      {money.overBudget && (
                        <p className="flex items-center gap-1 text-xs text-destructive">
                          <AlertTriangle className="size-3" aria-hidden />
                          Over budget
                        </p>
                      )}
                      {!money.overBudget && money.usedPct !== null && (
                        <p className="text-xs text-muted-foreground">{money.usedPct}% used</p>
                      )}
                    </td>
                    <td className="px-3 py-3 whitespace-nowrap">
                      <p className="tabular-nums">{formatDate(p.endDate)}</p>
                      {!finished && daysLeft !== null && (
                        <p className={cn("text-xs", overdue ? "font-medium text-destructive" : "text-muted-foreground")}>
                          {overdue ? `${-daysLeft} days overdue` : daysLeft === 0 ? "Ends today" : `${daysLeft} days left`}
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
