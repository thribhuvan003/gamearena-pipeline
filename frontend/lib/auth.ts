// Better Auth owns identities and sessions in a separate PostgreSQL database.
// GameArena telemetry remains read-only in the DB_* CockroachDB connection.
import { betterAuth } from "better-auth";
import { Pool } from "pg";

const authPool = new Pool({
  connectionString: process.env.AUTH_DATABASE_URL,
  max: 5,
});

export const auth = betterAuth({
  appName: "GameArena",
  baseURL: process.env.APP_BASE_URL,
  secret: process.env.BETTER_AUTH_SECRET,
  database: authPool,
  emailAndPassword: { enabled: false },
  socialProviders: {
    google: {
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    },
  },
});
