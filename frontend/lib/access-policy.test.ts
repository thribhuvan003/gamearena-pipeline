// access-policy.test.ts: tests for the sign-in rules (allowlist, no local preview in production, incomplete Auth0 settings fail closed); run with npm run test:auth.

import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { approvedUser, authConfigured, localPreview } from "./access-policy.ts";

const before = {
  NODE_ENV: process.env.NODE_ENV,
  AUTH_MODE: process.env.AUTH_MODE,
  AUTH0_ALLOWED_EMAILS: process.env.AUTH0_ALLOWED_EMAILS,
  AUTH0_DOMAIN: process.env.AUTH0_DOMAIN,
  AUTH0_CLIENT_ID: process.env.AUTH0_CLIENT_ID,
  AUTH0_CLIENT_SECRET: process.env.AUTH0_CLIENT_SECRET,
  AUTH0_SECRET: process.env.AUTH0_SECRET,
  APP_BASE_URL: process.env.APP_BASE_URL,
};

afterEach(() => {
  for (const [key, value] of Object.entries(before)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

test("only verified, explicitly allowed addresses pass", () => {
  process.env.AUTH0_ALLOWED_EMAILS = " kc@example.com, SRAVYA@example.com ";
  assert.equal(approvedUser({ email: "Kc@example.com", email_verified: true }), true);
  assert.equal(approvedUser({ email: "sravya@example.com", email_verified: false }), false);
  assert.equal(approvedUser({ email: "other@example.com", email_verified: true }), false);
  assert.equal(approvedUser({ email_verified: true }), false);
  delete process.env.AUTH0_ALLOWED_EMAILS;
  assert.equal(approvedUser({ email: "kc@example.com", email_verified: true }), false);
});

test("local preview cannot run in a production process", () => {
  Object.assign(process.env, { NODE_ENV: "development" });
  delete process.env.AUTH_MODE;
  assert.equal(localPreview(), true);
  process.env.AUTH_MODE = "auth0";
  assert.equal(localPreview(), false);
  Object.assign(process.env, { NODE_ENV: "production" });
  process.env.AUTH_MODE = "local";
  assert.equal(localPreview(), false);
});

test("incomplete Auth0 configuration fails closed", () => {
  Object.assign(process.env, {
    AUTH0_DOMAIN: "example.auth0.com",
    AUTH0_CLIENT_ID: "client",
    AUTH0_CLIENT_SECRET: "client-secret",
    AUTH0_SECRET: "a".repeat(64),
    AUTH0_ALLOWED_EMAILS: "kc@example.com",
    APP_BASE_URL: "https://dashboard.example.com",
  });
  assert.equal(authConfigured(), true);
  delete process.env.AUTH0_CLIENT_SECRET;
  assert.equal(authConfigured(), false);
});
