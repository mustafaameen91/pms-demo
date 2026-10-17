"use client";

import { Fragment, useId, useLayoutEffect, useRef, useState, useTransition } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { addComment, deleteComment, editComment } from "@/lib/actions/comments";
import type { TaskDetail, WorkspaceMember } from "@/lib/data/projects";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { UserAvatar, timeAgo } from "./task-bits";

type Comment = TaskDetail["comments"][number];

export function Comments({
  taskId,
  comments,
  members,
  currentUserId,
  isAdmin,
}: {
  taskId: string;
  comments: Comment[];
  members: WorkspaceMember[];
  currentUserId: string;
  isAdmin: boolean;
}) {
  const [editing, setEditing] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <section aria-labelledby="comments-heading" className="grid gap-3">
      <h3 id="comments-heading" className="text-sm font-medium">
        Comments {comments.length > 0 && <span className="text-xs font-normal text-muted-foreground">{comments.length}</span>}
      </h3>

      {comments.length > 0 && (
        <ol className="grid gap-4">
          {comments.map((c) => {
            const mine = c.authorId === currentUserId;
            return (
              <li key={c.id} className="flex gap-2.5">
                <UserAvatar name={c.author?.name ?? "?"} image={c.author?.image} className="size-7" />
                <div className="min-w-0 flex-1">
                  <p className="text-xs text-muted-foreground">
                    <span className="font-medium text-foreground">{c.author?.name ?? "Former member"}</span> ·{" "}
                    <time
                      dateTime={new Date(c.createdAt).toISOString()}
                      title={new Date(c.createdAt).toLocaleString()}
                      suppressHydrationWarning
                    >
                      {timeAgo(new Date(c.createdAt))}
                    </time>
                    {c.editedAt && " · edited"}
                  </p>
                  {editing === c.id ? (
                    <Composer
                      members={members}
                      initialBody={c.body}
                      initialMentions={c.mentions}
                      submitLabel="Save"
                      onCancel={() => setEditing(null)}
                      onSubmit={async (body, mentions) => {
                        const result = await editComment(c.id, { body, mentions });
                        if (!result.ok) toast.error(result.error);
                        else setEditing(null);
                        return result.ok;
                      }}
                    />
                  ) : (
                    <>
                      <p className="mt-1 text-sm break-words whitespace-pre-wrap">
                        <MentionText body={c.body} mentions={c.mentions} members={members} currentUserId={currentUserId} />
                      </p>
                      {(mine || isAdmin) && (
                        <div className="mt-1 flex gap-3 text-xs">
                          {mine && (
                            <button type="button" className="text-muted-foreground hover:text-foreground hover:underline" onClick={() => setEditing(c.id)}>
                              Edit
                            </button>
                          )}
                          <button
                            type="button"
                            disabled={pending}
                            className="text-muted-foreground hover:text-destructive hover:underline"
                            onClick={() =>
                              startTransition(async () => {
                                const result = await deleteComment(c.id);
                                if (!result.ok) toast.error(result.error);
                              })
                            }
                          >
                            Delete
                          </button>
                        </div>
                      )}
                    </>
                  )}
                </div>
              </li>
            );
          })}
        </ol>
      )}

      <Composer
        members={members}
        submitLabel="Comment"
        onSubmit={async (body, mentions) => {
          const result = await addComment(taskId, { body, mentions });
          if (!result.ok) toast.error(result.error);
          return result.ok;
        }}
      />
    </section>
  );
}

/** Renders a comment, highlighting @mentions of real members. */
function MentionText({
  body,
  mentions,
  members,
  currentUserId,
}: {
  body: string;
  mentions: string[];
  members: WorkspaceMember[];
  currentUserId: string;
}) {
  const named = members.filter((m) => mentions.includes(m.id));
  if (named.length === 0) return <>{body}</>;
  const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  // Longest names first so "@Ali Hassan" wins over "@Ali".
  const pattern = new RegExp(`(${named.map((m) => `@${escape(m.name)}`).sort((a, b) => b.length - a.length).join("|")})`, "g");
  return (
    <>
      {body.split(pattern).map((part, i) => {
        const m = named.find((x) => `@${x.name}` === part);
        if (!m) return <Fragment key={i}>{part}</Fragment>;
        return (
          <span
            key={i}
            className={cn(
              "rounded px-0.5 font-medium text-primary",
              m.id === currentUserId ? "bg-brand-accent/15" : "bg-primary/10",
            )}
          >
            {part}
          </span>
        );
      })}
    </>
  );
}

/** Text box with "@" suggestions. Tracks which members were mentioned. */
function Composer({
  members,
  initialBody = "",
  initialMentions = [],
  submitLabel,
  onSubmit,
  onCancel,
}: {
  members: WorkspaceMember[];
  initialBody?: string;
  initialMentions?: string[];
  submitLabel: string;
  onSubmit: (body: string, mentions: string[]) => Promise<boolean>;
  onCancel?: () => void;
}) {
  const [body, setBody] = useState(initialBody);
  const [mentions, setMentions] = useState<string[]>(initialMentions);
  const [query, setQuery] = useState<string | null>(null);
  const [active, setActive] = useState(0);
  const [pending, startTransition] = useTransition();
  const ref = useRef<HTMLTextAreaElement>(null);
  const listId = useId();
  // Where the caret goes after inserting a mention; applied right after React
  // updates the text, before the next keystroke can land in the wrong place.
  const pendingCaret = useRef<number | null>(null);
  useLayoutEffect(() => {
    if (pendingCaret.current === null || !ref.current) return;
    ref.current.setSelectionRange(pendingCaret.current, pendingCaret.current);
    pendingCaret.current = null;
  }, [body]);

  const suggestions =
    query === null ? [] : members.filter((m) => m.name.toLowerCase().includes(query.toLowerCase())).slice(0, 6);
  const open = suggestions.length > 0;

  function updateQuery(value: string, caret: number) {
    const match = /(?:^|\s)@([^\s@]{0,30})$/.exec(value.slice(0, caret));
    setQuery(match ? match[1] : null);
    setActive(0);
  }

  function pick(m: WorkspaceMember) {
    const el = ref.current!;
    const caret = el.selectionStart;
    const before = body.slice(0, caret).replace(/@([^\s@]{0,30})$/, `@${m.name} `);
    const next = before + body.slice(caret);
    pendingCaret.current = before.length;
    setBody(next);
    setMentions((prev) => (prev.includes(m.id) ? prev : [...prev, m.id]));
    setQuery(null);
    el.focus();
  }

  function submit() {
    if (!body.trim()) return;
    startTransition(async () => {
      if (await onSubmit(body.trim(), mentions)) {
        if (!onCancel) {
          setBody("");
          setMentions([]);
        }
      }
    });
  }

  return (
    <div className="relative mt-1">
      <label htmlFor={`${listId}-input`} className="sr-only">
        {onCancel ? "Edit comment" : "Write a comment"}
      </label>
      <textarea
        id={`${listId}-input`}
        ref={ref}
        value={body}
        rows={onCancel ? 3 : 2}
        maxLength={5000}
        placeholder="Write a comment… type @ to mention someone"
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={open ? `${listId}-${active}` : undefined}
        onChange={(e) => {
          setBody(e.target.value);
          updateQuery(e.target.value, e.target.selectionStart);
        }}
        onKeyDown={(e) => {
          if (open) {
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setActive((a) => (a + 1) % suggestions.length);
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setActive((a) => (a - 1 + suggestions.length) % suggestions.length);
            } else if (e.key === "Enter" || e.key === "Tab") {
              e.preventDefault();
              pick(suggestions[active]);
            } else if (e.key === "Escape") {
              e.preventDefault();
              e.stopPropagation(); // don't close the task panel
              setQuery(null);
            }
            return;
          }
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
            e.preventDefault();
            submit();
          }
          if (e.key === "Escape" && onCancel) {
            e.stopPropagation();
            onCancel();
          }
        }}
        onBlur={() => setTimeout(() => setQuery(null), 150)}
        className="field-sizing-content min-h-16 w-full min-w-0 resize-none rounded-lg border border-input bg-transparent px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring dark:bg-input/30"
      />
      {open && (
        <ul id={listId} role="listbox" className="absolute z-50 mt-1 w-64 overflow-hidden rounded-lg border bg-popover py-1 text-sm shadow-md">
          {suggestions.map((m, i) => (
            <li
              key={m.id}
              id={`${listId}-${i}`}
              role="option"
              aria-selected={i === active}
              onMouseDown={(e) => {
                e.preventDefault();
                pick(m);
              }}
              onMouseEnter={() => setActive(i)}
              className={cn("flex cursor-pointer items-center gap-2 px-3 py-1.5", i === active && "bg-accent")}
            >
              <UserAvatar name={m.name} image={m.image} className="size-5" />
              <span className="truncate">{m.name}</span>
              <span className="ml-auto truncate text-xs text-muted-foreground">{m.email}</span>
            </li>
          ))}
        </ul>
      )}
      <div className="mt-2 flex items-center justify-end gap-2">
        <span className="mr-auto text-xs text-muted-foreground">Ctrl/⌘ + Enter to send</span>
        {onCancel && (
          <Button type="button" variant="ghost" size="sm" onClick={onCancel}>
            Cancel
          </Button>
        )}
        <Button type="button" size="sm" onClick={submit} disabled={pending || !body.trim()}>
          {pending && <Loader2 className="size-4 animate-spin" />}
          {submitLabel}
        </Button>
      </div>
    </div>
  );
}
