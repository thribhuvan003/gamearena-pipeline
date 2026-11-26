// auth0.ts: the one Auth0 client that the proxy and the access check share.

import { Auth0Client } from "@auth0/nextjs-auth0/server";

let client: Auth0Client | undefined;

export function auth0Client(): Auth0Client {   // The shared Auth0 client, made on first use so it reads the settings only when sign-in is on. Called by the proxy and the access check
  client ??= new Auth0Client();
  return client;
}
