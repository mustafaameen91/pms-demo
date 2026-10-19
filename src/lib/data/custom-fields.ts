import "server-only";
import { asc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { customFields } from "@/lib/db/schema";
import type { FieldDef } from "@/lib/custom-fields";

/** Custom fields of a project (caller must have authorized the workspace). */
export async function getProjectFields(projectId: string): Promise<FieldDef[]> {
  const rows = await db.select().from(customFields).where(eq(customFields.projectId, projectId)).orderBy(asc(customFields.position));
  return rows.map((r) => ({ id: r.id, name: r.name, type: r.type as FieldDef["type"], options: r.options ?? null }));
}
