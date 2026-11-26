"use client";
// SignOut.tsx: the header's Sign out button: ends the Better Auth session and goes to the sign-in page.

import { authClient } from "@/lib/auth-client";

export default function SignOut() {   // The button. Called by the dashboard and session pages when sign-in is on; client JS because sign-out runs in the browser
  async function signOut() {   // Ends the session, then opens /sign-in even if the server call failed. Called when the button is clicked
    await authClient.signOut().catch(() => null);
    window.location.assign("/sign-in");
  }
  return <button type="button" className="sign-out" onClick={signOut}>Sign out</button>;
}
