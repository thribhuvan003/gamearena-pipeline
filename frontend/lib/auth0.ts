// auth0.ts: the one Auth0 client that the proxy and the access check share.

import { Auth0Client } from "@auth0/nextjs-auth0/server";

let client: Auth0Client | undefined;

export function auth0Client(): Auth0Client {
  client ??= new Auth0Client();
  return client;
}
