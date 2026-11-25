import { NextResponse, type NextRequest } from "next/server";
import { auth0Client } from "./lib/auth0";
import { approvedUser, authConfigured, localPreview } from "./lib/access-policy";

const LOCAL = new Set(["localhost", "127.0.0.1"]);
const AUTH_ROUTES = new Set(["/auth/login", "/auth/callback", "/auth/logout"]);

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
  if (requestHost !== baseUrl.host || (process.env.NODE_ENV === "production" && baseUrl.protocol !== "https:")) {
    return new NextResponse("Forbidden", { status: 403 });
  }

  const path = request.nextUrl.pathname;
  if (path.startsWith("/auth/") && !AUTH_ROUTES.has(path)) return new NextResponse("Not found", { status: 404 });

  const auth = auth0Client();
  const response = await auth.middleware(request);
  if (AUTH_ROUTES.has(path)) return response;

  const session = await auth.getSession(request);
  if (!session) return NextResponse.redirect(new URL("/auth/login", baseUrl));
  if (!approvedUser(session.user)) return new NextResponse("Access denied", { status: 403 });
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|sitemap.xml|robots.txt).*)"],
};
