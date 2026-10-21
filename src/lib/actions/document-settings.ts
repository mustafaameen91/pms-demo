"use server";

import { refresh } from "next/cache";
import { and, eq } from "drizzle-orm";
import { requireWorkspace } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { activities, documentTypeSettings } from "@/lib/db/schema";
import { isWorkspaceAdmin } from "@/lib/permissions";
import { docType, isDocType } from "@/lib/documents/types";
import { isLockedField, settingsSchema, type DocTypeSettingsInput } from "@/lib/documents/customize";
import { getT } from "@/i18n/server";

type Result = { ok: true } | { ok: false; error: string; fieldErrors?: Record<string, string> };
const ADMINS_ONLY = "Only workspace owners and admins can change the document forms.";

async function authorize(slug: string, type: string) {
  const t = await getT();
  const { user, workspace } = await requireWorkspace(slug);
  if (!isWorkspaceAdmin(workspace.role)) return { error: t(ADMINS_ONLY) } as const;
  if (!isDocType(type)) return { error: t("Choose a document type") } as const;
  return { user, workspace, t } as const;
}

async function log(workspaceId: string, actorId: string, type: string, event: string) {
  const def = docType(type)!;
  await db.insert(activities).values({ workspaceId, actorId, type: event, data: { kind_en: def.title.en, kind_ar: def.title.ar } });
}

/** Save how this company wants a document type to look (new documents only). */
export async function saveDocTypeSettings(slug: string, type: string, input: DocTypeSettingsInput): Promise<Result> {
  const auth = await authorize(slug, type);
  if ("error" in auth) return { ok: false, error: auth.error! };
  const { t, workspace, user } = auth;
  const parsed = settingsSchema.safeParse(input);
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) fieldErrors[issue.path.join(".")] ??= t(issue.message);
    return { ok: false, error: t(parsed.error.issues[0].message), fieldErrors };
  }
  const def = docType(type)!;
  const settings = {
    ...parsed.data,
    // Fields the document needs can't be hidden; unknown keys are dropped.
    hidden: (parsed.data.hidden ?? []).filter((k) => def.fields.some((f) => f.key === k) && !isLockedField(def, k)),
  };
  await db
    .insert(documentTypeSettings)
    .values({ workspaceId: workspace.id, type, settings, updatedById: user.id })
    .onConflictDoUpdate({
      target: [documentTypeSettings.workspaceId, documentTypeSettings.type],
      set: { settings, updatedById: user.id, updatedAt: new Date() },
    });
  await log(workspace.id, user.id, type, "document_form.updated");
  refresh();
  return { ok: true };
}

/** Turn a type on or off in the "New document" list. */
export async function setDocTypeEnabled(slug: string, type: string, enabled: boolean): Promise<Result> {
  const auth = await authorize(slug, type);
  if ("error" in auth) return { ok: false, error: auth.error! };
  const { workspace, user } = auth;
  await db
    .insert(documentTypeSettings)
    .values({ workspaceId: workspace.id, type, enabled, updatedById: user.id })
    .onConflictDoUpdate({ target: [documentTypeSettings.workspaceId, documentTypeSettings.type], set: { enabled, updatedById: user.id, updatedAt: new Date() } });
  await log(workspace.id, user.id, type, enabled ? "document_form.enabled" : "document_form.disabled");
  refresh();
  return { ok: true };
}

/** Back to the built-in form (stays on / off as it was). */
export async function resetDocType(slug: string, type: string): Promise<Result> {
  const auth = await authorize(slug, type);
  if ("error" in auth) return { ok: false, error: auth.error! };
  const { workspace, user } = auth;
  await db
    .update(documentTypeSettings)
    .set({ settings: {}, updatedById: user.id, updatedAt: new Date() })
    .where(and(eq(documentTypeSettings.workspaceId, workspace.id), eq(documentTypeSettings.type, type)));
  await log(workspace.id, user.id, type, "document_form.reset");
  refresh();
  return { ok: true };
}
