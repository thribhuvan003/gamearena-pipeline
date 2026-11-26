# GameArena dashboard

A small read-only dashboard over the pipeline's results (the pipeline is in `../backend`) and the app's own session records. Local development stays on your own machine; Better Auth sign-in protects it when configured for sharing.

## Problem statement
**What data we have:**
- the pipeline's tables in CockroachDB: `session_tags` (one row per ended session with telemetry: connected, failed or no_attempt, with a reason), `connection_tags` (one row per client connection with telemetry: connected, not_connected or unknown, with a reason), `session_facts` (one row per session with events: counts and first/last failure and success), `error_events` (a copy of the error-level events) and `pipeline_runs` (not shown). Page totals and error numbers come from these small tables, never from adding up every raw event, so the dashboard stays fast as telemetry grows; raw events are read only for one session's timeline or one reason's detail.
- the raw events in `session_telemetry_events`
- the app's records in `gamearena_source`, restored from the 11 Nov 2026 backup: every app session (`host_sessions`, 18,982) and client connection (`session_client_connections`)

**What we want to see:** overall usage, then the scale of the problems, then the exact sessions or client connections behind each number, then the evidence in one session.

**Out of scope for now:** FPS, streamed hours and other quality numbers; changing the pipeline's rules.

**Rules:**
- The dashboard only reads (`SELECT`).
- Every clickable number is a cohort in `lib/queries.ts`. One SQL condition is used for both its count and its list, so a number always opens exactly the records it counts.
- An app session may contain several client connection IDs. A client ID is tagged `connected` if it has a `pipeline.connect.success` event, `not_connected` if it has app events but no success event, and `unknown` if it has no app events. These tags describe recorded evidence, not proof of a physical connection outcome.
- Ended sessions with telemetry are tagged `connected` if any success event exists, `failed` if an attempt but no success exists, or `no_attempt` otherwise. A session tag and its clients' tags use different units.
- Error event counts may repeat and may include sessions or clients with a recorded success. The app supplies event codes such as 500; the code alone does not identify an HTTP status or root cause.
- `pipeline.connect.failure` is an explicit failed-attempt event; `pipeline.connection.dropped` is an app-reported drop event. Either may appear for a client whose tag says success recorded. `ice.connection.state` and `webrtc.connection.state` name state events; inspect the underlying state and timeline before assigning a cause.
- Pipeline reasons use the last `pipeline.connect.failure` phase first (`pre-connect` → setup, `connecting` → connecting error), then a failed WebRTC state, then missing join events for sessions, then unknown. The inferred reason is not an independently confirmed root cause.
- Date filters use app session start for session counts and patterns, first client event for client outcomes and the daily outcome chart, and event timestamp for error lists and error trends. Each is a UTC day.

## What the page shows
| Section | Shows |
|---|---|
| Header | date filter (UTC days, both included; the app's session days, 1 Jun – 17 Oct), and a search for a session or client connection ID (the whole ID or its first 8+ characters; one match opens it) |
| Sessions | every app session, with and without telemetry events, by the app's start time |
| Client connections | client IDs with telemetry: success recorded, no success recorded and no outcome evidence |
| Sessions without recorded success | ended sessions with an attempt event and no success event, grouped by the pipeline's inferred category. One session has one category; these are clues, not confirmed root causes |
| Session-level event patterns | the same event log grouped by session ID: more than one `pipeline.connect.attempt`, a `pipeline.connect.failure`, failure and success events in time order, `client_reconnected` (and 10 or more), or events but no `session_ended`. A session is counted once per pattern, even if its client IDs generated multiple matching events; the rows overlap |
| No success recorded: pipeline categories | `not_connected` client IDs per pipeline reason. A missing success event is not the same as an explicit failure event |
| Client error events | each error + code: times recorded; tagged client IDs with the event (click to list them); IDs with no success and with success; untagged IDs apart. `ice.candidate.error` is marked as a warning. Events naming no client remain in the session timeline |
| Errors per day | a bar chart (Recharts): `not_connected` client IDs with each error by the event's UTC day, top 5 errors, Other and warnings. One ID can appear on several days. The key shows app-supplied message, phase, stage and error text with private bits hidden |
| Side sheet | opens in place on every click: the list behind a number (50 per page; for a client reason, first how far its clients got and the errors they recorded), a search result, or one session. A session shows the app's start, end and end reason, the pipeline's outcome, each client's device, OS and browser (read from the user agent), every error, the warnings one row per event name with counts, and all events 100 per page. Escape closes it; Tab stays inside it |

## Run it
Needs Node.js 20+, the `cockroachdb` Docker container running (with `gamearena_source` restored), and the pipeline run at least once (`just run`). From the project folder:
```
just dashboard
```
That installs the packages and starts it. Without just, run `npm install` then `npm run dev` in this `frontend` folder (or `npm run build` then `npm start` for the faster built version).
Then open http://localhost:3000 (or http://127.0.0.1:3000). Development defaults to a localhost-only preview without login. `npm start` and other production builds require Better Auth configuration, and HTTPS for any address other than localhost (so the fast build can be demoed on this machine with `APP_BASE_URL=http://localhost:3000`). Ctrl+C stops it.

It uses the pipeline's settings and defaults (`DB_HOST` 127.0.0.1, `DB_PORT` 26257, `DB_NAME` gamearena_analytics, `DB_USER` root, `DB_PASSWORD` not set). To change them, put them in a `.env.local` file here.

## Better Auth sign-in

Sign-in is Better Auth with **Google only** (no passwords, no public sign-up). Only a Google-verified email on `AUTH_ALLOWED_EMAILS` can see data; Google's account chooser opens on every sign-in, so a denied user can pick another account.

Logins (users, sessions) live in **their own database**, `AUTH_DATABASE_URL`, apart from the telemetry. Locally that is a separate `gamearena_auth` database in the same CockroachDB container (tested: Better Auth's tables, writes and reads work on CockroachDB); the telemetry databases stay read-only and use the `DB_*` settings.

Set up once:
1. Create the auth database: `docker exec cockroachdb ./cockroach sql --insecure -e "CREATE DATABASE IF NOT EXISTS gamearena_auth;"`
2. In Google Cloud Console, create an OAuth client ID of type **Web application** with the authorized redirect URI `http://localhost:3000/api/auth/callback/google` (add the HTTPS one for a real deployment).
3. Fill `frontend/.env.local` (git-ignored; never commit it):
```env
AUTH_MODE=better-auth
APP_BASE_URL=http://localhost:3000
BETTER_AUTH_SECRET=64-hex-characters
AUTH_DATABASE_URL=postgresql://root@127.0.0.1:26257/gamearena_auth?sslmode=disable
GOOGLE_CLIENT_ID=from-google-cloud-console
GOOGLE_CLIENT_SECRET=from-google-cloud-console
AUTH_ALLOWED_EMAILS=you@example.com,kc@example.com
```
   Make the secret with `node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"`.
4. From `frontend/`, create Better Auth's tables: `npm run auth:migrate` (safe to run again).

Without `AUTH_MODE=better-auth`, `npm run dev` stays a localhost-only preview with no login. A built server (`npm start`) always requires every setting above, and HTTPS for any address other than localhost. For a real deployment, use a secured auth database and a read-only telemetry account instead of the local root/insecure defaults.

## Files
| File | What it does |
|---|---|
| `app/page.tsx` | the dashboard page |
| `app/session/[id]/page.tsx` | one session's page, for a direct link |
| `app/layout.tsx`, `app/globals.css` | the HTML frame, title and the only stylesheet |
| `components/*.tsx` | one file per section, plus the side sheet (`Sheet`, `SheetFrame`), `SessionView`, `SessionTimeline` and `Pager`. The ones that run in the browser start with `"use client"`: the charts, `SheetFrame`, `ThemeToggle`, `SignInButton` and `SignOut` |
| `app/sign-in/page.tsx`, `app/api/auth/[...all]/route.ts` | the sign-in page, and Better Auth's endpoints (Google redirect and callback, session, sign-out) |
| `lib/auth-client.ts`, `scripts/auth-migrate.ts` | Better Auth in the browser; `npm run auth:migrate` creates its tables |
| `lib/queries.ts` | the data: the database connection, the cohorts and every SQL the dashboard runs |
| `lib/links.ts` | the page's URL state and the one function that builds every link |
| `lib/format.ts` | number and time formatting, and hiding private bits in messages |
| `lib/access-policy.ts`, `lib/access.ts`, `lib/auth.ts` | local preview rule, Better Auth session and email allowlist, and server-side access check before database reads |
| `proxy.ts` | localhost-only preview in development; Better Auth route handling and access enforcement when sign-in is enabled |

## Check it
With no dates picked: Client connections = `just report` report 2. Sessions tagged connected, failed and no_attempt (in the side sheet's lists) = report 1, counted by the app's start time instead of the first event, so a range can differ at its edges.
