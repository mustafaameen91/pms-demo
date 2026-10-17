"use client";

import { useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { updateTask, type TaskPatch } from "@/lib/actions/tasks";
import type { BoardStatus, TaskDetail, WorkspaceMember } from "@/lib/data/projects";
import { PRIORITIES, type Priority } from "@/lib/constants";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { PriorityIcon, StatusDot, UserAvatar, formatDue } from "./task-bits";

const UNASSIGNED = "__unassigned__";

export function TaskSheet({
  task,
  taskKey,
  statuses,
  members,
}: {
  task: TaskDetail | null;
  taskKey: string;
  statuses: BoardStatus[];
  members: WorkspaceMember[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function close() {
    const view = searchParams.get("view");
    router.push(view ? `${pathname}?view=${view}` : pathname, { scroll: false });
  }

  return (
    <Sheet open onOpenChange={(open) => !open && close()}>
      <SheetContent className="w-full gap-0 overflow-y-auto sm:max-w-xl">
        {task ? (
          <TaskEditor task={task} taskKey={taskKey} statuses={statuses} members={members} />
        ) : (
          <SheetHeader>
            <SheetTitle>Task not found</SheetTitle>
            <SheetDescription>
              {taskKey} doesn&apos;t exist in this project, or it was deleted.
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
  statuses,
  members,
}: {
  task: TaskDetail;
  taskKey: string;
  statuses: BoardStatus[];
  members: WorkspaceMember[];
}) {
  const [pending, startTransition] = useTransition();
  const [title, setTitle] = useState(task.title);
  const [description, setDescription] = useState(task.description ?? "");

  function save(patch: TaskPatch) {
    startTransition(async () => {
      const result = await updateTask(task.id, patch);
      if (!result.ok) toast.error(result.error);
    });
  }

  const statusName = new Map(statuses.map((s) => [s.id, s.name]));
  const memberName = new Map(members.map((m) => [m.id, m.name]));

  return (
    <>
      <SheetHeader className="pb-2">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span className="font-mono">{taskKey}</span>
          {pending && (
            <span className="flex items-center gap-1" role="status">
              <Loader2 className="size-3 animate-spin" /> Saving…
            </span>
          )}
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
          className="field-sizing-content resize-none rounded-md bg-transparent text-xl font-semibold outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
      </SheetHeader>

      <div className="grid gap-5 px-4 pb-8">
        <dl className="grid grid-cols-[7rem_1fr] items-center gap-x-3 gap-y-2 text-sm">
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

          <dt className="text-muted-foreground">
            <Label htmlFor="task-due">Due date</Label>
          </dt>
          <dd className="flex items-center gap-2">
            <Input
              id="task-due"
              type="date"
              defaultValue={task.dueDate ?? ""}
              onChange={(e) => save({ dueDate: e.target.value || null })}
              className="h-8 w-full sm:w-56"
            />
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
            rows={6}
            className="field-sizing-content min-h-32"
          />
        </div>

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
                  {describeActivity(a.type, a.data, statusName, memberName)}
                  <time
                    dateTime={new Date(a.createdAt).toISOString()}
                    className="ml-1.5 text-xs whitespace-nowrap"
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

function describeActivity(
  type: string,
  data: Record<string, unknown>,
  statusName: Map<string, string>,
  memberName: Map<string, string>,
) {
  const s = (v: unknown) => (typeof v === "string" ? v : "");
  switch (type) {
    case "task.created":
      return "created the task";
    case "task.renamed":
      return `renamed the task to “${s(data.to)}”`;
    case "task.description_changed":
      return "updated the description";
    case "task.status_changed":
      return `moved it to ${statusName.get(s(data.to)) ?? s(data.toName)}`;
    case "task.priority_changed":
      return `set priority to ${PRIORITIES.find((p) => p.value === data.to)?.label ?? s(data.to)}`;
    case "task.assignee_changed":
      return data.to ? `assigned it to ${memberName.get(s(data.to)) ?? "a former member"}` : "removed the assignee";
    case "task.due_date_changed":
      return data.to ? `set the due date to ${formatDue(s(data.to), true).label}` : "removed the due date";
    default:
      return type;
  }
}

function timeAgo(date: Date) {
  const seconds = Math.round((Date.now() - date.getTime()) / 1000);
  const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });
  if (seconds < 60) return "just now";
  if (seconds < 3600) return rtf.format(-Math.round(seconds / 60), "minute");
  if (seconds < 86400) return rtf.format(-Math.round(seconds / 3600), "hour");
  if (seconds < 604800) return rtf.format(-Math.round(seconds / 86400), "day");
  return date.toLocaleDateString();
}
