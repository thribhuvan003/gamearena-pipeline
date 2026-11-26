// route.ts: Better Auth's own endpoints under /api/auth (Google redirect and callback, session, sign-out).

import { toNextJsHandler } from "better-auth/next-js";
import { auth } from "@/lib/auth";

export const { GET, POST } = toNextJsHandler(auth);
