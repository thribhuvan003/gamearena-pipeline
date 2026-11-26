// Real server-side authorization on the page and every telemetry database read.
import { cache } from "react";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { approvedUser, localPreview } from "./access-policy";

export const requireDashboardAccess = cache(async () => {
  if (localPreview()) return;
  const { auth } = await import("./auth");
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect("/sign-in");
  if (!approvedUser(session.user)) throw new Error("Dashboard access denied");
});
