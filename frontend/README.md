# GameArena dashboard

A small read-only dashboard over the pipeline's results (the pipeline is in `../backend`) and the app's own session records. Local development stays on your own machine; Auth0 sign-in protects it when configured for sharing.

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
Then open http://localhost:3000 (or http://127.0.0.1:3000). Development defaults to a localhost-only preview without login. `npm start` and other production builds require Auth0 configuration, and HTTPS for any address other than localhost (so the fast build can be demoed on this machine with `APP_BASE_URL=http://localhost:3000`). Ctrl+C stops it.

It uses the pipeline's settings and defaults (`DB_HOST` 127.0.0.1, `DB_PORT` 26257, `DB_NAME` gamearena_analytics, `DB_USER` root, `DB_PASSWORD` not set). To change them, put them in a `.env.local` file here.

## Auth0 sign-in
Create a **Regular Web Application** in Auth0. In its settings, add `http://localhost:3000/auth/callback` to Allowed Callback URLs and `http://localhost:3000` to Allowed Logout URLs. Use the corresponding HTTPS URLs for the eventual deployment. Choose and enable the identity connection the team will use; only users on the app's allowlist can see data.

For local sign-in, add this to `frontend/.env.local`, then restart `npm run dev`:
```
AUTH_MODE=auth0
APP_BASE_URL=http://localhost:3000
AUTH0_DOMAIN=your-tenant.auth0.com
AUTH0_CLIENT_ID=your-client-id
AUTH0_CLIENT_SECRET=your-client-secret
AUTH0_SECRET=64-hex-characters
AUTH0_ALLOWED_EMAILS=tribhuvan@example.com,kc@example.com,sravya@example.com
```
Generate `AUTH0_SECRET` with `node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"`. Replace the example addresses with the team's real verified sign-in emails. `.env.local` is gitignored; do not commit secrets. Use `http://localhost:3000` consistently during the local Auth0 test.

The Auth0 SDK handles `/auth/login`, `/auth/callback`, and `/auth/logout`. The proxy checks the host, session, verified email, and allowlist before serving pages; database reads independently check access. Other SDK routes, including `/auth/profile` and `/auth/access-token`, are not exposed. Production refuses requests if Auth0 settings, an allowlist, or a matching HTTPS `APP_BASE_URL` is missing. Configure the deployment's database connection and network access separately before sharing the site.

## Files
| File | What it does |
|---|---|
| `app/page.tsx` | the dashboard page |
| `app/session/[id]/page.tsx` | one session's page, for a direct link |
| `app/layout.tsx`, `app/globals.css` | the HTML frame, title and the only stylesheet |
| `components/*.tsx` | one file per section, plus the side sheet (`Sheet`, `SheetFrame`), `SessionView`, `SessionTimeline` and `Pager`. `ErrorChart.tsx` and `SheetFrame.tsx` are the only ones that run in the browser |
| `lib/queries.ts` | the data: the database connection, the cohorts and every SQL the dashboard runs |
| `lib/links.ts` | the page's URL state and the one function that builds every link |
| `lib/format.ts` | number and time formatting, and hiding private bits in messages |
| `lib/access-policy.ts`, `lib/access.ts`, `lib/auth0.ts` | local preview rule, Auth0 session and email allowlist, and server-side access check before database reads |
| `proxy.ts` | localhost-only preview in development; Auth0 route handling and access enforcement when sign-in is enabled |

## Check it
With no dates picked: Client connections = `just report` report 2. Sessions tagged connected, failed and no_attempt (in the side sheet's lists) = report 1, counted by the app's start time instead of the first event, so a range can differ at its edges.
