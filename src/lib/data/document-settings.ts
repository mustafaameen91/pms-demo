import "server-only";
import { cache } from "react";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { documentTypeSettings } from "@/lib/db/schema";
import { DOC_TYPES, type DocTypeDef } from "@/lib/documents/types";
import { applySettings, settingsSchema, type DocTypeSettings } from "@/lib/documents/customize";

/** A company's saved adjustments per type (bad / old data is ignored, never fatal). */
export const getTypeSettings = cache(async (workspaceId: string) => {
  const rows = await db.select().from(documentTypeSettings).where(eq(documentTypeSettings.workspaceId, workspaceId));
  const map = new Map<string, { enabled: boolean; settings: DocTypeSettings }>();
  for (const r of rows) {
    const parsed = settingsSchema.safeParse(r.settings);
    map.set(r.type, { enabled: r.enabled, settings: parsed.success ? parsed.data : settingsSchema.parse({}) });
  }
  return map;
});

/** Every type as this company uses it, with whether it's turned on. */
export async function getCompanyTypes(workspaceId: string): Promise<(DocTypeDef & { enabled: boolean })[]> {
  const map = await getTypeSettings(workspaceId);
  return DOC_TYPES.map((def) => {
    const s = map.get(def.key);
    return { ...applySettings(def, s?.settings), enabled: s?.enabled ?? true };
  });
}

export async function getCompanyType(workspaceId: string, type: string) {
  return (await getCompanyTypes(workspaceId)).find((d) => d.key === type) ?? null;
}
