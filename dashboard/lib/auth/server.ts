// server.ts: Better Auth on the server: Google sign-in only, with users and sessions kept in their own database (AUTH_DATABASE_URL), apart from the read-only telemetry.

import { betterAuth } from "better-auth";
import { Pool } from "pg";

export const auth = betterAuth({
  appName: "GameArena",
  baseURL: process.env.APP_BASE_URL,
  secret: process.env.BETTER_AUTH_SECRET,
  database: new Pool({ connectionString: process.env.AUTH_DATABASE_URL, max: 5 }),
  emailAndPassword: { enabled: false },
  socialProviders: {
    google: {
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
      prompt: "select_account",   // always show Google's account chooser, so a denied user can pick another account
    },
  },
});
