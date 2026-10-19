"use client";

import { useRef, useState, useTransition } from "react";
import { Loader2, Plus } from "lucide-react";
import { toast } from "sonner";
import { createTask } from "@/lib/actions/tasks";
import { cn } from "@/lib/utils";

export function QuickAddTask({
  projectId,
  statusId,
  className,
}: {
  projectId: string;
  /** Column to add into; omitted = the project's default "To do" status. */
  statusId?: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [pending, startTransition] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);

  function submit() {
    const value = title.trim();
    if (!value) {
      setOpen(false);
      return;
    }
    startTransition(async () => {
      const result = await createTask({ projectId, statusId, title: value });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      if (result.info) toast.success(result.info);
      setTitle("");
      inputRef.current?.focus(); // stay open for rapid entry
    });
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={cn(
          "flex h-8 w-full items-center gap-1.5 rounded-md px-2 text-sm text-muted-foreground transition-colors hover:bg-background hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring",
          className,
        )}
      >
        <Plus className="size-4" />
        Add task
      </button>
    );
  }

  return (
    <form
      className={cn("relative", className)}
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <label htmlFor={`quick-add-${statusId ?? "default"}`} className="sr-only">
        Task title
      </label>
      <input
        ref={inputRef}
        id={`quick-add-${statusId ?? "default"}`}
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            setTitle("");
            setOpen(false);
          }
        }}
        onBlur={() => !title.trim() && !pending && setOpen(false)}
        placeholder="Task title — Enter to save, Esc to cancel"
        maxLength={300}
        autoFocus
        disabled={pending}
        className="h-9 w-full rounded-md border bg-card px-2.5 pe-8 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
      />
      {pending && <Loader2 className="absolute top-2.5 inset-e-2.5 size-4 animate-spin text-muted-foreground" />}
    </form>
  );
}
