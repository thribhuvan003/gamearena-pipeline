// Next.js 16 proxy: convenience redirect + full session check; pages and queries check again.
import { NextResponse, type NextRequest } from "next/server";
import { approvedUser, authConfigured, localPreview } from "./lib/access-policy";

const LOCAL = new Set(["localhost", "127.0.0.1"]);
const DENIED = `<!doctype html><meta charset="utf-8"><title>Access denied</title><main style="font-family:system-ui;max-width:480px;margin:15vh auto"><h1>Access denied</h1><p>This account is not approved to view GameArena.</p><p><a href="/sign-in">Try another Google account</a></p></main>`;

export async function proxy(request: NextRequest) {
  const host = request.headers.get("host") ?? "";
  if (localPreview()) {
    return LOCAL.has(host.replace(/:\d+$/, ""))
      ? NextResponse.next()
      : new NextResponse("Forbidden", { status: 403 });
  }
  if (!authConfigured()) return new NextResponse("Authentication is not configured", { status: 503 });

  const baseURL = new URL(process.env.APP_BASE_URL!);
  if (host !== baseURL.host ||
      (process.env.NODE_ENV === "production" &&
       !LOCAL.has(baseURL.hostname) && baseURL.protocol !== "https:")) {
    return new NextResponse("Forbidden", { status: 403 });
  }

  const path = request.nextUrl.pathname;
  if (path === "/sign-in" || path.startsWith("/api/auth/")) return NextResponse.next();

  const { auth } = await import("./lib/auth");
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) return NextResponse.redirect(new URL("/sign-in", baseURL));
  if (!approvedUser(session.user)) {
    return new NextResponse(DENIED, { status: 403, headers: { "content-type": "text/html; charset=utf-8" } });
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|sitemap.xml|robots.txt).*)"],
};
