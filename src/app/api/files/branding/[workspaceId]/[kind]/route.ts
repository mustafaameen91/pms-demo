import { and, eq } from "drizzle-orm";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { companyProfiles, member } from "@/lib/db/schema";
import { readStoredFile } from "@/lib/uploads";

// A company's logo / stamp, only for members of that company's workspace.
export async function GET(_request: Request, ctx: RouteContext<"/api/files/branding/[workspaceId]/[kind]">) {
  const { workspaceId, kind } = await ctx.params;
  if (kind !== "logo" && kind !== "stamp") return new Response(null, { status: 404 });
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return new Response(null, { status: 401 });
  const [row] = await db
    .select({ logoPath: companyProfiles.logoPath, logoType: companyProfiles.logoType, stampPath: companyProfiles.stampPath, stampType: companyProfiles.stampType })
    .from(companyProfiles)
    .innerJoin(member, and(eq(member.organizationId, companyProfiles.workspaceId), eq(member.userId, session.user.id)))
    .where(eq(companyProfiles.workspaceId, workspaceId))
    .limit(1);
  const path = kind === "logo" ? row?.logoPath : row?.stampPath;
  const type = kind === "logo" ? row?.logoType : row?.stampType;
  if (!path || !type) return new Response(null, { status: 404 });
  const file = await readStoredFile(path).catch(() => null);
  if (!file) return new Response(null, { status: 404 });
  return new Response(new Uint8Array(file), {
    headers: {
      "Content-Type": type,
      "Content-Length": String(file.length),
      "X-Content-Type-Options": "nosniff",
      // Versioned URL (?v=…), so it can be cached by the browser.
      "Cache-Control": "private, max-age=31536000, immutable",
      "Content-Security-Policy": "default-src 'none'; sandbox",
    },
  });
}
