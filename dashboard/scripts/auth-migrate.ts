// auth-migrate.ts: creates or updates Better Auth's tables in AUTH_DATABASE_URL; safe to rerun (npm run auth:migrate).

import { getMigrations } from "better-auth/db/migration";
if (!process.env.AUTH_DATABASE_URL) throw new Error("Set AUTH_DATABASE_URL to the intended authentication database before migrating.");
const { auth } = await import("../lib/auth/server.ts");

const { toBeCreated, toBeAdded, runMigrations } = await getMigrations(auth.options);
if (toBeCreated.length === 0 && toBeAdded.length === 0) {
  console.log("Better Auth tables are up to date.");
} else {
  await runMigrations();
  console.log(`Created ${toBeCreated.map((t) => t.table).join(", ") || "no tables"}; added columns to ${toBeAdded.map((t) => t.table).join(", ") || "no tables"}.`);
}
process.exit(0);
