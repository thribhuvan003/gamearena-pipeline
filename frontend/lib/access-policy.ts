export function localPreview(): boolean {
  return process.env.NODE_ENV === "development" && process.env.AUTH_MODE !== "auth0";
}

export function approvedUser(user: { email?: string | null; email_verified?: boolean }): boolean {
  const emails = process.env.AUTH0_ALLOWED_EMAILS?.split(",").map((email) => email.trim().toLowerCase()).filter(Boolean) ?? [];
  return user.email_verified === true && !!user.email && emails.includes(user.email.toLowerCase());
}

export function authConfigured(): boolean {
  return !!(
    process.env.AUTH0_DOMAIN && process.env.AUTH0_CLIENT_ID && process.env.AUTH0_CLIENT_SECRET &&
    process.env.AUTH0_SECRET && process.env.AUTH0_ALLOWED_EMAILS && process.env.APP_BASE_URL
  );
}
