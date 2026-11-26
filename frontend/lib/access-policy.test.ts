import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { approvedUser, authConfigured, localPreview } from "./access-policy.ts";

const keys = ["NODE_ENV", "AUTH_MODE", "AUTH_ALLOWED_EMAILS", "APP_BASE_URL",
  "BETTER_AUTH_SECRET", "AUTH_DATABASE_URL", "GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET"] as const;
const before = Object.fromEntries(keys.map((key) => [key, process.env[key]]));

afterEach(() => {
  for (const key of keys) {
    const value = before[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
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
  process.env.NODE_ENV = "development";
  delete process.env.AUTH_MODE;
  assert.equal(localPreview(), true);
  process.env.AUTH_MODE = "better-auth";
  assert.equal(localPreview(), false);
  process.env.NODE_ENV = "production";
  process.env.AUTH_MODE = "local";
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
