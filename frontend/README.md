# GameArena dashboard

A small read-only dashboard over the pipeline's results (the pipeline is in `../backend`) and the app's own session records. It runs on your own machine only, because the pages show real session IDs.

## Problem statement
**What data we have:**
- the pipeline's tables in CockroachDB: `session_tags` (one row per ended session with telemetry: connected, failed or no_attempt, with a reason), `connection_tags` (one row per client connection with telemetry: connected, not_connected or unknown, with a reason) and `pipeline_runs` (not shown)
- the raw events in `session_telemetry_events`
- the app's records in `gamearena_source`, restored from the 11 Nov 2026 backup: every app session (`host_sessions`, 18,982) and client connection (`session_client_connections`)

**What we want to see:** overall usage, then the scale of the problems, then the exact sessions or client connections behind each number, then the evidence in one session.

**Out of scope for now:** FPS, streamed hours and other quality numbers; auth and an API (needed before it is shared); changing the pipeline's rules.

**Rules:**
- The dashboard only reads (`SELECT`).
- Every clickable number is a cohort in `lib/queries.ts`. One SQL condition is used for both its count and its list, so a number always opens exactly the records it counts.
- Units are never mixed: usage and coverage count app sessions, connection problems count client connections, and errors that name no client count affected sessions.
- Names are shown as the data has them. The one exception is `no_video`, shown as "no info".

## What the page shows
| Section | Shows |
|---|---|
| Header | date filter (UTC days, both included; the app's session days, 1 Jun – 17 Oct), and a search for a session or client connection ID (the whole ID or its first 8+ characters; one match opens it) |
| Sessions | every app session, with and without telemetry events, by the app's start time |
| Client connections | client connections with telemetry: connected, not_connected and unknown |
| What needs attention | sessions with more than one `pipeline.connect.attempt`, a `pipeline.connect.failure`, a failure then a later success, a success then a later failure, `client_reconnected` (and 10 or more), events but no `session_ended`; and failed sessions per reason. A session can be in several rows |
| Why client connections didn't connect | not_connected client connections per reason, and those in sessions where no client connected |
| Errors recorded, per client connection | each error + code: times recorded; tagged client connections hit (click to list them), how many didn't connect and connected anyway, % didn't connect = didn't connect ÷ (didn't connect + connected); untagged clients apart. ice.candidate.error is last, marked as a warning. Errors that name no client remain in the underlying session timeline but are not shown as a separate diagnostics column |
| Errors per day | a bar chart (Recharts): not_connected client connections per day for the 5 errors that hit the most in the period, the rest as Other, the warning last. The key shows what the app sent with each error (message, phases, stages, error text; private bits hidden) |
| Side sheet | opens in place on every click: the list behind a number (50 per page; for a client reason, first how far its clients got and the errors they recorded), a search result, or one session. A session shows the app's start, end and end reason, the pipeline's outcome, each client's device, OS and browser (read from the user agent), every error, the warnings one row per event name with counts, and all events 100 per page. Escape closes it; Tab stays inside it |

## Run it
Needs Node.js 20+, the `cockroachdb` Docker container running (with `gamearena_source` restored), and the pipeline run at least once (`just run`). From the project folder:
```
just dashboard
```
That installs the packages and starts it. Without just, run `npm install` then `npm run dev` in this `frontend` folder (or `npm run build` then `npm start` for the faster built version).
Then open http://localhost:3000 (or http://127.0.0.1:3000). It only listens on this machine, not the network, and `proxy.ts` refuses requests addressed to any other host name. Ctrl+C stops it.

It uses the pipeline's settings and defaults (`DB_HOST` 127.0.0.1, `DB_PORT` 26257, `DB_NAME` gamearena_analytics, `DB_USER` root, `DB_PASSWORD` not set). To change them, put them in a `.env.local` file here.

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
| `proxy.ts` | refuses any request not addressed to localhost |

## Check it
With no dates picked: Client connections = `just report` report 2. Sessions tagged connected, failed and no_attempt (in the side sheet's lists) = report 1, counted by the app's start time instead of the first event, so a range can differ at its edges.
