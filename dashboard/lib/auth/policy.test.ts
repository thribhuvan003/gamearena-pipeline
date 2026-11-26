// policy.test.ts: tests for the sign-in rules (allowlist, no local preview in production, missing settings or a short secret fail closed); run with npm run test:auth.

import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { approvedUser, authConfigured, localPreview } from "./policy.ts";

// The environment as a plain record, so the tests can set NODE_ENV (typed read-only by Next.js).
const env = process.env as Record<string, string | undefined>;
const keys = ["NODE_ENV", "AUTH_MODE", "AUTH_ALLOWED_EMAILS", "APP_BASE_URL",
  "BETTER_AUTH_SECRET", "AUTH_DATABASE_URL", "GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET"];
const before = Object.fromEntries(keys.map((key) => [key, env[key]]));

afterEach(() => {   // Puts every setting a test changed back as it was. Run by node:test after each test
  for (const key of keys) {
    if (before[key] === undefined) delete env[key];
    else env[key] = before[key];
  }
});

test("only verified, allowlisted users can enter", () => {
  process.env.AUTH_ALLOWED_EMAILS = " kc@example.com, SRAVYA@example.com ";
  assert.equal(approvedUser({ email: "Kc@example.com", emailVerified: true }), true);
  assert.equal(approvedUser({ email: "sravya@example.com", emailVerified: false }), false);
  assert.equal(approvedUser({ email: "other@example.com", emailVerified: true }), false);
  delete process.env.AUTH_ALLOWED_EMAILS;
  assert.equal(approvedUser({ email: "kc@example.com", emailVerified: true }), false);
});

test("localhost preview cannot bypass production auth", () => {
  env.NODE_ENV = "development";
  delete env.AUTH_MODE;
  assert.equal(localPreview(), true);
  env.AUTH_MODE = "better-auth";
  assert.equal(localPreview(), false);
  env.NODE_ENV = "production";
  env.AUTH_MODE = "local";
  assert.equal(localPreview(), false);
});

test("missing config and short secrets fail closed", () => {
  Object.assign(process.env, {
    APP_BASE_URL: "https://gamearena.example.com",
    BETTER_AUTH_SECRET: "a".repeat(32),
    AUTH_DATABASE_URL: "postgresql://localhost/auth",
    GOOGLE_CLIENT_ID: "google-client",
    GOOGLE_CLIENT_SECRET: "google-secret",
    AUTH_ALLOWED_EMAILS: "kc@example.com",
  });
  assert.equal(authConfigured(), true);
  process.env.BETTER_AUTH_SECRET = "short";
  assert.equal(authConfigured(), false);
  process.env.BETTER_AUTH_SECRET = "a".repeat(32);
  delete process.env.AUTH_DATABASE_URL;
  assert.equal(authConfigured(), false);
});
