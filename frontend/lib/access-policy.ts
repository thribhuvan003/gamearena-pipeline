// access-policy.ts: the sign-in rules: when the local preview skips login, which verified emails are allowed, and whether Auth0 is fully configured.

// Every setting sign-in needs; if one is missing, the dashboard refuses to serve rather than run half-protected.
const REQUIRED = ["AUTH0_DOMAIN", "AUTH0_CLIENT_ID", "AUTH0_CLIENT_SECRET", "AUTH0_SECRET", "AUTH0_ALLOWED_EMAILS", "APP_BASE_URL"];

export function localPreview(): boolean {   // True only for npm run dev without AUTH_MODE=auth0: no login, localhost only. Called by the proxy, the access check and the pages (to hide Sign out)
  return process.env.NODE_ENV === "development" && process.env.AUTH_MODE !== "auth0";
}

export function approvedUser(user: { email?: string | null; email_verified?: boolean }): boolean {   // True for a verified email on AUTH0_ALLOWED_EMAILS (case and spaces ignored). Called by the proxy and the access check
  const allowed = process.env.AUTH0_ALLOWED_EMAILS?.split(",").map((email) => email.trim().toLowerCase()).filter(Boolean) ?? [];
  return user.email_verified === true && !!user.email && allowed.includes(user.email.toLowerCase());
}

export function authConfigured(): boolean {   // True when every required sign-in setting is set. Called by the proxy before it lets anything through
  return REQUIRED.every((name) => !!process.env[name]);
}
