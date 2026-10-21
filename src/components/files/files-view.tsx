"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import {
  Download,
  FileArchive,
  FileImage,
  FileSpreadsheet,
  FileText,
  FolderOpen,
  History,
  Loader2,
  Pencil,
  PencilRuler,
  Search,
  Trash2,
  Upload,
} from "lucide-react";
import { toast } from "sonner";
import { deleteFile, fileHistory, updateFile, uploadFiles, uploadVersion } from "@/lib/actions/files";
import { FILE_CATEGORIES, fileSize } from "@/lib/files";
import { cn, formatDate, timeAgo } from "@/lib/utils";
import { useT } from "@/i18n/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { FieldError } from "@/components/projects/project-fields";
import { nativeSelectClass } from "@/components/resources/resource-fields";

const MAX_BYTES = 25 * 1024 * 1024;
const ACCEPT = ".pdf,.jpg,.jpeg,.png,.webp,.dwg,.dxf,.docx,.xlsx,.pptx,.zip";

export type FileItem = {
  id: string;
  name: string;
  category: string;
  description: string | null;
  taskId: string | null;
  taskNumber: number | null;
  taskTitle: string | null;
  currentVersion: number;
  createdById: string | null;
  versionId: string;
  originalName: string;
  mime: string;
  size: number;
  uploadedAt: string;
  uploadedByName: string | null;
};
type TaskOption = { id: string; number: number; title: string };

const fileUrl = (versionId: string, download = false) => `/api/files/project/${versionId}${download ? "?download=1" : ""}`;
const categoryLabel = (v: string) => FILE_CATEGORIES.find((c) => c.value === v)?.label ?? v;

function FileIcon({ mime, className }: { mime: string; className?: string }) {
  const Icon =
    mime === "image/vnd.dwg" || mime === "image/vnd.dxf"
      ? PencilRuler
      : mime.startsWith("image/")
        ? FileImage
        : mime.includes("spreadsheet")
          ? FileSpreadsheet
          : mime === "application/zip"
            ? FileArchive
            : FileText;
  return <Icon className={className} aria-hidden />;
}

export function FilesView({
  projectId,
  projectKey,
  tasksHref,
  files,
  tasks,
  canManage,
  currentUserId,
  initialTask,
}: {
  projectId: string;
  projectKey: string;
  tasksHref: string;
  files: FileItem[];
  tasks: TaskOption[];
  canManage: boolean;
  currentUserId: string;
  /** Opened from a task: show its files. */
  initialTask?: string;
}) {
  const t = useT();
  const [category, setCategory] = useState("");
  const [query, setQuery] = useState("");
  const [taskFilter, setTaskFilter] = useState(initialTask ?? "");
  const [dialog, setDialog] = useState<null | { kind: "upload" } | { kind: "version" | "history" | "edit"; file: FileItem }>(null);
  const canEdit = (f: FileItem) => canManage || f.createdById === currentUserId;
  const q = query.trim().toLowerCase();
  const shown = files.filter(
    (f) =>
      (!category || f.category === category) &&
      (!taskFilter || f.taskId === taskFilter) &&
      (!q || f.name.toLowerCase().includes(q) || f.originalName.toLowerCase().includes(q)),
  );
  const counts = new Map<string, number>();
  for (const f of files) counts.set(f.category, (counts.get(f.category) ?? 0) + 1);
  const close = () => setDialog(null);

  return (
    <div className="grid grid-cols-1 gap-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 id="files-heading" className="flex items-center gap-2 text-lg font-semibold">
            <FolderOpen className="size-5 text-primary" aria-hidden />
            {t("Files")}
          </h2>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            {t("Drawings, signed contracts, permits and photos for this project, kept on your server. Uploading a new version keeps the old ones.")}
          </p>
        </div>
        <Button onClick={() => setDialog({ kind: "upload" })}>
          <Upload className="size-4" />
          {t("Upload files")}
        </Button>
      </header>

      <section aria-labelledby="files-heading" className="rounded-xl border bg-card">
        <div className="flex flex-wrap items-center gap-3 border-b px-4 py-3">
          <div role="group" aria-label={t("Category")} className="flex flex-wrap gap-1.5">
            {[{ value: "", label: "All" }, ...FILE_CATEGORIES].map((c) => {
              const n = c.value ? (counts.get(c.value) ?? 0) : files.length;
              return (
                <button
                  key={c.value || "all"}
                  type="button"
                  aria-pressed={category === c.value}
                  onClick={() => setCategory(c.value)}
                  className={cn(
                    "inline-flex min-h-8 cursor-pointer items-center gap-1.5 rounded-full border px-3 text-sm text-muted-foreground hover:text-foreground",
                    category === c.value && "border-primary bg-primary/10 font-medium text-foreground",
                  )}
                >
                  {t(c.label)} <span className="text-xs tabular-nums">{n}</span>
                </button>
              );
            })}
          </div>
          <div className="ms-auto flex flex-wrap items-center gap-2">
            {taskFilter && (
              <select value={taskFilter} onChange={(e) => setTaskFilter(e.target.value)} className={cn(nativeSelectClass, "h-8 w-56")} aria-label={t("Task")}>
                <option value="">{t("All tasks")}</option>
                {tasks.map((task) => (
                  <option key={task.id} value={task.id}>
                    #{task.number} {task.title}
                  </option>
                ))}
              </select>
            )}
            <div className="relative">
              <Search className="pointer-events-none absolute start-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
              <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t("Search files")} aria-label={t("Search files")} className="h-8 w-56 ps-8" />
            </div>
          </div>
        </div>

        {shown.length === 0 ? (
          <p className="px-4 py-10 text-center text-sm text-muted-foreground">
            {files.length === 0 ? t("No files yet. Upload the project's drawings, contracts and permits so everyone works from the latest version.") : t("No files match.")}
          </p>
        ) : (
          <ul className="divide-y">
            {shown.map((f) => (
              <li key={f.id} className="flex flex-wrap items-center gap-3 px-4 py-3 text-sm">
                <a href={fileUrl(f.versionId)} target="_blank" rel="noreferrer" className="shrink-0" tabIndex={-1} aria-hidden>
                  {f.mime.startsWith("image/") && f.mime !== "image/vnd.dwg" && f.mime !== "image/vnd.dxf" ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={fileUrl(f.versionId)} alt="" loading="lazy" className="size-11 rounded-md border object-cover" />
                  ) : (
                    <span className="flex size-11 items-center justify-center rounded-md border bg-muted/50">
                      <FileIcon mime={f.mime} className="size-5 text-muted-foreground" />
                    </span>
                  )}
                </a>
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-2">
                    <a href={fileUrl(f.versionId)} target="_blank" rel="noreferrer" className="font-medium hover:underline" dir="auto">
                      {f.name}
                    </a>
                    <span className="rounded-full border px-1.5 text-[11px] font-medium text-muted-foreground tabular-nums">v{f.currentVersion}</span>
                    <span className="rounded-full bg-muted px-1.5 text-[11px] text-muted-foreground">{t(categoryLabel(f.category))}</span>
                  </p>
                  <p className="mt-0.5 flex flex-wrap gap-x-2 text-xs text-muted-foreground">
                    <bdi dir="ltr">{fileSize(f.size, t.intl)}</bdi>
                    <span>
                      {f.uploadedByName ? t("{name}, {when}", { name: f.uploadedByName, when: timeAgo(f.uploadedAt, t.intl, t("just now")) }) : timeAgo(f.uploadedAt, t.intl, t("just now"))}
                    </span>
                    {f.taskNumber && (
                      <Link href={`${tasksHref}?task=${projectKey}-${f.taskNumber}`} className="text-primary hover:underline">
                        {projectKey}-{f.taskNumber} {f.taskTitle}
                      </Link>
                    )}
                  </p>
                  {f.description && <p className="mt-0.5 text-xs" dir="auto">{f.description}</p>}
                </div>
                <div className="flex flex-wrap gap-1">
                  <Button asChild variant="ghost" size="sm">
                    <a href={fileUrl(f.versionId, true)} aria-label={t("Download {name}", { name: f.name })}>
                      <Download className="size-4" />
                    </a>
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => setDialog({ kind: "version", file: f })} aria-label={t("Upload a new version of {name}", { name: f.name })}>
                    <Upload className="size-4" />
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => setDialog({ kind: "history", file: f })} aria-label={t("Versions of {name}", { name: f.name })}>
                    <History className="size-4" />
                  </Button>
                  {canEdit(f) && (
                    <Button variant="ghost" size="sm" onClick={() => setDialog({ kind: "edit", file: f })} aria-label={t("Edit {name}", { name: f.name })}>
                      <Pencil className="size-4" />
                    </Button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <Dialog open={dialog !== null} onOpenChange={(o) => !o && close()}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
          {dialog?.kind === "upload" && <UploadForm projectId={projectId} tasks={tasks} defaultTask={taskFilter} onDone={close} />}
          {dialog?.kind === "version" && <VersionForm file={dialog.file} onDone={close} />}
          {dialog?.kind === "history" && <HistoryList file={dialog.file} />}
          {dialog?.kind === "edit" && <EditForm file={dialog.file} tasks={tasks} onDone={close} />}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function FilePicker({ id, multiple, onChange, error }: { id: string; multiple?: boolean; onChange: (files: File[]) => void; error?: string }) {
  const t = useT();
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={id}>{multiple ? t("Files") : t("File")}</Label>
      <Input
        id={id}
        type="file"
        multiple={multiple}
        accept={ACCEPT}
        onChange={(e) => onChange([...(e.target.files ?? [])])}
        className="cursor-pointer file:me-3 file:cursor-pointer"
        aria-describedby={`${id}-help`}
        aria-invalid={Boolean(error)}
      />
      <p id={`${id}-help`} className="text-xs text-muted-foreground">
        {t("PDF, images, drawings (DWG, DXF), Word, Excel, PowerPoint or ZIP, up to 25 MB each.")}
      </p>
      <FieldError message={error} />
    </div>
  );
}

/** Too big files are caught before uploading (the server checks again). */
function tooBig(files: File[], t: ReturnType<typeof useT>) {
  const big = files.find((f) => f.size > MAX_BYTES);
  return big ? t("{name} is larger than 25 MB.", { name: big.name }) : null;
}

function UploadForm({ projectId, tasks, defaultTask, onDone }: { projectId: string; tasks: TaskOption[]; defaultTask: string; onDone: () => void }) {
  const t = useT();
  const [files, setFiles] = useState<File[]>([]);
  const [category, setCategory] = useState("auto");
  const [taskId, setTaskId] = useState(defaultTask);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string>();
  const [pending, startTransition] = useTransition();
  return (
    <form
      className="grid gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        const big = tooBig(files, t);
        if (big) return setError(big);
        const data = new FormData();
        for (const f of files) data.append("file", f);
        data.set("category", category);
        data.set("taskId", taskId);
        data.set("note", note);
        startTransition(async () => {
          const res = await uploadFiles(projectId, data);
          if (!res.ok) return setError(res.error);
          toast.success(t.plural(res.data!.count, "{count} file uploaded", "{count} files uploaded"));
          onDone();
        });
      }}
    >
      <DialogHeader>
        <DialogTitle>{t("Upload files")}</DialogTitle>
        <DialogDescription>{t("Everyone on the project team can see and download them.")}</DialogDescription>
      </DialogHeader>
      <FilePicker id="upload-files" multiple onChange={(f) => (setFiles(f), setError(undefined))} error={error} />
      {files.length > 0 && (
        <ul className="grid gap-1 rounded-lg border bg-muted/40 px-3 py-2 text-xs">
          {files.map((f) => (
            <li key={f.name + f.size} className="flex justify-between gap-2">
              <span className="min-w-0 truncate" dir="auto">{f.name}</span>
              <bdi dir="ltr" className={cn("shrink-0 tabular-nums", f.size > MAX_BYTES && "font-medium text-destructive")}>{fileSize(f.size, t.intl)}</bdi>
            </li>
          ))}
        </ul>
      )}
      <div className="grid items-start gap-4 sm:grid-cols-2">
        <div className="grid gap-1.5">
          <Label htmlFor="upload-category">{t("Category")}</Label>
          <select id="upload-category" value={category} onChange={(e) => setCategory(e.target.value)} className={nativeSelectClass}>
            <option value="auto">{t("Choose automatically")}</option>
            {FILE_CATEGORIES.map((c) => (
              <option key={c.value} value={c.value}>
                {t(c.label)}
              </option>
            ))}
          </select>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="upload-task">{t("Task")}</Label>
          <select id="upload-task" value={taskId} onChange={(e) => setTaskId(e.target.value)} className={nativeSelectClass}>
            <option value="">{t("Whole project")}</option>
            {tasks.map((task) => (
              <option key={task.id} value={task.id}>
                #{task.number} {task.title}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="upload-note">
          {t("Note")} <span className="font-normal text-muted-foreground">{t("(optional)")}</span>
        </Label>
        <Input id="upload-note" dir="auto" value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} />
      </div>
      <DialogFooter>
        <Button type="button" variant="ghost" onClick={onDone}>
          {t("Cancel")}
        </Button>
        <Button type="submit" disabled={pending || files.length === 0}>
          {pending ? <Loader2 className="size-4 animate-spin" /> : <Upload className="size-4" />}
          {pending ? t("Uploading…") : t("Upload")}
        </Button>
      </DialogFooter>
    </form>
  );
}

function VersionForm({ file, onDone }: { file: FileItem; onDone: () => void }) {
  const t = useT();
  const [upload, setUpload] = useState<File[]>([]);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string>();
  const [pending, startTransition] = useTransition();
  return (
    <form
      className="grid gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        const big = tooBig(upload, t);
        if (big) return setError(big);
        const data = new FormData();
        if (upload[0]) data.set("file", upload[0]);
        data.set("note", note);
        startTransition(async () => {
          const res = await uploadVersion(file.id, data);
          if (!res.ok) return setError(res.error);
          toast.success(t("Version {n} uploaded", { n: res.data!.version }));
          onDone();
        });
      }}
    >
      <DialogHeader>
        <DialogTitle>{t("New version of {name}", { name: file.name })}</DialogTitle>
        <DialogDescription>{t("This becomes version {n}. Version {current} and older stay in the history.", { n: file.currentVersion + 1, current: file.currentVersion })}</DialogDescription>
      </DialogHeader>
      <FilePicker id="version-file" onChange={(f) => (setUpload(f), setError(undefined))} error={error} />
      <div className="grid gap-1.5">
        <Label htmlFor="version-note">{t("What changed?")}</Label>
        <Input id="version-note" dir="auto" value={note} onChange={(e) => setNote(e.target.value)} placeholder={t("Revision B: column sizes updated")} maxLength={500} />
      </div>
      <DialogFooter>
        <Button type="button" variant="ghost" onClick={onDone}>
          {t("Cancel")}
        </Button>
        <Button type="submit" disabled={pending || upload.length === 0}>
          {pending ? <Loader2 className="size-4 animate-spin" /> : <Upload className="size-4" />}
          {pending ? t("Uploading…") : t("Upload version")}
        </Button>
      </DialogFooter>
    </form>
  );
}

function HistoryList({ file }: { file: FileItem }) {
  const t = useT();
  const [versions, setVersions] = useState<Awaited<ReturnType<typeof fileHistory>> | null>(null);
  useEffect(() => {
    let live = true;
    fileHistory(file.id).then((v) => live && setVersions(v));
    return () => {
      live = false;
    };
  }, [file.id]);
  return (
    <div className="grid gap-4">
      <DialogHeader>
        <DialogTitle>{t("Versions of {name}", { name: file.name })}</DialogTitle>
        <DialogDescription>{t("Every upload is kept. The newest is the one everyone sees first.")}</DialogDescription>
      </DialogHeader>
      {versions === null ? (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" aria-hidden />
          {t("Loading…")}
        </p>
      ) : (
        <ol className="grid gap-2">
          {versions.map((v) => (
            <li key={v.id} className={cn("flex flex-wrap items-center gap-3 rounded-lg border px-3 py-2 text-sm", v.version === file.currentVersion && "border-primary/40 bg-primary/5")}>
              <span className="w-10 font-mono text-xs font-semibold tabular-nums">v{v.version}</span>
              <span className="min-w-0 flex-1">
                <span className="block truncate" dir="auto">{v.originalName}</span>
                <span className="block text-xs text-muted-foreground">
                  {formatDate(v.createdAt.slice(0, 10), t.intl)} · {v.uploadedByName ?? "—"} · <bdi dir="ltr">{fileSize(v.size, t.intl)}</bdi>
                </span>
                {v.note && <span className="block text-xs" dir="auto">“{v.note}”</span>}
              </span>
              {v.version === file.currentVersion && <span className="text-xs font-medium text-primary">{t("Current")}</span>}
              <Button asChild variant="ghost" size="sm">
                <a href={fileUrl(v.id, true)} aria-label={t("Download version {n}", { n: v.version })}>
                  <Download className="size-4" />
                </a>
              </Button>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

function EditForm({ file, tasks, onDone }: { file: FileItem; tasks: TaskOption[]; onDone: () => void }) {
  const t = useT();
  const [form, setForm] = useState({ name: file.name, category: file.category, taskId: file.taskId ?? "", description: file.description ?? "" });
  const [error, setError] = useState<string>();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [pending, startTransition] = useTransition();
  return (
    <form
      className="grid gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        startTransition(async () => {
          const res = await updateFile(file.id, form);
          if (!res.ok) return setError(res.error);
          toast.success(t("Saved"));
          onDone();
        });
      }}
    >
      <DialogHeader>
        <DialogTitle>{t("Edit file")}</DialogTitle>
        <DialogDescription dir="auto">{file.originalName}</DialogDescription>
      </DialogHeader>
      <div className="grid gap-1.5">
        <Label htmlFor="edit-file-name">{t("Name")}</Label>
        <Input id="edit-file-name" dir="auto" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} maxLength={200} />
      </div>
      <div className="grid items-start gap-4 sm:grid-cols-2">
        <div className="grid gap-1.5">
          <Label htmlFor="edit-file-category">{t("Category")}</Label>
          <select id="edit-file-category" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} className={nativeSelectClass}>
            {FILE_CATEGORIES.map((c) => (
              <option key={c.value} value={c.value}>
                {t(c.label)}
              </option>
            ))}
          </select>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="edit-file-task">{t("Task")}</Label>
          <select id="edit-file-task" value={form.taskId} onChange={(e) => setForm({ ...form, taskId: e.target.value })} className={nativeSelectClass}>
            <option value="">{t("Whole project")}</option>
            {tasks.map((task) => (
              <option key={task.id} value={task.id}>
                #{task.number} {task.title}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="edit-file-description">
          {t("Description")} <span className="font-normal text-muted-foreground">{t("(optional)")}</span>
        </Label>
        <Textarea id="edit-file-description" dir="auto" rows={2} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} maxLength={1000} />
      </div>
      <FieldError message={error} />
      <DialogFooter className="sm:justify-between">
        <Button
          type="button"
          variant={confirmDelete ? "destructive" : "ghost"}
          disabled={pending}
          onBlur={() => setConfirmDelete(false)}
          onClick={() => {
            if (!confirmDelete) return setConfirmDelete(true);
            startTransition(async () => {
              const res = await deleteFile(file.id);
              if (!res.ok) return void toast.error(res.error);
              toast.success(t("File deleted"));
              onDone();
            });
          }}
        >
          <Trash2 className="size-4" />
          {confirmDelete ? t("Delete all {n} versions", { n: file.currentVersion }) : t("Delete")}
        </Button>
        <div className="flex gap-2">
          <Button type="button" variant="ghost" onClick={onDone}>
            {t("Cancel")}
          </Button>
          <Button type="submit" disabled={pending}>
            {pending && <Loader2 className="size-4 animate-spin" />}
            {t("Save")}
          </Button>
        </div>
      </DialogFooter>
    </form>
  );
}
