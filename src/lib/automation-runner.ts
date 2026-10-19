import "server-only";
import { and, eq, inArray, isNull, lt, max, ne, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  activities,
  automationRules,
  automationRuns,
  member,
  projects,
  taskStatuses,
  tasks,
  user,
} from "@/lib/db/schema";
import { todayISO } from "@/lib/accomplishment";
import { brokenReason, describeRule, matchesTrigger, type Action, type AutomationEvent, type RuleNames, type Trigger } from "@/lib/automations";
import { POSITION_STEP, PRIORITIES } from "@/lib/constants";
import { notify, projectContext, projectManagers } from "@/lib/notifications";
import { spawnNextOccurrence } from "@/lib/task-recurrence";
import { formatMoney } from "@/lib/utils";
import { tFor } from "@/i18n/server";
import type { T } from "@/i18n/translate";

const EN = tFor("en");

type Outcome = { status: "done" | "skipped" | "failed"; message: string; info?: string };

const isDone = (category: string) => category === "done" || category === "canceled";

/** Column and member names for a project, used to describe and check rules. Amounts formatted for `t` (English by default). */
export async function ruleNames(projectId: string, workspaceId: string, currency: string, t: T = EN): Promise<RuleNames> {
  const [statuses, people] = await Promise.all([
    db.select({ id: taskStatuses.id, name: taskStatuses.name }).from(taskStatuses).where(eq(taskStatuses.projectId, projectId)),
    db
      .select({ id: user.id, name: user.name })
      .from(member)
      .innerJoin(user, eq(user.id, member.userId))
      .where(eq(member.organizationId, workspaceId)),
  ]);
  return {
    statuses: Object.fromEntries(statuses.map((s) => [s.id, s.name])),
    people: Object.fromEntries(people.map((p) => [p.id, p.name])),
    money: (amount) => formatMoney(amount, currency, t.intl),
  };
}

/**
 * Runs the project's enabled rules for an event. Changes made by a rule do
 * not trigger other rules (no loops). Never throws: a failing rule is
 * recorded in the run history and the user's own change still goes through.
 * Returns short notes for the person who caused the event (shown as a toast).
 *
 * Language: the run history has one stored message per run (no schema change),
 * written in the language of the person whose change triggered it — pass their
 * translator as `t` (server actions pass getT()). Runs with no such person
 * (the late-task sweep, public request forms) are stored in English. The toast
 * notes use the same `t`. Notifications sent by a rule are written separately
 * in each recipient's own language.
 */
export async function runAutomations(event: AutomationEvent, actorId: string | null, t: T = EN): Promise<string[]> {
  try {
    const rules = await db
      .select()
      .from(automationRules)
      .where(
        and(
          eq(automationRules.projectId, event.projectId),
          eq(automationRules.enabled, true),
          sql`${automationRules.trigger}->>'type' = ${event.type}`,
        ),
      )
      .orderBy(automationRules.createdAt);
    const matching = rules.filter((r) => matchesTrigger(r.trigger, event));
    if (matching.length === 0) return [];

    const ctx = await projectContext(event.projectId);
    const [project] = await db.select({ currency: projects.currency, archivedAt: projects.archivedAt }).from(projects).where(eq(projects.id, event.projectId));
    if (!ctx || !project || project.archivedAt) return [];
    const names = await ruleNames(event.projectId, ctx.workspaceId, project.currency, t);
    const taskId = "taskId" in event ? event.taskId : null;

    const notes: string[] = [];
    for (const rule of matching) {
      // Late-task rules run once per task and end date; other events are one-offs.
      const dedupeKey = event.type === "task.late" ? `${event.taskId}:${event.dueDate}` : null;
      const [run] = await db
        .insert(automationRuns)
        .values({
          workspaceId: ctx.workspaceId,
          projectId: event.projectId,
          ruleId: rule.id,
          taskId,
          status: "skipped",
          message: t("Running…"),
          dedupeKey,
        })
        .onConflictDoNothing()
        .returning({ id: automationRuns.id });
      if (!run) continue;

      let outcome: Outcome;
      const broken = brokenReason(rule, names, t);
      if (broken) {
        outcome = { status: "skipped", message: t("Didn't run: {reason}", { reason: broken }) };
      } else {
        try {
          outcome = await perform(rule, event, actorId, ctx, names, project.currency, t);
        } catch (error) {
          console.error("[automation] rule failed", rule.id, error);
          outcome = { status: "failed", message: t("Something went wrong running this rule.") };
        }
      }
      await db.update(automationRuns).set({ status: outcome.status, message: outcome.message }).where(eq(automationRuns.id, run.id));
      if (outcome.info) notes.push(outcome.info);
    }
    return notes;
  } catch (error) {
    console.error("[automation] failed to run automations", error);
    return [];
  }
}

type Ctx = NonNullable<Awaited<ReturnType<typeof projectContext>>>;

/** `t` = language of the run message and toast note; notifications use each recipient's. */
async function perform(
  rule: { id: string; trigger: Trigger; action: Action },
  event: AutomationEvent,
  actorId: string | null,
  ctx: Ctx,
  names: RuleNames,
  currency: string,
  t: T,
): Promise<Outcome> {
  const ruleId = rule.id;
  const action = rule.action;
  // Same names, with amounts formatted for a recipient's language.
  const namesFor = (tr: T): RuleNames => ({ ...names, money: (amount) => formatMoney(amount, currency, tr.intl) });
  const task =
    "taskId" in event
      ? (await db.select().from(tasks).where(and(eq(tasks.id, event.taskId), isNull(tasks.deletedAt))).limit(1))[0]
      : undefined;
  if ("taskId" in event && !task) return { status: "skipped", message: t("The task was deleted.") };
  const ref = task ? `${ctx.key}-${task.number}` : "";
  const taskLink = `/w/${ctx.slug}/p/${ctx.key}?task=${ref}`;
  const log = (type: string, data: Record<string, unknown>) =>
    db.insert(activities).values({
      workspaceId: ctx.workspaceId,
      projectId: ctx.id,
      taskId: task!.id,
      actorId: null,
      type,
      data: { ...data, automation: true, ruleId },
    });

  switch (action.type) {
    case "notify": {
      const targets =
        action.to === "manager"
          ? [ctx.leadId]
          : action.to === "assignee"
            ? [task?.assigneeId]
            : action.to === "admins"
              ? (await projectManagers(ctx.workspaceId, null)).filter(Boolean)
              : [action.userId];
      if (!targets.some(Boolean)) {
        const missing = {
          manager: t("The project has no manager."),
          assignee: t("The task has no assignee."),
          admins: t("No admins found."),
          user: t("No one to notify."),
        }[action.to];
        return { status: "skipped", message: missing };
      }
      // Written per recipient, in their language.
      const title = (tr: T) =>
        event.type === "task.created"
          ? tr("New task {ref} {title}", { ref, title: task!.title })
          : event.type === "task.status_changed"
            ? tr("{ref} {title} moved to {column}", { ref, title: task!.title, column: names.statuses[event.statusId] ?? tr("another column") })
            : event.type === "task.late"
              ? tr("{ref} {title} is late", { ref, title: task!.title })
              : tr("New expense {amount} on {project}: {description}", {
                  amount: formatMoney(event.amount, currency, tr.intl),
                  project: ctx.name,
                  description: event.description,
                });
      const sent = await notify({
        workspaceId: ctx.workspaceId,
        userIds: targets,
        actorId,
        type: "automation",
        title,
        // A custom message is sent as written; otherwise the rule, described in the recipient's language.
        body: action.message || ((tr: T) => tr("Automation: {rule}", { rule: describeRule(rule, namesFor(tr), tr) })),
        link: event.type === "expense.added" ? `/w/${ctx.slug}/p/${ctx.key}/expenses` : taskLink,
        dedupeKey: event.type === "task.late" ? `auto:${ruleId}:${event.taskId}:${event.dueDate}` : undefined,
        email: action.email,
      });
      if (sent.length === 0) {
        return { status: "skipped", message: t("No one to notify — the person who made the change isn't notified about it.") };
      }
      const who = sent.length === 1 ? (names.people[sent[0]] ?? t("1 person")) : t.plural(sent.length, "{count} person", "{count} people");
      return { status: "done", message: ref ? t("Notified {who} about {ref}", { who, ref }) : t("Notified {who}", { who }) };
    }

    case "set_status": {
      if (task!.statusId === action.statusId) {
        return { status: "skipped", message: t("{ref} was already in “{column}”.", { ref, column: names.statuses[action.statusId] }) };
      }
      const [status] = await db.select().from(taskStatuses).where(and(eq(taskStatuses.id, action.statusId), eq(taskStatuses.projectId, ctx.id)));
      if (!status) return { status: "skipped", message: t("Its target column was deleted.") };
      const [{ maxPos }] = await db
        .select({ maxPos: max(tasks.position) })
        .from(tasks)
        .where(and(eq(tasks.projectId, ctx.id), eq(tasks.statusId, status.id)));
      const done = isDone(status.category);
      await db
        .update(tasks)
        .set({
          statusId: status.id,
          position: (maxPos ?? 0) + POSITION_STEP,
          completedAt: done ? new Date() : null,
          ...(done && { progress: 100 }),
        })
        .where(eq(tasks.id, task!.id));
      await log("task.status_changed", { from: task!.statusId, to: status.id, toName: status.name });
      if (status.category === "done") await spawnNextOccurrence(task!.id, actorId);
      return {
        status: "done",
        message: t("Moved {ref} to “{column}”", { ref, column: status.name }),
        info: t("Automation moved {ref} to “{column}”", { ref, column: status.name }),
      };
    }

    case "assign": {
      if (task!.assigneeId === action.userId) {
        return { status: "skipped", message: t("{ref} was already assigned to {name}.", { ref, name: names.people[action.userId] }) };
      }
      await db.update(tasks).set({ assigneeId: action.userId }).where(eq(tasks.id, task!.id));
      await log("task.assignee_changed", { from: task!.assigneeId, to: action.userId });
      await notify({
        workspaceId: ctx.workspaceId,
        userIds: [action.userId],
        actorId,
        type: "task.assigned",
        title: (tr) => tr("You were assigned {ref} {title}", { ref, title: task!.title }),
        body: (tr) => tr("Automation on {project}", { project: ctx.name }),
        link: taskLink,
        email: true,
      });
      const who = names.people[action.userId];
      return {
        status: "done",
        message: t("Assigned {ref} to {name}", { ref, name: who }),
        info: t("Automation assigned {ref} to {name}", { ref, name: who }),
      };
    }

    case "set_priority": {
      const label = t(PRIORITIES.find((p) => p.value === action.priority)?.label ?? action.priority);
      if (task!.priority === action.priority) {
        return { status: "skipped", message: t("{ref} already had priority {priority}.", { ref, priority: label }) };
      }
      await db.update(tasks).set({ priority: action.priority }).where(eq(tasks.id, task!.id));
      await log("task.priority_changed", { from: task!.priority, to: action.priority });
      return {
        status: "done",
        message: t("Set {ref} to {priority}", { ref, priority: label }),
        info: t("Automation set {ref} to {priority}", { ref, priority: label }),
      };
    }
  }
}

// --- Late tasks: there is no background scheduler, so this runs when people use the app. ---

const lastSweep = new Map<string, number>();
const SWEEP_EVERY_MS = 60_000;

/** A new or re-enabled rule should act on the next page load, not up to a minute later. */
export function resetLateSweep(workspaceId: string) {
  lastSweep.delete(workspaceId);
}

/** Fires "a task becomes late" rules for a workspace (at most once a minute; each task once per end date). */
export async function sweepLateTaskAutomations(workspaceId: string) {
  const now = Date.now();
  if (now - (lastSweep.get(workspaceId) ?? 0) < SWEEP_EVERY_MS) return;
  lastSweep.set(workspaceId, now);
  try {
    const rules = await db
      .selectDistinct({ projectId: automationRules.projectId })
      .from(automationRules)
      .where(
        and(
          eq(automationRules.workspaceId, workspaceId),
          eq(automationRules.enabled, true),
          sql`${automationRules.trigger}->>'type' = 'task.late'`,
        ),
      );
    if (rules.length === 0) return;
    const late = await db
      .select({ id: tasks.id, projectId: tasks.projectId, dueDate: tasks.dueDate })
      .from(tasks)
      .innerJoin(taskStatuses, eq(taskStatuses.id, tasks.statusId))
      .innerJoin(projects, eq(projects.id, tasks.projectId))
      .where(
        and(
          inArray(tasks.projectId, rules.map((r) => r.projectId)),
          isNull(tasks.parentId),
          isNull(tasks.deletedAt),
          isNull(projects.archivedAt),
          lt(tasks.dueDate, todayISO()),
          ne(taskStatuses.category, "done"),
          ne(taskStatuses.category, "canceled"),
        ),
      );
    for (const t of late) {
      await runAutomations({ type: "task.late", projectId: t.projectId, taskId: t.id, dueDate: t.dueDate! }, null);
    }
  } catch (error) {
    console.error("[automation] late-task sweep failed", error);
  }
}
