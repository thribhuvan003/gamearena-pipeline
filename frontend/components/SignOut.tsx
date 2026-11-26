"use client";

import { authClient } from "@/lib/auth-client";

export default function SignOut() {
  return <button type="button" className="sign-out" onClick={async () => {
    await authClient.signOut();
    window.location.assign("/sign-in");
  }}>Sign out</button>;
}
