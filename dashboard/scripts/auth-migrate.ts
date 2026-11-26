// auth-migrate.ts: creates or updates Better Auth's tables (users, sessions, accounts, verifications) in the AUTH_DATABASE_URL database; safe to run again. Run with npm run auth:migrate.

import { getMigrations } from "better-auth/db/migration";
import { auth } from "../lib/auth/server.ts";

const { toBeCreated, toBeAdded, runMigrations } = await getMigrations(auth.options);
if (toBeCreated.length === 0 && toBeAdded.length === 0) {
  console.log("Better Auth tables are up to date.");
} else {
  await runMigrations();
  console.log(`Created ${toBeCreated.map((t) => t.table).join(", ") || "no tables"}; added columns to ${toBeAdded.map((t) => t.table).join(", ") || "no tables"}.`);
}
process.exit(0);
