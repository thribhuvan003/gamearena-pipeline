// proxy.ts: runs before every request: the localhost-only preview in development, otherwise the host check, Auth0 sign-in and the email allowlist.

import { NextResponse, type NextRequest } from "next/server";
import { auth0Client } from "./lib/auth0";
import { approvedUser, authConfigured, localPreview } from "./lib/access-policy";

const LOCAL = new Set(["localhost", "127.0.0.1"]);
const AUTH_ROUTES = new Set(["/auth/login", "/auth/callback", "/auth/logout"]);
// Shown to a signed-in account that is not on the allowlist, with a way out to try another account.
const DENIED = `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Access denied</title><body style="font-family:system-ui,sans-serif;max-width:480px;margin:15vh auto;padding:0 16px"><h1>Access denied</h1><p>This account is not allowed to see the GameArena dashboard.</p><p><a href="/auth/logout">Sign out and use another account</a></p></body>`;

export async function proxy(request: NextRequest) {   // Lets a request through only if it passes every check in order; otherwise answers 403, 404, 503 or sends it to the login. Called by Next.js before every page and route
  const requestHost = request.headers.get("host") ?? "";
  if (localPreview()) {
    return LOCAL.has(requestHost.replace(/:\d+$/, "")) ? NextResponse.next() : new NextResponse("Forbidden", { status: 403 });
  }

  if (!authConfigured()) return new NextResponse("Authentication is not configured", { status: 503 });
  let baseUrl: URL;
  try {
    baseUrl = new URL(process.env.APP_BASE_URL!);
  } catch {
    return new NextResponse("Invalid APP_BASE_URL", { status: 503 });
  }
  // Only the configured address is served, and a built (production) server needs HTTPS unless that address is this machine.
  const wrongHost = requestHost !== baseUrl.host;
  const needsHttps = process.env.NODE_ENV === "production" && !LOCAL.has(baseUrl.hostname);
  if (wrongHost || (needsHttps && baseUrl.protocol !== "https:")) return new NextResponse("Forbidden", { status: 403 });

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
