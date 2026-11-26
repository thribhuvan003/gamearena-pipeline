// proxy.ts: runs before every request: the localhost-only preview in development, otherwise the host check, Auth0 sign-in and the email allowlist.

import { NextResponse, type NextRequest } from "next/server";
import { auth0Client } from "./lib/auth0";
import { approvedUser, authConfigured, localPreview } from "./lib/access-policy";

const LOCAL = new Set(["localhost", "127.0.0.1"]);
const AUTH_ROUTES = new Set(["/auth/login", "/auth/callback", "/auth/logout"]);
// Shown to a signed-in account that is not on the allowlist, with a way out to try another account.
const DENIED = `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Access denied</title><body style="font-family:system-ui,sans-serif;max-width:480px;margin:15vh auto;padding:0 16px"><h1>Access denied</h1><p>This account is not allowed to see the GameArena dashboard.</p><p><a href="/auth/logout">Sign out and use another account</a></p></body>`;

export async function proxy(request: NextRequest) {
  const requestHost = request.headers.get("host") ?? "";
  if (localPreview()) {
    return LOCAL.has(requestHost.replace(/:\d+$/, ""))
      ? NextResponse.next()
      : new NextResponse("Forbidden", { status: 403 });
  }

  if (!authConfigured()) return new NextResponse("Authentication is not configured", { status: 503 });
  let baseUrl: URL;
  try {
    baseUrl = new URL(process.env.APP_BASE_URL!);
  } catch {
    return new NextResponse("Invalid APP_BASE_URL", { status: 503 });
  }
  // A built (production) server needs HTTPS, except on this machine (localhost / 127.0.0.1), so the fast build can be demoed locally.
  if (requestHost !== baseUrl.host || (process.env.NODE_ENV === "production" && baseUrl.protocol !== "https:" && !LOCAL.has(baseUrl.hostname))) {
    return new NextResponse("Forbidden", { status: 403 });
  }

  const path = request.nextUrl.pathname;
  if (path.startsWith("/auth/") && !AUTH_ROUTES.has(path)) return new NextResponse("Not found", { status: 404 });

  const auth = auth0Client();
  const response = await auth.middleware(request);
  if (AUTH_ROUTES.has(path)) return response;

  const session = await auth.getSession(request);
  if (!session) return NextResponse.redirect(new URL("/auth/login", baseUrl));
  if (!approvedUser(session.user)) return new NextResponse(DENIED, { status: 403, headers: { "content-type": "text/html; charset=utf-8" } });
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|sitemap.xml|robots.txt).*)"],
};
