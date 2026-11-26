// sign-in/page.tsx: the sign-in page: one Google button; only allowed, verified emails get past it.

import SignInButton from "@/components/SignInButton";

export default function SignInPage() {   // Shows the sign-in prompt. Next.js calls it on every visit to /sign-in; the proxy sends signed-out visitors here
  return (
    <main style={{ maxWidth: 460, margin: "12vh auto", padding: 24 }}>
      <h1>Sign in to GameArena</h1>
      <p className="hint">Use a Google account whose verified email the GameArena team has approved.</p>
      <SignInButton />
    </main>
  );
}
