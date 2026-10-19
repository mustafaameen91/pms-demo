import "server-only";
import { cookies } from "next/headers";
import { and, eq, ne } from "drizzle-orm";
import { db } from "@/lib/db";
import { user } from "@/lib/db/schema";
import { LOCALE_COOKIE, isLocale } from "@/i18n/config";

/**
 * Keeps the account's language (used for emails and notifications) in step
 * with the language picked in the browser — e.g. Arabic chosen before signing up.
 */
export async function chosenLocale() {
  const chosen = (await cookies()).get(LOCALE_COOKIE)?.value;
  return isLocale(chosen) ? chosen : null;
}

/** Call with chosenLocale(), read during render (after() callbacks can't read cookies). */
export async function syncUserLocale(userId: string, chosen: string | null) {
  if (!isLocale(chosen)) return;
  await db.update(user).set({ locale: chosen }).where(and(eq(user.id, userId), ne(user.locale, chosen)));
}
