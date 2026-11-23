# GameArena dashboard

A small read-only dashboard over the pipeline's results (the pipeline is in `../backend`). It runs on your own machine only, because the pages show real session IDs.

## Problem statement
**What data we have:** the pipeline's three tables in CockroachDB:
- `session_tags`: one row per ended session (connected, failed or no_attempt), with a failure reason and start time.
- `connection_tags`: one row per client connection (connected, not_connected or unknown), with its session.
- `pipeline_runs`: the run history (not shown here).

The raw events are in `session_telemetry_events`.

**What we want to see:** the numbers first, then the sessions behind them.

**Out of scope for now:** error categories, hours streamed, deployment, changing the pipeline or the database.

**Rules:** the dashboard only reads (`SELECT`), uses the same SQL as the pipeline's `backend/sql/report.sql`, and every number must match `just report`.

## What the page shows
| Section | Shows |
|---|---|
| Date filter | pick From and To (UTC days, both included) and press Show; every section below uses that period. Empty = all dates |
| Sessions | total, connected, failed, no_attempt, % connected (report 1) |
| Client connections | total, connected, not_connected, unknown, % connected (report 2) |
| Why sessions failed | failed sessions per reason (report 3). Click a reason to list its sessions |
| Errors recorded | every error-level event as the app named it: times recorded, sessions it happened in, and how many of those sessions still connected |
| Errors per day | a bar chart (Recharts): how many times each error was recorded per day, one colour per error |
| Session page | click a session ID: its outcome and its client connections |

## Run it
Needs Node.js 20+, the `cockroachdb` Docker container running, and the pipeline run at least once (`just run`). From the project folder:
```
just dashboard
```
That installs the packages and starts it. Without just, run `npm install` then `npm run dev` in this `frontend` folder.
Then open http://localhost:3000 (or http://127.0.0.1:3000). It only listens on this machine, not the network. Ctrl+C stops it.

It uses the pipeline's settings and defaults (`DB_HOST` 127.0.0.1, `DB_PORT` 26257, `DB_NAME` gamearena_analytics, `DB_USER` root, `DB_PASSWORD` not set). To change them, put them in a `.env.local` file here.

## Files
| File | What it does |
|---|---|
| `app/page.tsx` | the dashboard page |
| `app/session/[id]/page.tsx` | one session's page |
| `app/layout.tsx`, `app/globals.css` | the HTML frame, title and the only stylesheet |
| `components/*.tsx` | the date filter, cards, tables and chart, one file each (`ErrorChart.tsx` is the only one that runs in the browser) |
| `lib/queries.ts` | every SQL the dashboard runs, in one place |
| `lib/db.ts` | the database connection |
| `lib/format.ts` | number and time formatting |

## Check it
With no dates picked, `just report` matches the page: report 1 = Sessions cards, report 2 = Client connections cards, report 3 = failure reasons.
