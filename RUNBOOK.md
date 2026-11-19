# GameArena pipeline: runbook

## 1. Overview
The pipeline reads telemetry events from `session_telemetry_events` and classifies each ended session and each of its client connections. A session can have several client connections, for example retries or reconnects. The results are stored in three tables and used for analytics. The raw telemetry is never modified.

| Table | Description |
|---|---|
| `session_tags` | one row per session: tag, failure reason, start time |
| `connection_tags` | one row per client connection: its session, tag, reason, start time |
| `pipeline_runs` | one row per run: start, finish, status, sessions processed, error |

## 2. Prerequisites
- Python 3 with the dependencies: `pip install -r requirements.txt`
- CockroachDB holding the telemetry tables
- Docker Desktop, for the local setup (the database runs in a container named `cockroachdb`)
- just: `winget install --id Casey.Just` (then open a new terminal)

The `justfile` is written for the local setup: Windows PowerShell, with the SQL files run through the `cockroachdb` container. On a server, run `python -m pipeline ...` directly and run the `.sql` files with that server's SQL client.

## 3. Configuration
Settings are read from environment variables in `pipeline/config.py`. The defaults are for the local setup.

| Setting | Local default | Purpose | On a server |
|---|---|---|---|
| `DB_HOST` | `127.0.0.1` | database host | the server's address |
| `DB_PORT` | `26257` | database port | as provided |
| `DB_NAME` | `gamearena_analytics` | database name | as provided |
| `DB_USER` | `root` | database user | a real user |
| `DB_PASSWORD` | none | database password | set it (never put it in the code) |
| `DB_SSLMODE` | `disable` | encryption | `require` |
| `BATCH_SIZE` | `200` | sessions per batch | 200 is fine |
| `WAIT_SECONDS` | `30` | interval between rounds in `just live` | as needed |

## 4. Commands
| Command | Description |
|---|---|
| `just` | list the commands |
| `just setup` | create the three tables if they don't exist (safe to repeat) |
| `just run` | process all pending sessions, then stop |
| `just run 20` | process at most 20 sessions and their connections, then stop |
| `just live` | process new sessions every `WAIT_SECONDS` until Ctrl+C |
| `just status` | tag totals, sessions waiting, the last 5 runs and their duration |
| `just check` | validate the saved results against the raw events |
| `just report` | generate the analytics reports |
| `just report-file` | save the reports to `Documents\gamearena-report.txt` |
| `just explore` | inspect the raw data's tables, columns and event names |
| `just reset` | clear the three generated tables (asks first; raw data untouched) |

There is no date-range option: a run always processes the next ended sessions that aren't tagged yet.

## 5. Running the pipeline
**Initial setup:** creates the tables.
```
just setup
```
**Test with a limited number of sessions:** processes 20 sessions, then validates them. In `just check`, every `*_wrong` column must be 0.
```
just run 20
just check
```
**Process all pending sessions:** works in batches of `BATCH_SIZE`, saving each session together with its connections in one commit.
```
just run
```
**Run continuously:** checks for newly ended sessions every `WAIT_SECONDS`.
```
just live
```
**Stop the pipeline:** press Ctrl+C. Batches that were already saved are kept, the unfinished batch is discarded, and the run is recorded as `failed (KeyboardInterrupt)`.

**Resume processing:** already-tagged sessions are skipped, so this continues where it stopped.
```
just run
```
**Check processing status:**
```
just status
```
**Generate analytics:**
```
just report
```
Run one copy of the pipeline at a time. Saving is an UPSERT, so re-processing never creates duplicate rows.

## 6. Tags and error definitions
Only events recorded up to the session's first `session_ended` count.

**Session tags** (all of the session's events):
| Tag | Meaning |
|---|---|
| `connected` | a `pipeline.connect.success` event was recorded |
| `failed` | a `pipeline.connect.attempt` was recorded, but no success |
| `no_attempt` | neither an attempt nor a success was recorded |

**Connection tags** (only events carrying that `connection_id`; host connections aren't tagged, because they carry no success or failure events):
| Tag | Meaning |
|---|---|
| `connected` | this connection recorded a success |
| `not_connected` | the application sent events on it, but no success was recorded |
| `unknown` | no application events were recorded for it (system events only) |

**Failure reasons**, evaluated in this priority order (the first match wins):
| Reason | What it means | Evidence |
|---|---|---|
| `setup_error` | the recorded failure happened during setup | the last `pipeline.connect.failure` has phase `pre-connect` |
| `error_while_connecting` | the recorded failure happened while connecting | the last failure has phase `connecting` |
| `error_other` | a failure was recorded in another phase | the last failure has any other phase |
| `video_connection_failed` | the video connection entered a failed state | `webrtc.connection.state` = `failed` |
| `someone_never_joined` | (sessions only) host or client join evidence is missing | no `host_connected` or no `client_connected` |
| `no_video` | none of the above matched | fallback |

A reason describes what was recorded, not a root cause. For example, `setup_error` doesn't mean a network problem: it only means the last recorded failure was in the setup phase. Report 5 shows the application's own error code and text.

Notes:
- The connect attempt and almost every `pipeline.connect.failure` event carry no `connection_id`. So setup errors appear in `session_tags` only, and connection reasons are mostly `no_video` or `video_connection_failed`.
- Each `connection_id` belongs to exactly one session (checked in the data, and by `just check`).
- Don't add session and connection numbers together. A `connected` session can contain `not_connected` connections.

## 7. Reports
`just report` prints these, in this order. Days are UTC.

| # | Report | Purpose |
|---|---|---|
| 1 | Session summary | sessions, connected, failed, no_attempt, % connected |
| 2 | Daily session summary | the same, per day |
| 3 | Session failure reasons | the most common reasons, with % of failed sessions |
| 4 | Daily session failures | failure reasons per day |
| 5 | Application errors | the app's recorded error (code, phase, stage, text) behind each failed session, with `error_id`, sessions affected, first and last seen |
| 6 | Connection summary | client connections: connected, not_connected, unknown, % connected |
| 7 | Daily connection summary | the same, per day |
| 8 | Connection failure reasons | not_connected connections by reason, with sessions affected and how many were in sessions that still connected |

## 8. Useful SQL queries
Open the SQL shell with `docker exec -it cockroachdb ./cockroach sql --insecure -d gamearena_analytics` (`\q` to leave).
```sql
-- unsuccessful connections, newest first
SELECT session_id, connection_id, reason, started_at
FROM connection_tags WHERE tag = 'not_connected'
ORDER BY started_at DESC LIMIT 20;

-- all connections of one session
SELECT connection_id, tag, reason, started_at
FROM connection_tags WHERE session_id = 'SESSION_ID' ORDER BY started_at;

-- one connection's events
SELECT recorded_at, coalesce(payload->>'event', event_type::STRING) AS event, payload
FROM session_telemetry_events WHERE connection_id = 'CONNECTION_ID' ORDER BY recorded_at, id;

-- session results on one date
SELECT tag, reason, count(*) FROM session_tags
WHERE (started_at AT TIME ZONE 'UTC')::DATE = '2026-10-13' GROUP BY tag, reason ORDER BY 3 DESC;

-- connection failure reasons
SELECT reason, count(*) AS connections FROM connection_tags
WHERE tag = 'not_connected' GROUP BY reason ORDER BY connections DESC;
```

## 9. Troubleshooting
| Problem | What to do |
|---|---|
| database connection fails (timeout) | check that Docker is running, that `docker ps` lists `cockroachdb`, and the `DB_*` settings |
| a run fails | `just status` shows the error next to the run. Fix the cause and `just run` again; saved batches are kept |
| a run shows `still running` but nothing happens | the process ended unexpectedly (crash, killed, machine or database lost), so the run couldn't record its end. The next run continues normally |
| sessions are waiting | `just run` |
| `no_end_event` in `just check` is above 0 | those sessions never sent `session_ended`, so they can't be tagged |
| `just check` shows a `*_wrong` above 0 | find the affected rows by comparing the tag tables with the raw events (section 8), and check the rules in `pipeline/tags.py` |
| connection `not_tagged_yet` stays above 0 after `just run` | first find which sessions they belong to: `SELECT session_id, count(*) FROM session_tags s WHERE NOT EXISTS (SELECT 1 FROM connection_tags c WHERE c.session_id = s.session_id) GROUP BY 1;` lists tagged sessions without connections (some sessions genuinely have none). If they were tagged before `connection_tags` existed, `just reset` then `just run` fills them in |
| the pipeline needs to stop | Ctrl+C |
| `just` is not recognised | install it (section 2) and reopen the terminal |
| a report shows unexpected numbers | check the definitions in section 6, then inspect the affected rows (section 8) |
