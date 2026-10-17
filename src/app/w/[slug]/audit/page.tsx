import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Download } from "lucide-react";
import { requireWorkspace } from "@/lib/auth/session";
import { listAuditEntries } from "@/lib/data/audit";
import { listWorkspaceMembers } from "@/lib/data/members";
import { ACTIVITY_GROUPS, activityGroup, describeActivity, type ActivityGroup } from "@/lib/activity-text";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = { title: "Audit log" };
const PAGE = 100;

export default async function AuditPage({ params, searchParams }: PageProps<"/w/[slug]/audit">) {
  const [{ slug }, query] = await Promise.all([params, searchParams]);
  const { workspace } = await requireWorkspace(slug);
  if (workspace.role !== "owner" && workspace.role !== "admin") notFound();

  const group = (Object.keys(ACTIVITY_GROUPS) as ActivityGroup[]).find((g) => g === query.group);
  const actorId = typeof query.actor === "string" && query.actor ? query.actor : undefined;
  const before = typeof query.before === "string" && !Number.isNaN(Date.parse(query.before)) ? new Date(query.before) : undefined;
  const [entries, members] = await Promise.all([
    listAuditEntries(workspace.id, { group, actorId, before, limit: PAGE }),
    listWorkspaceMembers(workspace.id),
  ]);
  const base = `/w/${workspace.slug}/audit`;
  const qs = (patch: Record<string, string | undefined>) => {
    const p = new URLSearchParams();
    const merged = { group, actor: actorId, ...patch };
    for (const [k, v] of Object.entries(merged)) if (v) p.set(k, v);
    return p.size ? `?${p}` : "";
  };

  return (
    <div className="mx-auto grid w-full max-w-4xl grid-cols-1 gap-5 px-4 py-6 sm:px-6 lg:py-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Audit log</h1>
          <p className="text-sm text-muted-foreground">Everything that changed in {workspace.name}, newest first.</p>
        </div>
        <Button variant="outline" size="sm" asChild>
          <a href={`${base}/export${qs({})}`} download>
            <Download className="size-4" />
            Download CSV
          </a>
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <nav aria-label="Filter by area" className="flex flex-wrap gap-1 rounded-lg bg-muted p-0.5">
          {[{ key: undefined, label: "All" }, ...Object.entries(ACTIVITY_GROUPS).map(([key, label]) => ({ key, label }))].map((g) => (
            <Link
              key={g.label}
              href={`${base}${qs({ group: g.key, before: undefined })}`}
              aria-current={group === g.key ? "page" : undefined}
              className={cn(
                "flex h-7 items-center rounded-md px-3 text-sm text-muted-foreground hover:text-foreground",
                group === g.key && "bg-background font-medium text-foreground shadow-sm",
              )}
            >
              {g.label}
            </Link>
          ))}
        </nav>
        <form className="flex items-center gap-2" action={base}>
          {group && <input type="hidden" name="group" value={group} />}
          <label htmlFor="audit-actor" className="text-sm text-muted-foreground">
            Person
          </label>
          <select id="audit-actor" name="actor" defaultValue={actorId ?? ""} className="h-8 rounded-lg border border-input bg-transparent px-2 text-sm dark:bg-input/30">
            <option value="">Everyone</option>
            {members.map((m) => (
              <option key={m.userId} value={m.userId}>
                {m.name}
              </option>
            ))}
          </select>
          <Button type="submit" size="sm" variant="outline">
            Apply
          </Button>
        </form>
      </div>

      {entries.length === 0 ? (
        <p className="rounded-xl border border-dashed px-6 py-12 text-center text-sm text-muted-foreground">Nothing recorded for this filter.</p>
      ) : (
        <ol className="divide-y overflow-hidden rounded-xl border bg-card">
          {entries.map((e) => {
            const taskRef = e.projectKey && e.taskNumber ? `${e.projectKey}-${e.taskNumber}` : null;
            const when = new Date(e.createdAt);
            return (
              <li key={e.id} className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 px-4 py-2.5 text-sm">
                <time dateTime={when.toISOString()} className="w-36 shrink-0 text-xs text-muted-foreground tabular-nums" suppressHydrationWarning>
                  {when.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}
                </time>
                <p className="min-w-0 flex-1">
                  <span className="font-medium">{e.actorName ?? "System"}</span> {describeActivity(e.type, e.data, taskRef)}
                  {e.projectName && (
                    <Link href={`/w/${workspace.slug}/p/${e.projectKey}/overview`} className="ml-1 text-muted-foreground hover:underline">
                      · {e.projectName}
                    </Link>
                  )}
                </p>
                <span className="rounded border px-1.5 text-[11px] text-muted-foreground">{ACTIVITY_GROUPS[activityGroup(e.type)]}</span>
              </li>
            );
          })}
        </ol>
      )}

      {entries.length === PAGE && (
        <div className="flex justify-center">
          <Button variant="outline" asChild>
            <Link href={`${base}${qs({ before: new Date(entries[entries.length - 1].createdAt).toISOString() })}`}>Older entries</Link>
          </Button>
        </div>
      )}
    </div>
  );
}
