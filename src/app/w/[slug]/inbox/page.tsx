import { AlertTriangle, AtSign, BadgeCheck, Bell, ClipboardList, CalendarClock, MessageSquare, UserPlus, Workflow, XCircle, HandCoins, ShieldAlert, Clock } from "lucide-react";
import { requireWorkspace } from "@/lib/auth/session";
import { listNotifications } from "@/lib/data/notifications";
import { markAllNotificationsRead } from "@/lib/actions/notifications";
import { ensureLateTaskNotifications } from "@/lib/notifications";
import { cn, timeAgo } from "@/lib/utils";
import { getT } from "@/i18n/server";
import { Button } from "@/components/ui/button";

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
};
const ALERT_TYPES = new Set(["task.late", "project.over_budget", "expense.rejected"]);

export default async function InboxPage({ params }: PageProps<"/w/[slug]/inbox">) {
  const [{ slug }, t] = await Promise.all([params, getT()]);
  const { user, workspace } = await requireWorkspace(slug);
  await ensureLateTaskNotifications(user.id, workspace.id);
  const items = await listNotifications(user.id, workspace.id);
  const unread = items.filter((n) => !n.readAt).length;

  return (
    <div className="w-full px-4 py-6 sm:px-6 lg:py-8">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">{t("Inbox")}</h1>
          <p className="text-sm text-muted-foreground">
            {unread === 0 ? t("You're all caught up.") : t("{count} unread", { count: String(unread) })}
          </p>
        </div>
        {unread > 0 && (
          <form action={markAllNotificationsRead.bind(null, workspace.slug)}>
            <Button type="submit" variant="outline" size="sm">
              {t("Mark all as read")}
            </Button>
          </form>
        )}
      </div>

      {items.length === 0 ? (
        <div className="rounded-xl border border-dashed px-6 py-14 text-center">
          <Bell className="mx-auto mb-3 size-8 text-muted-foreground" aria-hidden />
          <p className="font-medium">{t("No notifications yet")}</p>
          <p className="mt-1 text-sm text-muted-foreground">
            {t(
              "You'll be notified when you're assigned a task, mentioned in a comment, a task of yours is late, or a project you manage goes over budget.",
            )}
          </p>
        </div>
      ) : (
        <ul className="divide-y overflow-hidden rounded-xl border bg-card">
          {items.map((n) => {
            const Icon = ICONS[n.type] ?? Bell;
            const isUnread = !n.readAt;
            return (
              <li key={n.id}>
                {/* Plain link: a full load marks it read and refreshes the sidebar badge. */}
                <a
                  href={`/w/${workspace.slug}/inbox/${n.id}`}
                  className={cn("flex gap-3 px-4 py-3 transition-colors hover:bg-accent/50", isUnread && "bg-primary/5")}
                >
                  <span
                    className={cn(
                      "mt-0.5 grid size-8 shrink-0 place-items-center rounded-full",
                      ALERT_TYPES.has(n.type) ? "bg-destructive/10 text-destructive" : "bg-accent text-primary",
                    )}
                  >
                    <Icon className="size-4" aria-hidden />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className={cn("block text-sm", isUnread && "font-semibold")}>{n.title}</span>
                    {n.body && <span className="mt-0.5 line-clamp-2 block text-sm text-muted-foreground">{n.body}</span>}
                    <span className="mt-1 block text-xs text-muted-foreground">{timeAgo(n.createdAt, t.intl, t("just now"))}</span>
                  </span>
                  {isUnread && (
                    <span className="mt-2 size-2 shrink-0 rounded-full bg-primary">
                      <span className="sr-only">{t("Unread")}</span>
                    </span>
                  )}
                </a>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
