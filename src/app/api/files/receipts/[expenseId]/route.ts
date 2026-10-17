import { and, eq } from "drizzle-orm";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { expenses, member } from "@/lib/db/schema";
import { readStoredFile } from "@/lib/uploads";

// Receipts are only served to members of the expense's workspace.
export async function GET(_request: Request, ctx: RouteContext<"/api/files/receipts/[expenseId]">) {
  const { expenseId } = await ctx.params;
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return new Response("Unauthorized", { status: 401 });

  const [row] = await db
    .select({ path: expenses.receiptPath, name: expenses.receiptName, type: expenses.receiptType })
    .from(expenses)
    .innerJoin(
      member,
      and(eq(member.organizationId, expenses.workspaceId), eq(member.userId, session.user.id)),
    )
    .where(eq(expenses.id, expenseId))
    .limit(1);
  if (!row?.path || !row.type) return new Response("Not found", { status: 404 });

  const file = await readStoredFile(row.path).catch(() => null);
  if (!file) return new Response("Not found", { status: 404 });

  const filename = (row.name ?? "receipt").replace(/["\r\n]/g, "");
  return new Response(new Uint8Array(file), {
    headers: {
      "Content-Type": row.type,
      "Content-Length": String(file.length),
      "Content-Disposition": `inline; filename="${filename}"`,
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "private, no-store",
      // Types are verified from file contents on upload (no SVG/HTML). Images get a strict
      // policy too; PDFs can't, as Chrome won't open a PDF in a sandboxed document.
      ...(row.type !== "application/pdf" && {
        "Content-Security-Policy": "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; sandbox",
      }),
    },
  });
}
