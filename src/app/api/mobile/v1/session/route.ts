import { auth } from "@/lib/auth";
import { buildMe, fail, json, mobileT, mobileUser } from "@/lib/mobile/api";

/**
 * POST { email, password } → { token, me }  (sign in; keep the token in the keychain)
 * DELETE                   → 204           (sign out; the token stops working)
 */
export async function POST(request: Request) {
  const t = mobileT(request);
  const body = (await request.json().catch(() => null)) as { email?: unknown; password?: unknown } | null;
  const email = typeof body?.email === "string" ? body.email.trim() : "";
  const password = typeof body?.password === "string" ? body.password : "";
  if (!email || !password) return fail(400, "invalid", t("Enter your email and password."));
  const res = await auth.api.signInEmail({ body: { email, password }, headers: request.headers, asResponse: true });
  const token = res.headers.get("set-auth-token");
  if (!res.ok || !token) return fail(401, "invalid_credentials", t("Wrong email or password."));
  // Build "me" with the new token, so the app needs one request to start.
  const user = await mobileUser(new Request(request.url, { headers: { authorization: `Bearer ${token}` } }));
  if (!user) return fail(401, "invalid_credentials", t("Wrong email or password."));
  return json({ token, me: await buildMe(user) });
}

export async function DELETE(request: Request) {
  await auth.api.signOut({ headers: request.headers }).catch(() => {});
  return new Response(null, { status: 204 });
}
