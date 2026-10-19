import Link from "next/link";
import { notFound } from "next/navigation";
import { requireWorkspace } from "@/lib/auth/session";
import { getProjectReport } from "@/lib/data/report";
import { EXPENSE_CATEGORIES, PROJECT_STATUSES, resourceTypeInfo } from "@/lib/constants";
import { formatDate, formatMoney } from "@/lib/utils";
import { fmtPct } from "@/components/projects/accomplishment";
import { PrintButton } from "./print-button";
import { LightTheme } from "@/components/light-theme";
import { getT } from "@/i18n/server";

/** Keeps a signed number together left-to-right inside Arabic text (−57.1%, not 57.1%−). */
const ltr = (text: string, locale: string) => (locale === "ar" ? `\u2066${text}\u2069` : text);

export async function generateMetadata({ params }: PageProps<"/print/[slug]/[key]">) {
  const { key } = await params;
  const t = await getT();
  return { title: t("Report · {key}", { key: key.toUpperCase() }) };
}

const SCHEDULE = { ahead: "Ahead of plan", on_track: "On track", behind: "Behind plan" } as const;

/** Print-friendly project report. The browser's "Save as PDF" turns it into a PDF. */
export default async function ProjectReportPage({ params }: PageProps<"/print/[slug]/[key]">) {
  const { slug, key } = await params;
  const t = await getT();
  const { workspace } = await requireWorkspace(slug);
  const report = await getProjectReport(workspace.id, key);
  if (!report) notFound();
  const { project, accomplishment: a, budget } = report;
  const money = (v: number | string | null) => (v === null ? "—" : formatMoney(v, project.currency, t.intl))
  const date = (d: string | null) => formatDate(d, t.intl);
  const projectStatus = PROJECT_STATUSES.find((s) => s.value === project.status)?.label;
  const backHref = `/w/${workspace.slug}/p/${project.key}/overview`;

  return (
    <LightTheme>
    <main className="mx-auto w-full max-w-4xl px-6 py-8 text-sm print:max-w-none print:px-0 print:py-0">
      <style>{`@page { size: A4; margin: 14mm; }`}</style>

      <div className="mb-6 flex items-center justify-between gap-4 print:hidden">
        <Link href={backHref} className="text-sm text-primary underline-offset-4 hover:underline">
          {t("← Back to project")}
        </Link>
        <PrintButton />
      </div>

      <header className="border-b pb-4">
        <p className="text-xs text-muted-foreground">
          {workspace.name} · {t("Project report")} · {date(report.today)}
        </p>
        <h1 className="mt-1 text-2xl font-semibold">
          {project.name} <span className="font-mono text-base font-normal text-muted-foreground">{project.key}</span>
        </h1>
        <p className="mt-1 text-muted-foreground">
          {[
            projectStatus && t(projectStatus),
            project.client && t("Client: {client}", { client: project.client }),
            (project.startDate || project.endDate) &&
              t("{start} → {end}", { start: date(project.startDate), end: date(project.endDate) }),
            project.leadName && t("Manager: {name}", { name: project.leadName }),
          ]
            .filter(Boolean)
            .join(" · ")}
        </p>
      </header>

      <section className="mt-5 grid grid-cols-4 gap-3 break-inside-avoid">
        {[
          {
            label: t("Accomplishment"),
            value: fmtPct(a.actual),
            sub: a.planned === null ? t("No schedule") : t("Planned {pct}", { pct: fmtPct(a.planned) }),
          },
          {
            label: t("Schedule"),
            value: a.schedule ? t(SCHEDULE[a.schedule]) : "—",
            sub: a.variance === null ? "" : t("{pct} vs plan", { pct: ltr(`${a.variance > 0 ? "+" : ""}${fmtPct(a.variance)}`, t.locale) }),
          },
          {
            label: t("Spent"),
            value: money(budget.actual),
            sub:
              budget.budget === null
                ? t("No budget")
                : budget.usedPct !== null
                  ? t("of {amount} ({pct}%)", { amount: money(budget.budget), pct: String(budget.usedPct) })
                  : t("of {amount}", { amount: money(budget.budget) }),
          },
          {
            label: t("Remaining"),
            value: money(budget.remaining),
            sub: budget.overBudget ? t("Over budget") : t("Owed {amount}", { amount: money(budget.owedToResources) }),
          },
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
          {t("Late tasks ({count}): {list}", {
            count: report.late.length,
            list: report.late.map((task) => `${project.key}-${task.number} ${task.title}`).join(t(", ")),
          })}
        </p>
      )}

      <ReportTable
        title={t("Tasks")}
        head={[t("ID"), t("Task"), t("Status"), t("Weight"), t("Progress"), t("Start"), t("End"), t("Budget"), t("Spent")]}
        right={[3, 4, 7, 8]}
        rows={report.tasks.map((task) => [
          `${project.key}-${task.number}`,
          task.title,
          t(task.statusName),
          task.weight ? `${Number(task.weight)}%` : "—",
          `${task.progress}%`,
          date(task.startDate),
          date(task.dueDate),
          money(task.budget),
          money(task.spent),
        ])}
        empty={t("No tasks.")}
      />

      <ReportTable
        title={t("Resources")}
        head={[t("Resource"), t("Type"), t("Used / planned"), t("Price"), t("Planned cost"), t("Used cost"), t("Owed")]}
        right={[3, 4, 5, 6]}
        rows={report.usages.map((u) => {
          const p = budget.resources.find((r) => r.usageId === u.id);
          return [
            u.role ? `${u.name} (${u.role})` : u.name,
            t(resourceTypeInfo(u.type).label),
            `${Number(u.usedQty)} / ${Number(u.plannedQty)} ${u.unit}`,
            `${money(u.unitCost)} / ${u.unit}`,
            money(Number(u.plannedQty) * Number(u.unitCost)),
            money(p?.usedCost ?? 0),
            money(p?.owed ?? 0),
          ];
        })}
        empty={t("No resources.")}
      />

      <ReportTable
        title={t("Expenses & payments")}
        head={[t("Date"), t("Description"), t("Category"), t("Task"), t("Amount")]}
        right={[4]}
        rows={report.expenses.map((e) => [
          date(e.date),
          (e.projectResourceId
            ? t("{description} (payment · {resource})", { description: e.description, resource: e.resourceName ?? t("resource") })
            : e.description) +
            (e.approvalStatus === "pending"
              ? t(" — waiting for approval, not counted")
              : e.approvalStatus === "rejected"
                ? t(" — rejected, not counted")
                : ""),
          t(EXPENSE_CATEGORIES.find((c) => c.value === e.category)?.label ?? e.category),
          e.taskNumber && !e.taskDeleted ? `${project.key}-${e.taskNumber}` : "—",
          money(e.amount),
        ])}
        empty={t("No expenses.")}
      />

      <p className="mt-6 text-xs text-muted-foreground">
        {t(
          "Spent = used resource costs + expenses not linked to a resource. Payments to resources reduce what is owed and are not counted twice.",
        )}
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
            <tr className="border-b-2 text-start">
              {head.map((h, i) => (
                <th key={h} scope="col" className={`px-1.5 py-1.5 font-semibold ${right.includes(i) ? "text-end" : ""}`}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, ri) => (
              <tr key={ri} className="break-inside-avoid border-b">
                {r.map((c, ci) => (
                  <td key={ci} className={`px-1.5 py-1.5 align-top ${right.includes(ci) ? "text-end tabular-nums whitespace-nowrap" : ""}`}>
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
