import { NextResponse, type NextRequest } from "next/server";
import { getSessionCookie } from "better-auth/cookies";
import { AUTH_COOKIE_PREFIX } from "@/lib/auth/cookie";

// Optimistic check only (cookie present). Real session validation happens
// server-side in requireUser()/requireWorkspace().
// "/share" = client links, "/f" = request forms (secret token, no account).
const PUBLIC_PATHS = ["/login", "/signup", "/forgot-password", "/reset-password", "/share", "/f"];

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const hasSession = Boolean(getSessionCookie(request, { cookiePrefix: AUTH_COOKIE_PREFIX }));
  const isPublic = PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));

  if (!hasSession && !isPublic) {
    const url = new URL("/login", request.url);
    if (pathname !== "/") url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }
  // Signed-in users on /login are redirected by the page itself after a real
  // session check; doing it here would loop when the cookie is stale.
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|.*\\..*).*)"],
};
