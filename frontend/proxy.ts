// proxy.ts: runs before every request and refuses any that are not addressed to this machine (localhost), so another website can't trick the browser into reading the dashboard.

import { NextResponse, type NextRequest } from "next/server";

const LOCAL = new Set(["localhost", "127.0.0.1"]);

export function proxy(request: NextRequest) {   // Lets the request through only when its Host is localhost or 127.0.0.1 (any port), else answers 403. Next.js calls it for every request
  const host = (request.headers.get("host") ?? "").replace(/:\d+$/, "");
  return LOCAL.has(host) ? NextResponse.next() : new NextResponse("Forbidden", { status: 403 });
}
