import { buildMe, json, requireMobileUser } from "@/lib/mobile/api";

/** GET → my account, my companies and my role / home in each. */
export async function GET(request: Request) {
  const authed = await requireMobileUser(request);
  if (authed instanceof Response) return authed;
  return json(await buildMe(authed.user));
}
