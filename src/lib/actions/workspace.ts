"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { requireUser } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { organization } from "@/lib/db/schema";

export type FormState = { error?: string } | undefined;

const workspaceSchema = z.object({
  name: z.string().trim().min(2, "Name must be at least 2 characters").max(50),
});

function slugify(value: string) {
  return (
    value
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40) || "workspace"
  );
}

async function uniqueSlug(base: string) {
  let slug = base;
  for (let i = 2; ; i++) {
    const [taken] = await db
      .select({ id: organization.id })
      .from(organization)
      .where(eq(organization.slug, slug))
      .limit(1);
    if (!taken) return slug;
    slug = `${base}-${i}`;
  }
}

export async function createWorkspace(_prev: FormState, formData: FormData): Promise<FormState> {
  await requireUser();
  const parsed = workspaceSchema.safeParse({ name: formData.get("name") });
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const slug = await uniqueSlug(slugify(parsed.data.name));
  try {
    await auth.api.createOrganization({
      body: { name: parsed.data.name, slug },
      headers: await headers(),
    });
  } catch {
    return { error: "Could not create the workspace. Please try again." };
  }
  redirect(`/w/${slug}`);
}
