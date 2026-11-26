"use client";
// SignInButton.tsx: the "Continue with Google" button; starts Better Auth's Google sign-in and shows an error if it cannot.

import { useState } from "react";
import { authClient } from "@/lib/auth/client";

export default function SignInButton() {   // The button and its error line. Called by the sign-in page; client JS because the redirect starts in the browser
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  async function signIn() {   // Sends the browser to Google and back to the dashboard; on failure re-enables the button with a message. Called when the button is clicked
    setPending(true);
    setError("");
    const result = await authClient.signIn.social({ provider: "google", callbackURL: "/" }).catch(() => null);
    if (!result || result.error) {
      setError(result?.error?.message ?? "Could not start Google sign-in");
      setPending(false);
    }
  }

  return (
    <div>
      <button type="button" disabled={pending} onClick={signIn}>{pending ? "Redirecting…" : "Continue with Google"}</button>
      {error && <p role="alert">{error}</p>}
    </div>
  );
}
