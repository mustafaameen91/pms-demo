import Link from "next/link";
import { notFound } from "next/navigation";
import { requireWorkspace } from "@/lib/auth/session";
import { getProjectReport } from "@/lib/data/report";
import { EXPENSE_CATEGORIES, PROJECT_STATUSES, resourceTypeInfo } from "@/lib/constants";
import { formatDate, formatMoney } from "@/lib/utils";
import { fmtPct } from "@/components/projects/accomplishment";
import { PrintButton } from "./print-button";
import { LightTheme } from "@/components/light-theme";

export async function generateMetadata({ params }: PageProps<"/print/[slug]/[key]">) {
  const { key } = await params;
  return { title: `Report · ${key.toUpperCase()}` };
}

const SCHEDULE = { ahead: "Ahead of plan", on_track: "On track", behind: "Behind plan" } as const;

/** Print-friendly project report. The browser's "Save as PDF" turns it into a PDF. */
export default async function ProjectReportPage({ params }: PageProps<"/print/[slug]/[key]">) {
  const { slug, key } = await params;
  const { workspace } = await requireWorkspace(slug);
  const report = await getProjectReport(workspace.id, key);
  if (!report) notFound();
  const { project, accomplishment: a, budget } = report;
  const money = (v: number | string | null) => (v === null ? "—" : formatMoney(v, project.currency));
  const backHref = `/w/${workspace.slug}/p/${project.key}/overview`;

  return (
    <LightTheme>
    <main className="mx-auto w-full max-w-4xl px-6 py-8 text-sm print:max-w-none print:px-0 print:py-0">
      <style>{`@page { size: A4; margin: 14mm; }`}</style>

      <div className="mb-6 flex items-center justify-between gap-4 print:hidden">
        <Link href={backHref} className="text-sm text-primary underline-offset-4 hover:underline">
          ← Back to project
        </Link>
        <PrintButton />
      </div>

      <header className="border-b pb-4">
        <p className="text-xs text-muted-foreground">
          {workspace.name} · Project report · {formatDate(report.today)}
        </p>
        <h1 className="mt-1 text-2xl font-semibold">
          {project.name} <span className="font-mono text-base font-normal text-muted-foreground">{project.key}</span>
        </h1>
        <p className="mt-1 text-muted-foreground">
          {[
            PROJECT_STATUSES.find((s) => s.value === project.status)?.label,
            project.client && `Client: ${project.client}`,
            (project.startDate || project.endDate) && `${formatDate(project.startDate)} → ${formatDate(project.endDate)}`,
            project.leadName && `Manager: ${project.leadName}`,
          ]
            .filter(Boolean)
            .join(" · ")}
        </p>
      </header>

      <section className="mt-5 grid grid-cols-4 gap-3 break-inside-avoid">
        {[
          { label: "Accomplishment", value: fmtPct(a.actual), sub: a.planned === null ? "No schedule" : `Planned ${fmtPct(a.planned)}` },
          { label: "Schedule", value: a.schedule ? SCHEDULE[a.schedule] : "—", sub: a.variance === null ? "" : `${a.variance > 0 ? "+" : ""}${fmtPct(a.variance)} vs plan` },
          { label: "Spent", value: money(budget.actual), sub: budget.budget === null ? "No budget" : `of ${money(budget.budget)}${budget.usedPct !== null ? ` (${budget.usedPct}%)` : ""}` },
          { label: "Remaining", value: money(budget.remaining), sub: budget.overBudget ? "Over budget" : `Owed ${money(budget.owedToResources)}` },
        ].map((k) => (
          <div key={k.label} className="rounded-lg border p-3">
            <p className="text-xs text-muted-foreground">{k.label}</p>
            <p className="mt-0.5 text-lg font-semibold">{k.value}</p>
            <p className="text-xs text-muted-foreground">{k.sub}</p>
          </div>
        ))}
      </section>

      {report.late.length > 0 && (
        <p className="mt-4 rounded-lg border border-destructive/40 px-3 py-2 text-destructive">
          Late tasks ({report.late.length}): {report.late.map((t) => `${project.key}-${t.number} ${t.title}`).join(", ")}
        </p>
      )}

      <ReportTable
        title="Tasks"
        head={["ID", "Task", "Status", "Weight", "Progress", "Start", "End", "Budget", "Spent"]}
        right={[3, 4, 7, 8]}
        rows={report.tasks.map((t) => [
          `${project.key}-${t.number}`,
          t.title,
          t.statusName,
          t.weight ? `${Number(t.weight)}%` : "—",
          `${t.progress}%`,
          formatDate(t.startDate),
          formatDate(t.dueDate),
          money(t.budget),
          money(t.spent),
        ])}
        empty="No tasks."
      />

      <ReportTable
        title="Resources"
        head={["Resource", "Type", "Used / planned", "Price", "Planned cost", "Used cost", "Owed"]}
        right={[3, 4, 5, 6]}
        rows={report.usages.map((u) => {
          const p = budget.resources.find((r) => r.usageId === u.id);
          return [
            u.role ? `${u.name} (${u.role})` : u.name,
            resourceTypeInfo(u.type).label,
            `${Number(u.usedQty)} / ${Number(u.plannedQty)} ${u.unit}`,
            `${money(u.unitCost)} / ${u.unit}`,
            money(Number(u.plannedQty) * Number(u.unitCost)),
            money(p?.usedCost ?? 0),
            money(p?.owed ?? 0),
          ];
        })}
        empty="No resources."
      />

      <ReportTable
        title="Expenses & payments"
        head={["Date", "Description", "Category", "Task", "Amount"]}
        right={[4]}
        rows={report.expenses.map((e) => [
          formatDate(e.date),
          e.projectResourceId ? `${e.description} (payment · ${e.resourceName ?? "resource"})` : e.description,
          EXPENSE_CATEGORIES.find((c) => c.value === e.category)?.label ?? e.category,
          e.taskNumber && !e.taskDeleted ? `${project.key}-${e.taskNumber}` : "—",
          money(e.amount),
        ])}
        empty="No expenses."
      />

      <p className="mt-6 text-xs text-muted-foreground">
        Spent = used resource costs + expenses not linked to a resource. Payments to resources reduce what is owed and are
        not counted twice.
      </p>
    </main>
    </LightTheme>
  );
}

function ReportTable({
  title,
  head,
  rows,
  right,
  empty,
}: {
  title: string;
  head: string[];
  rows: string[][];
  right: number[];
  empty: string;
}) {
  return (
    <section className="mt-6">
      <h2 className="mb-2 text-base font-semibold">{title}</h2>
      {rows.length === 0 ? (
        <p className="text-muted-foreground">{empty}</p>
      ) : (
        <table className="w-full border-collapse text-xs">
          <thead>
            <tr className="border-b-2 text-left">
              {head.map((h, i) => (
                <th key={h} scope="col" className={`px-1.5 py-1.5 font-semibold ${right.includes(i) ? "text-right" : ""}`}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, ri) => (
              <tr key={ri} className="break-inside-avoid border-b">
                {r.map((c, ci) => (
                  <td key={ci} className={`px-1.5 py-1.5 align-top ${right.includes(ci) ? "text-right tabular-nums whitespace-nowrap" : ""}`}>
                    {c}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
