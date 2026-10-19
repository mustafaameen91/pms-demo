import type { Metadata } from "next";
import { asc, eq } from "drizzle-orm";
import { requireWorkspace } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { projectTemplates, user } from "@/lib/db/schema";
import { BUILTIN_TEMPLATES, templateDataSchema } from "@/lib/templates";
import { TemplatesView } from "@/components/projects/templates-view";

export const metadata: Metadata = { title: "Templates" };

export default async function TemplatesPage({ params }: PageProps<"/w/[slug]/templates">) {
  const { slug } = await params;
  const { user: me, workspace } = await requireWorkspace(slug);
  const rows = await db
    .select({ template: projectTemplates, createdByName: user.name })
    .from(projectTemplates)
    .leftJoin(user, eq(user.id, projectTemplates.createdById))
    .where(eq(projectTemplates.workspaceId, workspace.id))
    .orderBy(asc(projectTemplates.name));
  const isAdmin = workspace.role === "owner" || workspace.role === "admin";

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-6 sm:px-6 lg:py-8">
      <TemplatesView
        workspaceSlug={workspace.slug}
        builtins={BUILTIN_TEMPLATES}
        custom={rows.flatMap(({ template, createdByName }) => {
          const parsed = templateDataSchema.safeParse(template.data);
          return parsed.success
            ? [
                {
                  id: template.id,
                  name: template.name,
                  description: template.description,
                  createdByName,
                  data: parsed.data,
                  canDelete: isAdmin || template.createdById === me.id,
                },
              ]
            : [];
        })}
      />
    </div>
  );
}
