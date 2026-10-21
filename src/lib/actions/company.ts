"use server";

import { refresh } from "next/cache";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { requireWorkspace } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { activities, companyProfiles } from "@/lib/db/schema";
import { isWorkspaceAdmin } from "@/lib/permissions";
import { PAPER_STYLES, isHexColor } from "@/lib/branding";
import { deleteStoredFile, saveImage } from "@/lib/uploads";
import { getT } from "@/i18n/server";

type Result = { ok: true } | { ok: false; error: string; fieldErrors?: Record<string, string> };

const text = (max: number) => z.string().trim().max(max).optional().transform((v) => v || null);
const profileSchema = z.object({
  nameEn: text(160),
  nameAr: text(160),
  addressEn: text(300),
  addressAr: text(300),
  phone: text(60),
  email: z
    .string()
    .trim()
    .max(160)
    .optional()
    .transform((v) => v || null)
    .refine((v) => v === null || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v), "Enter a valid email address"),
  website: text(160),
  registrationNo: text(80),
  taxNo: text(80),
  footerEn: text(300),
  footerAr: text(300),
  brandColor: z.string().refine(isHexColor, "Choose a colour like #0D9488"),
  defaultStyle: z.enum(PAPER_STYLES.map((s) => s.value) as [string, ...string[]]),
  defaultLanguage: z.enum(["ar", "en"]),
});

/** Owners and admins set the company's letterhead (with an optional new logo / stamp). */
export async function saveCompanyProfile(slug: string, formData: FormData): Promise<Result> {
  const t = await getT();
  const { user, workspace } = await requireWorkspace(slug);
  if (!isWorkspaceAdmin(workspace.role)) return { ok: false, error: t("Only workspace owners and admins can change the company profile.") };

  const raw = Object.fromEntries(Object.keys(profileSchema.shape).map((k) => [k, formData.get(k) ?? undefined]));
  const parsed = profileSchema.safeParse(raw);
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) fieldErrors[String(issue.path[0])] ??= t(issue.message);
    return { ok: false, error: t(parsed.error.issues[0].message), fieldErrors };
  }
  const d = parsed.data;
  if (!d.nameEn && !d.nameAr) {
    const msg = t("Enter the company name in at least one language.");
    return { ok: false, error: msg, fieldErrors: { nameEn: msg } };
  }

  const [existing] = await db.select().from(companyProfiles).where(eq(companyProfiles.workspaceId, workspace.id)).limit(1);
  const images: Partial<typeof companyProfiles.$inferInsert> = {};
  const replaced: (string | null | undefined)[] = [];
  const saved: string[] = [];
  for (const kind of ["logo", "stamp"] as const) {
    const file = formData.get(kind);
    if (file instanceof File && file.size > 0) {
      const result = await saveImage(workspace.id, file, t);
      if ("error" in result) {
        for (const p of saved) await deleteStoredFile(p);
        return { ok: false, error: result.error, fieldErrors: { [kind]: result.error } };
      }
      saved.push(result.path);
      images[`${kind}Path`] = result.path;
      images[`${kind}Type`] = result.type;
      replaced.push(existing?.[`${kind}Path`]);
    } else if (formData.get(`remove_${kind}`) === "1") {
      images[`${kind}Path`] = null;
      images[`${kind}Type`] = null;
      replaced.push(existing?.[`${kind}Path`]);
    }
  }

  const values = { ...d, ...images, updatedById: user.id, updatedAt: new Date() };
  try {
    await db
      .insert(companyProfiles)
      .values({ ...values, workspaceId: workspace.id })
      .onConflictDoUpdate({ target: companyProfiles.workspaceId, set: values });
  } catch (error) {
    for (const p of saved) await deleteStoredFile(p);
    throw error;
  }
  for (const p of replaced) await deleteStoredFile(p);
  await db.insert(activities).values({ workspaceId: workspace.id, actorId: user.id, type: "company.updated", data: {} });
  refresh();
  return { ok: true };
}
