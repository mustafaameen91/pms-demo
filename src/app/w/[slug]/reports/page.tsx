import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronRight, FileBarChart } from "lucide-react";
import { requireWorkspace } from "@/lib/auth/session";
import { listReports } from "@/lib/data/reports";
import { reportFor } from "@/lib/weekly-report-server";
import { headline } from "@/lib/weekly-report";
import { isWorkspaceAdmin } from "@/lib/permissions";
import { listProjects } from "@/lib/data/projects";
import { cn, formatDate } from "@/lib/utils";
import { getT } from "@/i18n/server";

export async function generateMetadata() {
  const t = await getT();
  return { title: t("Weekly reports") };
}

export default async function ReportsPage({ params }: PageProps<"/w/[slug]/reports">) {
  const { slug } = await params;
  const { user, workspace } = await requireWorkspace(slug);
  const t = await getT();
  const admin = isWorkspaceAdmin(workspace.role);
  if (!admin && !(await listProjects(workspace.id)).some((p) => p.leadId === user.id)) notFound();
  const reports = (await listReports(workspace.id))
    .map((r) => ({ ...r, mine: reportFor(r.data, user.id, admin) }))
    .filter((r) => r.mine.length > 0);
  const base = `/w/${workspace.slug}`;

  return (
    <div className="grid w-full grid-cols-1 gap-6 px-4 py-6 sm:px-6 lg:py-8">
      <header>
        <h1 className="flex items-center gap-2 text-xl font-semibold tracking-tight">
          <FileBarChart className="size-5 text-primary" aria-hidden />
          {t("Weekly reports")}
        </h1>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
          {t("Every Saturday, a summary of last week for the projects you manage: progress, money, late tasks and risks. It also arrives in your inbox.")}
        </p>
      </header>
      <section aria-labelledby="reports-heading" className="rounded-xl border bg-card">
        <h2 id="reports-heading" className="sr-only">
          {t("Weekly reports")}
        </h2>
        {reports.length === 0 ? (
          <p className="px-4 py-10 text-center text-sm text-muted-foreground">
            {t("No reports yet. The first one is made after the first full week (Saturday to Friday).")}
          </p>
        ) : (
          <ul className="divide-y">
            {reports.map((r) => {
              const h = headline(r.mine);
              const alerts = h.behind + h.overBudget + h.headingOver;
              return (
                <li key={r.weekStart}>
                  <Link href={`${base}/reports/${r.weekStart}`} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3 text-sm hover:bg-accent/40">
                    <span className="min-w-56 font-medium">
                      {formatDate(r.data.start, t.intl)} – {formatDate(r.data.end, t.intl)}
                    </span>
                    <span className="text-muted-foreground">{t.plural(h.projects, "{count} project", "{count} projects")}</span>
                    <span className={cn(alerts ? "font-medium text-destructive" : "text-muted-foreground")}>
                      {alerts ? t("{behind} behind · {over} over budget · {heading} heading over", { behind: h.behind, over: h.overBudget, heading: h.headingOver }) : t("Nothing needs attention")}
                    </span>
                    <span className="text-muted-foreground">{t.plural(h.done, "{count} task finished", "{count} tasks finished")}</span>
                    <ChevronRight className="ms-auto size-4 text-muted-foreground rtl:-scale-x-100" aria-hidden />
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
