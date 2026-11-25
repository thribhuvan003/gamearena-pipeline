# GameArena dashboard

A small read-only dashboard over the pipeline's results (the pipeline is in `../backend`). It runs on your own machine only, because the pages show real session IDs.

## Problem statement
**What data we have:** the pipeline's three tables in CockroachDB:
- `session_tags`: one row per ended session (connected, failed or no_attempt), with a failure reason and start time.
- `connection_tags`: one row per client connection (connected, not_connected or unknown), with its session.
- `pipeline_runs`: the run history (not shown here).

The raw events are in `session_telemetry_events`.

**What we want to see:** the numbers first, then the sessions behind them.

**Out of scope for now:** grouping errors into categories, hours streamed, deployment, changing the pipeline or the database.

**Rules:** the dashboard only reads (`SELECT`), uses the same SQL as the pipeline's `backend/sql/report.sql`, and every number must match `just report`.

## What the page shows
| Section | Shows |
|---|---|
| Date filter | pick From and To (UTC days, both included) and press Show; every section below uses that period. Empty = all dates |
| Sessions | total, connected, failed, no_attempt, % connected (report 1) |
| Client connections | total, connected, not_connected, unknown, % connected (report 2) |
| Why client connections didn't connect | not_connected client connections per reason (`connection_tags`); `no_video` is shown as "no info" (tried, no failure event, no failed video state). Reasons that exist only per session (setup_error, someone_never_joined) are one line underneath. Click a reason and it opens in place: the errors its clients recorded (error + code, phase, stage, clients; "No error recorded"; warnings last), then the latest 500 clients with session, client number, device and browser. Click a client and its session opens in place |
| Errors recorded, per client connection | every event the app logged as an error, grouped by error + code (`code` or `errorCode` from the payload): times recorded, client connections hit, how many didn't connect and how many connected anyway, ordered by the share that didn't connect. ice.candidate.error is always last, marked as a warning. Errors that name no client (most setup failures) are listed underneath, per session. Wider than `just errors`, which covers only failed sessions' setup failures |
| Errors in client connections that didn't connect, per day | a bar chart (Recharts): per day, how many client connections that didn't connect recorded each error + code, one colour per error, the warning last in grey. The key on the left shows what the app sent with each error: its message, phases, stages and error text (private bits hidden), with counts |
| Session (opened in place, or `/session/<id>`) | the app's start, end and end reason; the pipeline's outcome (or "Not classified"); each client's device, OS and browser (guessed from the user agent), access type and outcome, the opened client highlighted; and the first 1,000 events in time order with who sent them, code, phase, stage and message (addresses, links, IDs and tokens hidden) |

## Run it
Needs Node.js 20+, the `cockroachdb` Docker container running, and the pipeline run at least once (`just run`). The session page also reads the `gamearena_source` database: the app's sessions and client connections, restored from the 11 Nov 2026 backup. From the project folder:
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
| `components/*.tsx` | one file per section: date filter, summary cards, reasons, reason detail, session view, error table, error chart, session timeline (`ErrorChart.tsx` is the only one that runs in the browser) |
| `lib/queries.ts` | the data: the database connection and every SQL the dashboard runs |
| `lib/format.ts` | number and time formatting, and hiding private bits in messages |
| `proxy.ts` | refuses any request not addressed to localhost |

## Check it
With no dates picked, `just report` matches the page: report 1 = Sessions cards, report 2 = Client connections cards; report 3 (failed sessions per reason) matches the session-only line under the reasons table for those reasons.
