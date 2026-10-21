import { calendarFor } from "@/lib/calendar-feed";

// GET /api/calendar/<token>.ics — a person's private calendar feed. No login:
// calendar apps can't sign in, so the long random token is the key.
export async function GET(_request: Request, ctx: RouteContext<"/api/calendar/[file]">) {
  const { file } = await ctx.params;
  const token = file.endsWith(".ics") ? file.slice(0, -4) : file;
  if (!/^[A-Za-z0-9_-]{20,64}$/.test(token)) return new Response(null, { status: 404 });
  const ics = await calendarFor(token);
  if (!ics) return new Response(null, { status: 404 });
  return new Response(ics, {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": 'inline; filename="pms.ics"',
      "Cache-Control": "private, max-age=300",
      "X-Robots-Tag": "noindex",
    },
  });
}
