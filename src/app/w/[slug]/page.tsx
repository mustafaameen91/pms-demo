import Link from "next/link";
import type { Metadata } from "next";
import { FolderKanban } from "lucide-react";
import { requireWorkspace } from "@/lib/auth/session";
import { listProjects } from "@/lib/data/projects";
import { NewProjectButton } from "@/components/projects/new-project-button";

export const metadata: Metadata = { title: "Projects" };

export default async function ProjectsPage({ params }: PageProps<"/w/[slug]">) {
  const { slug } = await params;
  const { workspace } = await requireWorkspace(slug);
  const projects = await listProjects(workspace.id);

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-6 sm:px-6 lg:py-8">
      <div className="mb-6 flex items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Projects</h1>
          <p className="text-sm text-muted-foreground">
            {projects.length} {projects.length === 1 ? "project" : "projects"} in {workspace.name}
          </p>
        </div>
        {projects.length > 0 && <NewProjectButton workspaceSlug={workspace.slug} />}
      </div>

      {projects.length === 0 ? (
        <div className="flex flex-col items-center rounded-xl border border-dashed px-6 py-16 text-center">
          <div className="mb-4 grid size-12 place-items-center rounded-full bg-accent text-primary">
            <FolderKanban className="size-6" />
          </div>
          <h2 className="font-semibold">Create your first project</h2>
          <p className="mt-1 mb-6 max-w-sm text-sm text-muted-foreground">
            A project groups related tasks — a product launch, a client, or a team&apos;s ongoing work.
          </p>
          <NewProjectButton workspaceSlug={workspace.slug} />
        </div>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {projects.map((p) => {
            const done = p.taskCount - p.openCount;
            const pct = p.taskCount ? Math.round((done / p.taskCount) * 100) : 0;
            return (
              <li key={p.id}>
                <Link
                  href={`/w/${workspace.slug}/p/${p.key}`}
                  className="group flex h-full flex-col rounded-xl border bg-card p-4 transition-colors hover:border-primary/40 hover:bg-accent/40 focus-visible:outline-2 focus-visible:outline-ring"
                >
                  <div className="flex items-center gap-2">
                    <span aria-hidden className="size-3 rounded-sm" style={{ backgroundColor: p.color }} />
                    <span className="truncate font-medium">{p.name}</span>
                    <span className="ml-auto font-mono text-xs text-muted-foreground">{p.key}</span>
                  </div>
                  {p.description && (
                    <p className="mt-2 line-clamp-2 text-sm text-muted-foreground">{p.description}</p>
                  )}
                  <div className="mt-auto pt-4">
                    <div className="mb-1.5 flex justify-between text-xs text-muted-foreground tabular-nums">
                      <span>{p.openCount} open</span>
                      <span>{pct}% done</span>
                    </div>
                    <div
                      className="h-1.5 overflow-hidden rounded-full bg-muted"
                      role="progressbar"
                      aria-valuenow={pct}
                      aria-valuemin={0}
                      aria-valuemax={100}
                      aria-label={`${p.name} progress`}
                    >
                      <div className="h-full rounded-full bg-primary" style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
