// Fail closed outside localhost development preview.
const REQUIRED = ["APP_BASE_URL", "BETTER_AUTH_SECRET", "AUTH_DATABASE_URL",
  "GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET", "AUTH_ALLOWED_EMAILS"] as const;

export function localPreview(): boolean {
  return process.env.NODE_ENV === "development" && process.env.AUTH_MODE !== "better-auth";
}

export function approvedUser(user: { email?: string | null; emailVerified?: boolean }): boolean {
  const allowed = process.env.AUTH_ALLOWED_EMAILS?.split(",")
    .map((email) => email.trim().toLowerCase()).filter(Boolean) ?? [];
  return user.emailVerified === true && !!user.email && allowed.includes(user.email.toLowerCase());
}

export function authConfigured(): boolean {
  return REQUIRED.every((name) => !!process.env[name]) &&
    (process.env.BETTER_AUTH_SECRET?.length ?? 0) >= 32;
}
