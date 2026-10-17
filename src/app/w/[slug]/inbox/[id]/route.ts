import { and, eq } from "drizzle-orm";
import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { notifications } from "@/lib/db/schema";

// Opening a notification marks it read, then goes to what it's about.
export async function GET(request: Request, ctx: RouteContext<"/w/[slug]/inbox/[id]">) {
  const { slug, id } = await ctx.params;
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return NextResponse.redirect(new URL("/login", request.url));

  const [row] = await db
    .update(notifications)
    .set({ readAt: new Date() })
    .where(and(eq(notifications.id, id), eq(notifications.userId, session.user.id)))
    .returning({ link: notifications.link });

  // Only follow app-relative links stored by the server.
  const target = row?.link?.startsWith("/") && !row.link.startsWith("//") ? row.link : `/w/${slug}/inbox`;
  return NextResponse.redirect(new URL(target, request.url));
}
