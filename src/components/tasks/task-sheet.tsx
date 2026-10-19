"use client";

import { useOptimistic, useState, useTransition } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { CornerLeftUp, Loader2, Lock, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { createTask, deleteTask, restoreTask, updateTask, type TaskPatch } from "@/lib/actions/tasks";
import type { BoardStatus, TaskDetail, TaskLinks, WorkspaceMember } from "@/lib/data/projects";
import type { ProjectResource } from "@/lib/data/resources";
import { PRIORITIES, type Priority } from "@/lib/constants";
import { cn, formatMoney } from "@/lib/utils";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Button } from "@/components/ui/button";
import { PriorityIcon, StatusDot, UserAvatar, formatDue, timeAgo } from "./task-bits";
import { Comments } from "./comments";
import { Dependencies } from "./dependencies";

const UNASSIGNED = "__unassigned__";

type SheetProps = {
  task: TaskDetail | null;
  taskKey: string;
  projectId: string;
  projectKey: string;
  currency: string;
  statuses: BoardStatus[];
  members: WorkspaceMember[];
  otherWeight: number;
  resources: ProjectResource[];
  resourcesHref: string;
  currentUserId: string;
  isAdmin: boolean;
  links: TaskLinks | null;
  /** Main tasks of the project, for picking dependencies. */
  mainTasks: { id: string; number: number; title: string }[];
};

/** Builds "?view=…&task=…" keeping the current view. */
function useTaskHref() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const view = searchParams.get("view");
  return (taskKey?: string) => {
    const params = new URLSearchParams();
    if (view) params.set("view", view);
    if (taskKey) params.set("task", taskKey);
    const qs = params.toString();
    return qs ? `${pathname}?${qs}` : pathname;
  };
}

export function TaskSheet(props: SheetProps) {
  const router = useRouter();
  const taskHref = useTaskHref();
  const close = () => router.push(taskHref(), { scroll: false });

  return (
    <Sheet open onOpenChange={(open) => !open && close()}>
      <SheetContent className="gap-0 overflow-y-auto data-[side=right]:w-full data-[side=right]:sm:max-w-xl">
        {props.task ? (
          <TaskEditor {...props} task={props.task} onClose={close} />
        ) : (
          <SheetHeader>
            <SheetTitle>Task not found</SheetTitle>
            <SheetDescription>
              {props.taskKey} doesn&apos;t exist in this project, or it was deleted.
            </SheetDescription>
          </SheetHeader>
        )}
      </SheetContent>
    </Sheet>
  );
}

function TaskEditor({
  task,
  taskKey,
  projectId,
  projectKey,
  currency,
  statuses,
  members,
  otherWeight,
  resources,
  resourcesHref,
  currentUserId,
  isAdmin,
  links,
  mainTasks,
  onClose,
}: SheetProps & { task: TaskDetail; onClose: () => void }) {
  const [pending, startTransition] = useTransition();
  const [title, setTitle] = useState(task.title);
  const [description, setDescription] = useState(task.description ?? "");
  const [progress, setProgress] = useState(task.progress);
  // Server can change progress too (e.g. moving to Done sets 100%); follow it.
  const [syncedProgress, setSyncedProgress] = useState(task.progress);
  if (task.progress !== syncedProgress) {
    setSyncedProgress(task.progress);
    setProgress(task.progress);
  }
  const taskHref = useTaskHref();
  const isSubtask = Boolean(task.parentId);

  function save(patch: TaskPatch) {
    startTransition(async () => {
      const result = await updateTask(task.id, patch);
      if (!result.ok) toast.error(result.error);
      else if (result.warning) toast.warning(result.warning);
    });
  }
  // Flip instantly; follow the server value whenever it changes.
  const [milestone, setMilestone] = useState(task.isMilestone);
  const [syncedMilestone, setSyncedMilestone] = useState(task.isMilestone);
  if (task.isMilestone !== syncedMilestone) {
    setSyncedMilestone(task.isMilestone);
    setMilestone(task.isMilestone);
  }
  const waitingOn = (links?.predecessors ?? []).filter((p) => p.category !== "done" && p.category !== "canceled");

  function commitProgress(value: number) {
    const clamped = Math.max(0, Math.min(100, Math.round(value)));
    setProgress(clamped);
    if (clamped !== task.progress) save({ progress: clamped });
  }

  function handleDelete() {
    startTransition(async () => {
      const result = await deleteTask(task.id);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      onClose();
      toast(`${taskKey} deleted`, {
        description: task.title,
        action: {
          label: "Undo",
          onClick: async () => {
            const undo = await restoreTask(task.id);
            if (undo.ok) toast.success(`${taskKey} restored`);
            else toast.error(undo.error);
          },
        },
      });
    });
  }

  const statusName = new Map(statuses.map((s) => [s.id, s.name]));
  const memberName = new Map(members.map((m) => [m.id, m.name]));
  const remainingWeight = 100 - otherWeight - (task.weight ? Number(task.weight) : 0);
  const fmtPct = (n: number) => `${Number.isInteger(n) ? n : n.toFixed(2)}%`;

  return (
    <>
      <SheetHeader className="pb-2">
        {isSubtask && task.parent && !task.parent.deletedAt && (
          <Link
            href={taskHref(`${projectKey}-${task.parent.number}`)}
            scroll={false}
            className="flex w-fit items-center gap-1 text-xs text-muted-foreground hover:text-foreground hover:underline"
          >
            <CornerLeftUp className="size-3.5" />
            Sub-task of {projectKey}-{task.parent.number} · {task.parent.title}
          </Link>
        )}
        <div className="flex items-center gap-2 pr-8 text-xs text-muted-foreground">
          <span className="font-mono">{taskKey}</span>
          {pending && (
            <span className="flex items-center gap-1" role="status">
              <Loader2 className="size-3 animate-spin" /> Saving…
            </span>
          )}
          <Button
            variant="ghost"
            size="sm"
            className="ml-auto h-7 text-muted-foreground hover:text-destructive"
            onClick={handleDelete}
            disabled={pending}
          >
            <Trash2 className="size-3.5" />
            Delete
          </Button>
        </div>
        <SheetTitle className="sr-only">{task.title}</SheetTitle>
        <SheetDescription className="sr-only">Edit task details</SheetDescription>
        <label htmlFor="task-title" className="sr-only">
          Title
        </label>
        <textarea
          id="task-title"
          value={title}
          onChange={(e) => setTitle(e.target.value.replace(/\n/g, ""))}
          onBlur={() => {
            const value = title.trim();
            if (!value) setTitle(task.title);
            else if (value !== task.title) save({ title: value });
          }}
          onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), e.currentTarget.blur())}
          rows={1}
          maxLength={300}
          className="field-sizing-content w-full min-w-0 resize-none rounded-md bg-transparent text-xl font-semibold outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
      </SheetHeader>

      <div className="grid min-w-0 gap-5 px-4 pb-8">
        {waitingOn.length > 0 && (
          <p role="status" className="flex items-start gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-800 dark:text-amber-300">
            <Lock className="mt-0.5 size-4 shrink-0" aria-hidden />
            <span>
              <strong className="font-semibold">Blocked</strong> — waiting on{" "}
              {waitingOn.map((p) => `${projectKey}-${p.number} ${p.title}`).join(", ")}.
            </span>
          </p>
        )}
        <dl className="grid grid-cols-[7rem_1fr] items-center gap-x-3 gap-y-2 text-sm">
          {!isSubtask && (
            <>
              <dt className="text-muted-foreground">
                <Label htmlFor="task-milestone">Milestone</Label>
              </dt>
              <dd className="flex items-center gap-2">
                <input
                  id="task-milestone"
                  type="checkbox"
                  checked={milestone}
                  onChange={(e) => {
                    setMilestone(e.target.checked);
                    save({ isMilestone: e.target.checked });
                  }}
                  aria-describedby="task-milestone-help"
                  className="size-4 cursor-pointer accent-[var(--primary)]"
                />
                <span id="task-milestone-help" className="text-xs text-muted-foreground">
                  A key date (e.g. permit approved). One date, no weight; not counted in the %.
                </span>
              </dd>
            </>
          )}
          <dt className="text-muted-foreground">
            <Label htmlFor="task-status">Status</Label>
          </dt>
          <dd>
            <Select value={task.statusId} onValueChange={(statusId) => save({ statusId })}>
              <SelectTrigger id="task-status" className="h-8 w-full sm:w-56">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {statuses.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    <StatusDot color={s.color} /> {s.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </dd>

          {!milestone && (
          <>
          <dt className="text-muted-foreground">
            <Label htmlFor="task-progress">Progress</Label>
          </dt>
          <dd className="flex items-center gap-3">
            <input
              type="range"
              min={0}
              max={100}
              step={5}
              value={progress}
              onChange={(e) => setProgress(Number(e.target.value))}
              onPointerUp={(e) => commitProgress(Number(e.currentTarget.value))}
              onKeyUp={(e) => commitProgress(Number(e.currentTarget.value))}
              aria-label="Progress slider"
              className="h-2 w-full cursor-pointer accent-[var(--primary)] sm:w-40"
            />
            <div className="relative">
              <Input
                id="task-progress"
                type="number"
                min={0}
                max={100}
                value={progress}
                onChange={(e) => setProgress(Number(e.target.value))}
                onBlur={(e) => commitProgress(Number(e.target.value))}
                onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
                className="h-8 w-20 pr-6 tabular-nums"
              />
              <span className="pointer-events-none absolute top-1.5 right-2 text-sm text-muted-foreground">%</span>
            </div>
          </dd>
          </>
          )}

          {!isSubtask && !milestone && (
            <>
              <dt className="text-muted-foreground">
                <Label htmlFor="task-weight">Weight</Label>
              </dt>
              <dd>
                <div className="flex flex-wrap items-center gap-2">
                  <div className="relative">
                    <Input
                      id="task-weight"
                      inputMode="decimal"
                      defaultValue={task.weight ? String(Number(task.weight)) : ""}
                      placeholder="0"
                      onBlur={(e) => save({ weight: e.target.value.trim() || null })}
                      onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
                      aria-describedby="task-weight-help"
                      className="h-8 w-24 pr-6 tabular-nums"
                    />
                    <span className="pointer-events-none absolute top-1.5 right-2 text-sm text-muted-foreground">
                      %
                    </span>
                  </div>
                  <span
                    id="task-weight-help"
                    className={cn("text-xs", remainingWeight < 0 ? "text-destructive" : "text-muted-foreground")}
                  >
                    {remainingWeight < 0
                      ? `Tasks add up to ${fmtPct(100 - remainingWeight)} — over 100%`
                      : `${fmtPct(remainingWeight)} of the project not yet assigned`}
                  </span>
                </div>
              </dd>
            </>
          )}

          {!milestone && (
            <>
              <dt className="text-muted-foreground">
                <Label htmlFor="task-start">Start date</Label>
              </dt>
              <dd>
                <Input
                  id="task-start"
                  type="date"
                  defaultValue={task.startDate ?? ""}
                  onChange={(e) => save({ startDate: e.target.value || null })}
                  className="h-8 w-full sm:w-56"
                />
              </dd>
            </>
          )}

          <dt className="text-muted-foreground">
            <Label htmlFor="task-due">{milestone ? "Date" : "End date"}</Label>
          </dt>
          <dd>
            <Input
              id="task-due"
              type="date"
              defaultValue={task.dueDate ?? ""}
              onChange={(e) => save({ dueDate: e.target.value || null })}
              className="h-8 w-full sm:w-56"
            />
          </dd>

          {!milestone && (
          <>
          <dt className="text-muted-foreground">
            <Label htmlFor="task-budget">Budget</Label>
          </dt>
          <dd className="flex items-center gap-2">
            <Input
              id="task-budget"
              inputMode="decimal"
              defaultValue={task.budget ? String(Number(task.budget)) : ""}
              placeholder="0"
              onBlur={(e) => save({ budget: e.target.value.trim() || null })}
              onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
              className="h-8 w-full tabular-nums sm:w-40"
            />
            <span className="text-sm text-muted-foreground">{currency}</span>
          </dd>
          </>
          )}

          <dt className="text-muted-foreground">
            <Label htmlFor="task-priority">Priority</Label>
          </dt>
          <dd>
            <Select value={task.priority} onValueChange={(priority) => save({ priority })}>
              <SelectTrigger id="task-priority" className="h-8 w-full sm:w-56">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PRIORITIES.map((p) => (
                  <SelectItem key={p.value} value={p.value}>
                    <PriorityIcon priority={p.value as Priority} /> {p.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </dd>

          <dt className="text-muted-foreground">
            <Label htmlFor="task-assignee">Assignee</Label>
          </dt>
          <dd>
            <Select
              value={task.assigneeId ?? UNASSIGNED}
              onValueChange={(v) => save({ assigneeId: v === UNASSIGNED ? null : v })}
            >
              <SelectTrigger id="task-assignee" className="h-8 w-full sm:w-56">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={UNASSIGNED}>
                  <span className="text-muted-foreground">Unassigned</span>
                </SelectItem>
                {members.map((m) => (
                  <SelectItem key={m.id} value={m.id}>
                    <UserAvatar name={m.name} image={m.image} className="size-5" /> {m.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </dd>

          {task.reporter && (
            <>
              <dt className="text-muted-foreground">Reporter</dt>
              <dd className="flex items-center gap-2">
                <UserAvatar name={task.reporter.name} className="size-5" />
                {task.reporter.name}
              </dd>
            </>
          )}
        </dl>

        <div className="grid gap-1.5">
          <Label htmlFor="task-description">Description</Label>
          <Textarea
            id="task-description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            onBlur={() => description !== (task.description ?? "") && save({ description })}
            placeholder="Add more detail…"
            rows={5}
            className="field-sizing-content w-full min-w-0 min-h-28"
          />
        </div>

        {!isSubtask && (
          <Subtasks
            task={task}
            projectId={projectId}
            projectKey={projectKey}
            statuses={statuses}
            taskHref={taskHref}
          />
        )}

        {!isSubtask && links && (
          <Dependencies
            taskId={task.id}
            projectKey={projectKey}
            links={links}
            options={mainTasks.filter((t) => t.id !== task.id)}
            taskHref={taskHref}
          />
        )}

        <section aria-labelledby="task-resources-heading" className="grid gap-2">
          <div className="flex items-center justify-between">
            <h3 id="task-resources-heading" className="text-sm font-medium">
              Resources
            </h3>
            <Link href={resourcesHref} className="text-xs text-primary underline-offset-4 hover:underline">
              Manage in Resources tab
            </Link>
          </div>
          {resources.length === 0 ? (
            <p className="text-sm text-muted-foreground">No resources assigned to this task.</p>
          ) : (
            <ul className="grid divide-y rounded-lg border text-sm">
              {resources.map((r) => (
                <li key={r.id} className="flex items-center gap-3 px-3 py-2">
                  <span className="min-w-0 flex-1 truncate">
                    {r.name}
                    {r.role && <span className="text-muted-foreground"> · {r.role}</span>}
                  </span>
                  <span className="text-xs whitespace-nowrap text-muted-foreground tabular-nums">
                    {Number(r.usedQty).toLocaleString()} / {Number(r.plannedQty).toLocaleString()} {r.unit}
                  </span>
                  <span className="w-24 text-right whitespace-nowrap tabular-nums">
                    {formatMoney(Number(r.plannedQty) * Number(r.unitCost), currency)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <Separator />

        <Comments
          taskId={task.id}
          comments={task.comments}
          members={members}
          currentUserId={currentUserId}
          isAdmin={isAdmin}
        />

        <Separator />

        <section aria-labelledby="activity-heading">
          <h3 id="activity-heading" className="mb-3 text-sm font-medium">
            Activity
          </h3>
          <ol className="grid gap-3">
            {task.activities.map((a) => (
              <li key={a.id} className="flex gap-2.5 text-sm">
                <UserAvatar name={a.actor?.name ?? "?"} className="size-5" />
                <p className="min-w-0 flex-1 text-muted-foreground">
                  <span className="font-medium text-foreground">{a.actor?.name ?? "Someone"}</span>{" "}
                  {describeActivity(a.type, a.data, { statusName, memberName, currency, projectKey })}
                  <time
                    dateTime={new Date(a.createdAt).toISOString()}
                    title={new Date(a.createdAt).toLocaleString()}
                    className="ml-1.5 text-xs whitespace-nowrap"
                    suppressHydrationWarning
                  >
                    · {timeAgo(new Date(a.createdAt))}
                  </time>
                </p>
              </li>
            ))}
          </ol>
        </section>
      </div>
    </>
  );
}

function Subtasks({
  task,
  projectId,
  projectKey,
  statuses,
  taskHref,
}: {
  task: TaskDetail;
  projectId: string;
  projectKey: string;
  statuses: BoardStatus[];
  taskHref: (key?: string) => string;
}) {
  const [title, setTitle] = useState("");
  const [pending, startTransition] = useTransition();
  const doneStatus = statuses.find((s) => s.category === "done");
  const todoStatus = statuses.find((s) => s.category === "todo") ?? statuses[0];
  // Tick boxes instantly; the server result replaces this when it arrives.
  const [doneIds, setDoneOptimistic] = useOptimistic(
    new Set(
      task.subtasks
        .filter((s) => s.status.category === "done" || s.status.category === "canceled")
        .map((s) => s.id),
    ),
    (current, change: { id: string; done: boolean }) => {
      const next = new Set(current);
      if (change.done) next.add(change.id);
      else next.delete(change.id);
      return next;
    },
  );

  function add(e: React.FormEvent) {
    e.preventDefault();
    const value = title.trim();
    if (!value) return;
    startTransition(async () => {
      const result = await createTask({ projectId, parentId: task.id, title: value });
      if (result.ok) setTitle("");
      else toast.error(result.error);
    });
  }

  function toggle(sub: TaskDetail["subtasks"][number], checked: boolean) {
    const target = checked ? doneStatus : todoStatus;
    if (!target) return;
    startTransition(async () => {
      setDoneOptimistic({ id: sub.id, done: checked });
      const result = await updateTask(sub.id, { statusId: target.id, progress: checked ? 100 : 0 });
      if (!result.ok) toast.error(result.error);
    });
  }

  function remove(sub: TaskDetail["subtasks"][number]) {
    startTransition(async () => {
      const result = await deleteTask(sub.id);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast(`Sub-task deleted`, {
        description: sub.title,
        action: {
          label: "Undo",
          onClick: async () => {
            const undo = await restoreTask(sub.id);
            if (!undo.ok) toast.error(undo.error);
          },
        },
      });
    });
  }

  return (
    <section aria-labelledby="subtasks-heading" className="grid gap-2">
      <h3 id="subtasks-heading" className="flex items-center gap-2 text-sm font-medium">
        Sub-tasks
        {task.subtasks.length > 0 && (
          <span className="text-xs font-normal text-muted-foreground tabular-nums">
            {doneIds.size}/{task.subtasks.length} done
          </span>
        )}
      </h3>
      {task.subtasks.length > 0 && (
        <ul className="grid divide-y rounded-lg border">
          {task.subtasks.map((sub) => {
            const isDone = doneIds.has(sub.id);
            const key = `${projectKey}-${sub.number}`;
            return (
              <li key={sub.id} className="group flex items-center gap-2.5 px-3 py-2 text-sm">
                <input
                  type="checkbox"
                  checked={isDone}
                  onChange={(e) => toggle(sub, e.target.checked)}
                  aria-label={`Mark “${sub.title}” as ${isDone ? "not done" : "done"}`}
                  className="size-4 cursor-pointer accent-[var(--primary)]"
                />
                <Link
                  href={taskHref(key)}
                  scroll={false}
                  className={cn(
                    "min-w-0 flex-1 truncate hover:underline",
                    isDone && "text-muted-foreground line-through",
                  )}
                >
                  <span className="mr-2 font-mono text-xs text-muted-foreground no-underline">{key}</span>
                  {sub.title}
                </Link>
                <button
                  type="button"
                  onClick={() => remove(sub)}
                  aria-label={`Delete sub-task “${sub.title}”`}
                  className="grid size-7 place-items-center rounded-md text-muted-foreground opacity-60 hover:bg-accent hover:text-destructive hover:opacity-100 focus-visible:opacity-100"
                >
                  <X className="size-4" />
                </button>
              </li>
            );
          })}
        </ul>
      )}
      <form onSubmit={add} className="flex gap-2">
        <label htmlFor="new-subtask" className="sr-only">
          New sub-task
        </label>
        <Input
          id="new-subtask"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Add a sub-task…"
          maxLength={300}
          className="h-8"
        />
        <Button type="submit" size="sm" variant="outline" disabled={pending || !title.trim()}>
          Add
        </Button>
      </form>
    </section>
  );
}

function describeActivity(
  type: string,
  data: Record<string, unknown>,
  ctx: { statusName: Map<string, string>; memberName: Map<string, string>; currency: string; projectKey: string },
) {
  const s = (v: unknown) => (typeof v === "string" ? v : "");
  const pct = (v: unknown) => `${Number(v)}%`;
  switch (type) {
    case "task.created":
      return "created the task";
    case "task.renamed":
      return `renamed the task to “${s(data.to)}”`;
    case "task.description_changed":
      return "updated the description";
    case "task.status_changed":
      return `moved it to ${ctx.statusName.get(s(data.to)) ?? s(data.toName)}`;
    case "task.priority_changed":
      return `set priority to ${PRIORITIES.find((p) => p.value === data.to)?.label ?? s(data.to)}`;
    case "task.assignee_changed":
      return data.to
        ? `assigned it to ${ctx.memberName.get(s(data.to)) ?? "a former member"}`
        : "removed the assignee";
    case "task.start_date_changed":
      return data.to ? `set the start date to ${formatDue(s(data.to), true).label}` : "removed the start date";
    case "task.due_date_changed":
      return data.to ? `set the end date to ${formatDue(s(data.to), true).label}` : "removed the end date";
    case "task.weight_changed":
      return data.to !== null ? `set the weight to ${pct(data.to)}` : "removed the weight";
    case "task.progress_changed":
      return `updated progress to ${pct(data.to)}`;
    case "task.budget_changed":
      return data.to !== null ? `set the budget to ${formatMoney(s(data.to), ctx.currency)}` : "removed the budget";
    case "task.restored":
      return "restored the task";
    case "comment.added":
      return "commented";
    case "task.made_milestone":
      return "made it a milestone";
    case "task.unmade_milestone":
      return "turned it back into a normal task";
    case "task.dependency_added":
      return `made it wait on ${ctx.projectKey}-${data.number} “${s(data.title)}”`;
    case "task.dependency_removed":
      return `removed the dependency on ${ctx.projectKey}-${data.number} “${s(data.title)}”`;
    case "subtask.created":
      return `added sub-task ${ctx.projectKey}-${data.number} “${s(data.title)}”`;
    case "subtask.deleted":
      return `deleted sub-task “${s(data.title)}”`;
    case "subtask.restored":
      return `restored sub-task “${s(data.title)}”`;
    default:
      return type;
  }
}
