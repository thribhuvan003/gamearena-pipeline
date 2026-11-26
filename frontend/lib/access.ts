// access.ts: the server-side check before any database read: signed in with an allowed email, unless running the local preview.

import { cache } from "react";
import { redirect } from "next/navigation";
import { auth0Client } from "./auth0";
import { approvedUser, localPreview } from "./access-policy";

export const requireDashboardAccess = cache(async () => {
  if (localPreview()) return;

  const session = await auth0Client().getSession();
  if (!session) redirect("/auth/login");
  if (!approvedUser(session.user)) throw new Error("Dashboard access denied");
});
