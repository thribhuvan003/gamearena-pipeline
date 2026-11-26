// proxy.ts: runs before every request: host check, sign-in and the email allowlist (or the local preview).

import { NextResponse, type NextRequest } from "next/server";
import { approvedUser, authConfigured, localPreview } from "./lib/auth/policy";

const LOCAL = new Set(["localhost", "127.0.0.1"]);
// Shown to a signed-in account that is not on the allowlist; signing in again opens Google's account chooser.
const DENIED = `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Access denied</title><body style="font-family:system-ui,sans-serif;max-width:480px;margin:15vh auto;padding:0 16px"><h1>Access denied</h1><p>This account is not allowed to see the GameArena dashboard.</p><p><a href="/sign-in">Sign in with another Google account</a></p></body>`;

export async function proxy(request: NextRequest) {   // Lets a request through only if every check passes; otherwise 403, 503 or /sign-in
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
  if (path === "/sign-in" || path.startsWith("/api/auth/")) return NextResponse.next();

  const { auth } = await import("./lib/auth/server");
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) return NextResponse.redirect(new URL("/sign-in", baseUrl));
  if (!approvedUser(session.user)) return new NextResponse(DENIED, { status: 403, headers: { "content-type": "text/html; charset=utf-8" } });
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|sitemap.xml|robots.txt).*)"],
};
