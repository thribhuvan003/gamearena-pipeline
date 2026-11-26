// access.ts: the server-side check before any database read: signed in with an allowed email, unless running the local preview.

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { approvedUser, localPreview } from "./access-policy";

export const requireDashboardAccess = cache(async () => {   // Stops the request unless it is the local preview or a signed-in allowed user; cache() runs it once per request. Called by the pages and before every database query, as a second check behind the proxy
  if (localPreview()) return;
  const { auth } = await import("./auth");
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect("/sign-in");
  if (!approvedUser(session.user)) throw new Error("Dashboard access denied");
});
