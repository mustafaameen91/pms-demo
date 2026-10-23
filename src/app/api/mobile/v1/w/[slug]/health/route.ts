import { json, requireMobileWorkspace } from "@/lib/mobile/api";
import { healthJson, managedHealth } from "@/lib/mobile/manage";

/** GET → the projects I manage (admins: all), with progress, money and deadlines; most in need first. */
export async function GET(request: Request, ctx: RouteContext<"/api/mobile/v1/w/[slug]/health">) {
  const authed = await requireMobileWorkspace(request, (await ctx.params).slug);
  if (authed instanceof Response) return authed;
  return json({ projects: (await managedHealth(authed)).map(healthJson) });
}
