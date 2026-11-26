import SignInButton from "@/components/SignInButton";

export default function SignInPage() {
  return (
    <main style={{ maxWidth: 460, margin: "12vh auto", padding: 24 }}>
      <h1>Sign in to GameArena</h1>
      <p>Use a Google account whose verified email is approved by the GameArena team.</p>
      <SignInButton />
    </main>
  );
}
