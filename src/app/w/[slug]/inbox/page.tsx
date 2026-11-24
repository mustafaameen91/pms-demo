import { AlertTriangle, AtSign, BadgeCheck, Bell, ClipboardList, CalendarClock, MessageSquare, UserPlus, Workflow, XCircle, HandCoins, ShieldAlert, Clock, FileBarChart, Inbox, History, FileWarning, Plane } from "lucide-react";
import { requireWorkspace } from "@/lib/auth/session";
import { listNotifications } from "@/lib/data/notifications";
import { markAllNotificationsRead } from "@/lib/actions/notifications";
import { ensureLateTaskNotifications } from "@/lib/notifications";
import { cn, timeAgo } from "@/lib/utils";
import { getT } from "@/i18n/server";
import { Button } from "@/components/ui/button";
import { EmptyState, PageHeader, PageShell, Panel } from "@/components/page/kit";

export async function generateMetadata() {
  const t = await getT();
  return { title: t("Inbox") };
}

const ICONS: Record<string, typeof Bell> = {
  "task.assigned": UserPlus,
  "comment.mentioned": AtSign,
  "comment.added": MessageSquare,
  "task.late": CalendarClock,
  "project.over_budget": AlertTriangle,
  "expense.approval_requested": BadgeCheck,
  "expense.approved": BadgeCheck,
  "expense.rejected": XCircle,
  "request.received": ClipboardList,
  automation: Workflow,
  loan: HandCoins,
  "loan.request": HandCoins,
  risk: ShieldAlert,
  time: Clock,
  "report.weekly": FileBarChart,
  "hr.expiry": FileWarning,
  leave: Plane,
};
const ALERT_TYPES = new Set(["task.late", "project.over_budget", "expense.rejected", "hr.expiry"]);

export default async function InboxPage({ params }: PageProps<"/w/[slug]/inbox">) {
  const [{ slug }, t] = await Promise.all([params, getT()]);
  const { user, workspace } = await requireWorkspace(slug);
  await ensureLateTaskNotifications(user.id, workspace.id);
  const items = await listNotifications(user.id, workspace.id);
  const unread = items.filter((n) => !n.readAt).length;

  const fresh = items.filter((n) => !n.readAt);
  const earlier = items.filter((n) => n.readAt);
  const row = (n: (typeof items)[number]) => {
    const Icon = ICONS[n.type] ?? Bell;
    const isUnread = !n.readAt;
    const alert = ALERT_TYPES.has(n.type);
    return (
      <li key={n.id} className="relative">
        {isUnread && <span aria-hidden className="absolute inset-y-0 start-0 w-1 bg-primary" />}
        {/* Plain link: a full load marks it read and refreshes the sidebar badge. */}
        <a href={`/w/${workspace.slug}/inbox/${n.id}`} className={cn("flex gap-3.5 px-5 py-3.5 transition-colors hover:bg-accent", isUnread && "bg-primary/[0.04]")}>
          <span
            className={cn(
              "mt-0.5 grid size-9 shrink-0 place-items-center rounded-xl",
              alert ? "bg-destructive/10 text-destructive" : isUnread ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground",
            )}
          >
            <Icon className="size-4.5" aria-hidden />
          </span>
          <span className="min-w-0 flex-1">
            <span className={cn("block text-sm", isUnread ? "font-semibold" : "text-foreground/90")}>{n.title}</span>
            {n.body && <span className="mt-0.5 line-clamp-2 block text-sm text-muted-foreground">{n.body}</span>}
            <span className="mt-1 block text-xs text-muted-foreground">{timeAgo(n.createdAt, t.intl, t("just now"))}</span>
          </span>
          {isUnread && (
            <span className="mt-2 size-2.5 shrink-0 rounded-full bg-primary ring-4 ring-primary/15">
              <span className="sr-only">{t("Unread")}</span>
            </span>
          )}
        </a>
      </li>
    );
  };

  return (
    <PageShell>
      <PageHeader
        icon={Inbox}
        title={t("Inbox")}
        description={unread === 0 ? t("You're all caught up.") : t("{count} unread", { count: String(unread) })}
        actions={
          unread > 0 && (
            <form action={markAllNotificationsRead.bind(null, workspace.slug)}>
              <Button type="submit" variant="outline" size="sm">
                {t("Mark all as read")}
              </Button>
            </form>
          )
        }
      />

      {items.length === 0 ? (
        <EmptyState icon={Bell} title={t("No notifications yet")}>
          {t("You'll be notified when you're assigned a task, mentioned in a comment, a task of yours is late, or a project you manage goes over budget.")}
        </EmptyState>
      ) : (
        <>
          {fresh.length > 0 && (
            <Panel id="inbox-new" title={t("New|inbox")} icon={Bell} count={fresh.length}>
              <ul className="divide-y border-t">{fresh.map(row)}</ul>
            </Panel>
          )}
          {earlier.length > 0 && (
            <Panel id="inbox-earlier" title={t("Earlier")} icon={History}>
              <ul className="divide-y border-t">{earlier.map(row)}</ul>
            </Panel>
          )}
        </>
      )}
    </PageShell>
  );
}
