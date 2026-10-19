"use server";

import { cookies } from "next/headers";
import { eq } from "drizzle-orm";
import { getSession } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { user } from "@/lib/db/schema";
import { LOCALE_COOKIE, isLocale } from "@/i18n/config";

/** Switches the screen language for this browser, and the signed-in person's email/notification language. */
export async function setLanguage(locale: string) {
  if (!isLocale(locale)) return { ok: false as const };
  (await cookies()).set(LOCALE_COOKIE, locale, { path: "/", maxAge: 60 * 60 * 24 * 365, sameSite: "lax" });
  const session = await getSession();
  if (session) await db.update(user).set({ locale }).where(eq(user.id, session.user.id));
  return { ok: true as const };
}
