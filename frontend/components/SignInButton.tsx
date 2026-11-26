"use client";

import { useState } from "react";
import { authClient } from "@/lib/auth-client";

export default function SignInButton() {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  async function signIn() {
    setPending(true);
    setError("");
    try {
      const result = await authClient.signIn.social({ provider: "google", callbackURL: "/" });
      if (result.error) {
        setError(result.error.message ?? "Could not start Google sign-in");
        setPending(false);
      }
    } catch {
      setError("Could not start Google sign-in");
      setPending(false);
    }
  }
  return (
    <div>
      <button type="button" disabled={pending} onClick={signIn}>
        {pending ? "Redirecting…" : "Continue with Google"}
      </button>
      {error && <p role="alert">{error}</p>}
    </div>
  );
}
