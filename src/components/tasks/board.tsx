"use client";

import { useId, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  closestCorners,
  pointerWithin,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragOverEvent,
  type CollisionDetection,
  type DragStartEvent,
  type Announcements,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { ListTree } from "lucide-react";
import { toast } from "sonner";
import { moveTask } from "@/lib/actions/tasks";
import type { BoardStatus, BoardTask } from "@/lib/data/projects";
import { POSITION_STEP } from "@/lib/constants";
import { cn } from "@/lib/utils";
import { useT } from "@/i18n/client";
import { QuickAddTask } from "./quick-add-task";
import { BlockedBadge, MilestoneIcon, RepeatIcon, ProgressBar, PriorityIcon, StatusDot, UserAvatar, formatDue } from "./task-bits";

type Props = {
  projectId: string;
  projectKey: string;
  statuses: BoardStatus[];
  tasks: BoardTask[];
  /** Ids of cards this person may drag (their own unblocked tasks; all unblocked ones for managers). */
  movable: string[];
  /** Managers can add tasks. */
  canAdd: boolean;
};

const COLUMN_PREFIX = "column:";

const msSince = (time: number) => Date.now() - time;

// Whatever is under the pointer wins (a card before its column). Keyboard drags
// have no pointer, so they fall back to the nearest droppable.
const collisionDetection: CollisionDetection = (args) => {
  const hits = pointerWithin(args);
  if (hits.length === 0) return closestCorners(args);
  const cards = hits.filter((h) => !String(h.id).startsWith(COLUMN_PREFIX));
  return cards.length ? cards : hits;
};

export function Board({ projectId, projectKey, statuses, tasks, movable, canAdd }: Props) {
  const canMove = new Set(movable);
  const t = useT();
  const router = useRouter();
  const pathname = usePathname();
  // Local copy for optimistic drag & drop.
  const [items, setItems] = useState(tasks);
  const [activeId, setActiveId] = useState<string | null>(null);
  const lastDragEnd = useRef(0);
  const dndId = useId(); // stable a11y ids across server and client render
  // Re-sync the optimistic copy whenever the server sends new data.
  const [syncedTasks, setSyncedTasks] = useState(tasks);
  if (tasks !== syncedTasks) {
    setSyncedTasks(tasks);
    setItems(tasks);
  }

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    // Space picks up / drops a card, arrows move it, Escape cancels. Enter opens the task.
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
      keyboardCodes: { start: ["Space"], cancel: ["Escape"], end: ["Space", "Enter"] },
    }),
  );

  const byStatus = useMemo(() => {
    const map = new Map<string, BoardTask[]>(statuses.map((s) => [s.id, []]));
    for (const t of items) map.get(t.statusId)?.push(t);
    return map;
  }, [items, statuses]);

  const doneStatusIds = useMemo(
    () => new Set(statuses.filter((s) => s.category === "done" || s.category === "canceled").map((s) => s.id)),
    [statuses],
  );

  // dnd-kit's screen-reader texts, in the viewer's language.
  const announcements: Announcements = {
    onDragStart: ({ active }) => t("Picked up draggable item {id}.", { id: String(active.id) }),
    onDragOver: ({ active, over }) =>
      over
        ? t("Draggable item {id} was moved over droppable area {over}.", { id: String(active.id), over: String(over.id) })
        : t("Draggable item {id} is no longer over a droppable area.", { id: String(active.id) }),
    onDragEnd: ({ active, over }) =>
      over
        ? t("Draggable item {id} was dropped over droppable area {over}", { id: String(active.id), over: String(over.id) })
        : t("Draggable item {id} was dropped.", { id: String(active.id) }),
    onDragCancel: ({ active }) => t("Dragging was cancelled. Draggable item {id} was dropped.", { id: String(active.id) }),
  };
  const screenReaderInstructions = {
    draggable: `
    ${t("To pick up a draggable item, press the space bar.")}
    ${t("While dragging, use the arrow keys to move the item.")}
    ${t("Press space again to drop the item in its new position, or press escape to cancel.")}
  `,
  };

  const activeTask = activeId ? items.find((t) => t.id === activeId) : null;

  function columnOf(id: string) {
    if (id.startsWith(COLUMN_PREFIX)) return id.slice(COLUMN_PREFIX.length);
    return items.find((t) => t.id === id)?.statusId ?? null;
  }

  function onDragStart({ active }: DragStartEvent) {
    setActiveId(String(active.id));
  }

  // Move the card into the hovered column while dragging, so the column makes room.
  function onDragOver({ active, over }: DragOverEvent) {
    if (!over) return;
    const from = columnOf(String(active.id));
    const to = columnOf(String(over.id));
    if (!from || !to || from === to) return;
    setItems((prev) => prev.map((t) => (t.id === active.id ? { ...t, statusId: to } : t)));
  }

  async function onDragEnd({ active, over }: DragEndEvent) {
    setActiveId(null);
    lastDragEnd.current = Date.now();
    if (!over) {
      setItems(tasks);
      return;
    }
    const id = String(active.id);
    const overId = String(over.id);
    const statusId = columnOf(overId);
    if (!statusId) return;

    // Standard multi-column sortable: reorder the target column, then place the
    // card halfway between its new neighbours (fractional index).
    const column = items.filter((t) => t.statusId === statusId);
    const from = column.findIndex((t) => t.id === id);
    let to = overId.startsWith(COLUMN_PREFIX) ? column.length - 1 : column.findIndex((t) => t.id === overId);
    if (to === -1) to = column.length - 1;
    const ordered = from === -1 ? column : arrayMove(column, from, to);
    const index = ordered.findIndex((t) => t.id === id);
    const before = ordered[index - 1]?.position;
    const after = ordered[index + 1]?.position;
    const position =
      before === undefined && after === undefined
        ? POSITION_STEP
        : before === undefined
          ? after! - POSITION_STEP
          : after === undefined
            ? before + POSITION_STEP
            : (before + after) / 2;

    const original = tasks.find((t) => t.id === id);
    if (original && original.statusId === statusId && original.position === position) return;

    setItems((prev) =>
      prev
        .map((t) => (t.id === id ? { ...t, statusId, position } : t))
        .sort((a, b) => a.position - b.position),
    );
    const result = await moveTask(id, statusId, position);
    if (!result.ok) {
      toast.error(result.error);
      setItems(tasks);
    } else if (result.info) {
      toast.success(result.info);
    } else if (result.warning) {
      toast.warning(result.warning);
    }
  }

  function openTask(number: number) {
    // A pointer drag ends with a click on the card; don't treat it as "open".
    if (activeId || msSince(lastDragEnd.current) < 250) return;
    router.push(`${pathname}?view=board&task=${projectKey}-${number}`, { scroll: false });
  }

  return (
    <DndContext
      id={dndId}
      sensors={sensors}
      accessibility={{ announcements, screenReaderInstructions }}
      collisionDetection={collisionDetection}
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDragEnd={onDragEnd}
      onDragCancel={() => {
        setActiveId(null);
        lastDragEnd.current = Date.now();
        setItems(tasks);
      }}
    >
      <div className="flex min-h-0 flex-1 gap-3 overflow-x-auto p-4 sm:px-6">
        {statuses.map((status) => {
          const columnTasks = byStatus.get(status.id) ?? [];
          return (
            <Column key={status.id} status={status} count={columnTasks.length}>
              <SortableContext items={columnTasks.map((t) => t.id)} strategy={verticalListSortingStrategy}>
                <ul className="grid gap-2">
                  {columnTasks.map((task) => (
                    <SortableCard
                      key={task.id}
                      task={task}
                      projectKey={projectKey}
                      done={doneStatusIds.has(task.statusId)}
                      onOpen={() => openTask(task.number)}
                      locked={!canMove.has(task.id)}
                    />
                  ))}
                </ul>
              </SortableContext>
              {canAdd && <QuickAddTask projectId={projectId} statusId={status.id} />}
            </Column>
          );
        })}
      </div>

      <DragOverlay>
        {activeTask && (
          <TaskCard
            task={activeTask}
            projectKey={projectKey}
            done={doneStatusIds.has(activeTask.statusId)}
            className="rotate-1 shadow-lg"
          />
        )}
      </DragOverlay>
    </DndContext>
  );
}

function Column({
  status,
  count,
  children,
}: {
  status: BoardStatus;
  count: number;
  children: React.ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: `${COLUMN_PREFIX}${status.id}` });
  return (
    <section
      ref={setNodeRef}
      aria-label={status.name}
      className={cn(
        "flex w-72 shrink-0 flex-col rounded-xl bg-muted/50 p-2 transition-colors",
        isOver && "bg-accent",
      )}
    >
      <h2 className="mb-2 flex items-center gap-2 px-1.5 pt-1 text-sm font-medium">
        <StatusDot color={status.color} />
        {status.name}
        <span className="text-xs font-normal text-muted-foreground tabular-nums">{count}</span>
      </h2>
      <div className="flex min-h-16 flex-col gap-2">{children}</div>
    </section>
  );
}

function SortableCard({
  task,
  projectKey,
  done,
  onOpen,
  locked,
}: {
  task: BoardTask;
  projectKey: string;
  done: boolean;
  onOpen: () => void;
  /** Can't be moved by this person (not theirs, or blocked); it still opens on click. */
  locked: boolean;
}) {
  const t = useT();
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: task.id,
    disabled: locked,
  });

  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      {...attributes}
      {...listeners}
      aria-roledescription={t("Draggable task")}
      onClick={onOpen}
      onKeyDown={(e) => {
        listeners?.onKeyDown?.(e);
        if (e.key === "Enter") onOpen();
      }}
      className={cn("rounded-lg focus-visible:outline-2 focus-visible:outline-ring", isDragging && "opacity-40")}
    >
      <TaskCard task={task} projectKey={projectKey} done={done} />
    </li>
  );
}

function TaskCard({
  task,
  projectKey,
  done,
  className,
}: {
  task: BoardTask;
  projectKey: string;
  done: boolean;
  className?: string;
}) {
  const t = useT();
  const due = task.dueDate ? formatDue(task.dueDate, done, t.intl) : null;
  const key = `${projectKey}-${task.number}`;
  return (
    <div
      className={cn(
        "cursor-grab rounded-lg border bg-card p-3 text-sm shadow-xs transition-colors hover:border-primary/40 active:cursor-grabbing",
        className,
      )}
    >
      <div className="mb-1 flex items-center gap-2 text-xs text-muted-foreground">
        <Link
          href={`?view=board&task=${key}`}
          scroll={false}
          onClick={(e) => e.stopPropagation()}
          className="font-mono hover:text-foreground hover:underline"
          tabIndex={-1}
        >
          {key}
        </Link>
        {task.priority !== "none" && <PriorityIcon priority={task.priority} className="ms-auto size-3.5" />}
      </div>
      <p className={cn("flex items-center gap-1.5 leading-snug font-medium", done && "text-muted-foreground line-through")}>
        {task.isMilestone && <MilestoneIcon />}
        {task.title}
        {task.recurrence && <RepeatIcon rule={task.recurrence} />}
      </p>
      {!done && task.blockedBy > 0 && <BlockedBadge count={task.blockedBy} className="mt-1.5" />}
      {!task.isMilestone && (task.progress > 0 || task.weight) && (
        <ProgressBar value={task.progress} label={t("{title} progress", { title: task.title })} className="mt-2" />
      )}
      {(task.weight || task.subtaskCount > 0) && (
        <div className="mt-1.5 flex items-center gap-3 text-xs text-muted-foreground tabular-nums">
          {task.weight && <span>{t("Weight {weight}%", { weight: String(Number(task.weight)) })}</span>}
          {task.subtaskCount > 0 && (
            <span className="flex items-center gap-1" title={t("Sub-tasks done")}>
              <ListTree className="size-3.5" aria-hidden />
              {task.subtaskDone}/{task.subtaskCount}
              <span className="sr-only">{t("sub-tasks done")}</span>
            </span>
          )}
        </div>
      )}
      {(due || task.assigneeName) && (
        <div className="mt-2.5 flex items-center gap-2">
          {due && (
            <span
              className={cn(
                "rounded px-1.5 py-0.5 text-xs tabular-nums",
                due.overdue ? "bg-destructive/10 font-medium text-destructive" : "bg-muted text-muted-foreground",
              )}
            >
              {due.overdue ? t("Overdue · {date}", { date: due.label }) : due.label}
            </span>
          )}
          {task.assigneeName && (
            <UserAvatar name={task.assigneeName} image={task.assigneeImage} className="ms-auto size-5" />
          )}
        </div>
      )}
    </div>
  );
}
