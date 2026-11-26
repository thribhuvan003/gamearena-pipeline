// access-policy.ts: the sign-in rules: when the local preview skips login, which verified emails are allowed, and whether Better Auth is fully configured.

// Every setting sign-in needs; if one is missing (or the secret is under 32 characters), the dashboard refuses to serve rather than run half-protected.
const REQUIRED = ["APP_BASE_URL", "BETTER_AUTH_SECRET", "AUTH_DATABASE_URL", "GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET", "AUTH_ALLOWED_EMAILS"];

export function localPreview(): boolean {   // True only for npm run dev without AUTH_MODE=better-auth: no login, localhost only. Called by the proxy, the access check and the pages (to hide Sign out)
  return process.env.NODE_ENV === "development" && process.env.AUTH_MODE !== "better-auth";
}

export function approvedUser(user: { email?: string | null; emailVerified?: boolean }): boolean {   // True for a verified email on AUTH_ALLOWED_EMAILS (case and spaces ignored). Called by the proxy and the access check
  const allowed = process.env.AUTH_ALLOWED_EMAILS?.split(",").map((email) => email.trim().toLowerCase()).filter(Boolean) ?? [];
  return user.emailVerified === true && !!user.email && allowed.includes(user.email.toLowerCase());
}

export function authConfigured(): boolean {   // True when every required setting is set and the secret is long enough. Called by the proxy before it lets anything through
  return REQUIRED.every((name) => !!process.env[name]) && (process.env.BETTER_AUTH_SECRET?.length ?? 0) >= 32;
}
