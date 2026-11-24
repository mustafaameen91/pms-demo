import Link from "next/link";
import { notFound } from "next/navigation";
import { Bot, ClipboardList, Download, Filter, History, ListChecks, ScrollText, Users, Wallet } from "lucide-react";
import { requireWorkspace } from "@/lib/auth/session";
import { listAuditEntries } from "@/lib/data/audit";
import { listWorkspaceMembers } from "@/lib/data/members";
import { ACTIVITY_GROUPS, activityGroup, describeActivity, type ActivityGroup } from "@/lib/activity-text";
import { cn, formatDate, formatDateTime } from "@/lib/utils";
import { getT } from "@/i18n/server";
import { Button } from "@/components/ui/button";
import { SelectBox } from "@/components/ui/select-box";
import { EmptyState, PageHeader, PageShell, Panel, StatTile } from "@/components/page/kit";

export async function generateMetadata() {
  const t = await getT();
  return { title: t("Audit log") };
}
const PAGE = 100;

export default async function AuditPage({ params, searchParams }: PageProps<"/w/[slug]/audit">) {
  const [{ slug }, query, t] = await Promise.all([params, searchParams, getT()]);
  const { workspace } = await requireWorkspace(slug);
  // "System" alone is already the theme option ("حسب النظام"); the actor needs its own entry.
  const systemActor = t.locale === "en" ? "System" : t("System (actor)");
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

  const people = new Set(entries.flatMap((e) => (e.actorName ? [e.actorName] : []))).size;
  const inGroup = (g: ActivityGroup) => entries.filter((e) => activityGroup(e.type) === g).length;
  // The log, one block per day (entries arrive newest first).
  const days: { day: string; items: typeof entries }[] = [];
  for (const e of entries) {
    const d = new Date(e.createdAt);
    const day = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    if (days.at(-1)?.day !== day) days.push({ day, items: [] });
    days.at(-1)!.items.push(e);
  }
  const GROUP_TONE: Record<ActivityGroup, string> = {
    tasks: "bg-primary/10 text-primary",
    projects: "bg-violet-500/10 text-violet-700 dark:text-violet-300",
    money: "bg-amber-500/15 text-amber-800 dark:text-amber-300",
    members: "bg-cyan-500/10 text-cyan-800 dark:text-cyan-300",
    people: "bg-pink-500/10 text-pink-800 dark:text-pink-300",
    billing: "bg-muted text-muted-foreground",
  };

  return (
    <PageShell>
      <PageHeader
        icon={ScrollText}
        title={t("Audit log")}
        description={t("Everything that changed in {workspace}, newest first.", { workspace: workspace.name })}
        actions={
          <Button variant="outline" size="sm" asChild>
            <a href={`${base}/export${qs({})}`} download>
              <Download className="size-4" />
              {t("Download CSV")}
            </a>
          </Button>
        }
      />

      {entries.length > 0 && (
        <dl className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatTile
            icon={History}
            label={t("Changes shown")}
            value={entries.length}
            hint={entries.length === PAGE ? t("The newest {count}; older ones are a page away", { count: PAGE }) : t("Everything for this filter")}
          />
          <StatTile icon={Users} label={t("People involved")} value={people} hint={t("Who made these changes")} />
          <StatTile icon={ListChecks} label={t("Task changes")} value={inGroup("tasks")} hint={t("Tasks, sub-tasks and comments")} />
          <StatTile icon={Wallet} label={t("Money changes")} value={inGroup("money")} hint={t("Expenses, resources and loans")} />
        </dl>
      )}

      <Panel id="audit-filters" title={t("Filter")} icon={Filter}>
        <div className="flex flex-wrap items-center gap-3 border-t px-5 py-4">
          <nav aria-label={t("Filter by area")} className="flex flex-wrap gap-1 rounded-xl bg-muted p-1">
            {[{ key: undefined, label: "All" }, ...Object.entries(ACTIVITY_GROUPS).map(([key, label]) => ({ key, label }))].map((g) => (
              <Link
                key={g.label}
                href={`${base}${qs({ group: g.key, before: undefined })}`}
                aria-current={group === g.key ? "page" : undefined}
                className={cn(
                  "flex h-7 items-center rounded-lg px-3 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground",
                  group === g.key && "bg-card text-primary shadow-sm",
                )}
              >
                {t(g.label)}
              </Link>
            ))}
          </nav>
          <form className="flex items-center gap-2" action={base}>
            {group && <input type="hidden" name="group" value={group} />}
            <label htmlFor="audit-actor" className="text-sm text-muted-foreground">
              {t("Person")}
            </label>
            <SelectBox id="audit-actor" name="actor" defaultValue={actorId ?? ""} className="h-8 rounded-lg border border-input bg-transparent px-2 text-sm dark:bg-input/30">
              <option value="">{t("Everyone")}</option>
              {members.map((m) => (
                <option key={m.userId} value={m.userId}>
                  {m.name}
                </option>
              ))}
            </SelectBox>
            <Button type="submit" size="sm" variant="outline">
              {t("Apply")}
            </Button>
          </form>
        </div>
      </Panel>

      {entries.length === 0 ? (
        <EmptyState icon={ScrollText} title={t("Nothing recorded for this filter.")} />
      ) : (
        days.map(({ day, items }) => (
          <Panel key={day} id={`audit-${day}`} title={formatDate(day, t.intl)} icon={History} count={items.length}>
            <ol className="border-t px-5 py-2">
              {items.map((e, i) => {
                const taskRef = e.projectKey && e.taskNumber ? `${e.projectKey}-${e.taskNumber}` : null;
                const when = new Date(e.createdAt);
                const g = activityGroup(e.type);
                const who = e.actorName ?? (e.data.automation ? t("Automation:") : e.type === "task.created_from_form" ? t("Request form:") : systemActor);
                const initials = e.actorName
                  ? e.actorName
                      .trim()
                      .split(/\s+/)
                      .slice(0, 2)
                      .map((w) => w[0])
                      .join("")
                      .toUpperCase()
                  : null;
                return (
                  <li key={e.id} className="relative flex gap-3 py-2.5 text-sm">
                    {/* The timeline's line, between this entry's avatar and the next. */}
                    {i < items.length - 1 && <span aria-hidden className="absolute top-11 bottom-0 w-px bg-border inset-s-4" />}
                    <span
                      aria-hidden
                      className={cn(
                        "relative grid size-8 shrink-0 place-items-center rounded-full text-xs font-semibold",
                        initials ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground",
                      )}
                    >
                      {initials ?? (e.type === "task.created_from_form" ? <ClipboardList className="size-4" /> : <Bot className="size-4" />)}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p>
                        <span className="font-semibold">{who}</span> {describeActivity(e.type, e.data, taskRef, t)}
                        {e.projectName && (
                          <Link href={`/w/${workspace.slug}/p/${e.projectKey}/overview`} className="ms-1 text-muted-foreground hover:underline">
                            · {e.projectName}
                          </Link>
                        )}
                      </p>
                      <div className="mt-1 flex flex-wrap items-center gap-2">
                        <time dateTime={when.toISOString()} className="text-xs text-muted-foreground tabular-nums" suppressHydrationWarning>
                          {formatDateTime(when, t.intl)}
                        </time>
                        <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-medium", GROUP_TONE[g])}>{t(ACTIVITY_GROUPS[g])}</span>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ol>
          </Panel>
        ))
      )}

      {entries.length === PAGE && (
        <div className="flex justify-center">
          <Button variant="outline" asChild>
            <Link href={`${base}${qs({ before: new Date(entries[entries.length - 1].createdAt).toISOString() })}`}>{t("Older entries")}</Link>
          </Button>
        </div>
      )}
    </PageShell>
  );
}
