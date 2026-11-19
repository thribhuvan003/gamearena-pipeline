# GameArena pipeline: runbook

The pipeline reads GameArena telemetry and tags every ended session and each of its client connections as connected or not, with a reason. Results go into three tables: `session_tags`, `connection_tags` and `pipeline_runs`. The telemetry tables are never changed.

## Before you start
- Docker Desktop running, with the `cockroachdb` container started (`docker ps` lists it).
- The telemetry already imported into the database `gamearena_analytics`.
- Python packages: `pip install -r requirements.txt`
- just: `winget install --id Casey.Just`, then open a new terminal.

**Run every command in PowerShell, from this project folder** (the one with `justfile`). Type `just` to list them all.

## Start here
The outputs below come from a local run. Long outputs are shortened and IDs are replaced (`SESSION_01`, ...).

**1. Create the tables** (only needed once; safe to repeat)
```
just setup
```

**2. Try 20 sessions**
```
just run 20
```
```
Saved 20 sessions and 31 client connections (total 20 sessions)
Done. 20 sessions tagged this round
```

**3. Check the results are right**: every `*_wrong` must be 0.
```
just check
```
```
 ended_sessions | no_end_event | tagged | not_tagged_yet | tags_wrong | reasons_wrong | dates_wrong
           6501 |           45 |   6501 |              0 |          0 |             0 |           0
```
A second, similar table follows for client connections. `not_tagged_yet` is 0 only after step 4.

**4. Tag everything that is waiting**
```
just run
```
```
Saved 200 sessions and 287 client connections (total 200 sessions)
... more 'Saved' lines ...
Done. 6481 sessions tagged this round
```

**5. See the progress**
```
just status
```
```
Tagged sessions: 6,501   (connected 5,614, failed 879, no_attempt 8)
Tagged client connections: 9,829   (connected 7,533, not_connected 2,109, unknown 187)
Sessions waiting to be tagged: 0
Last runs:
  2026-11-19 07:07  ok      6,481 sessions in 7.1 s
```

**6. Read the reports**
```
just report
```
It prints 8 reports. Two examples:
```
-- 1. Session summary
 sessions | connected | failed | no_attempt | connected_percent
     6501 |      5614 |    879 |          8 |              86.4

-- 3. Session failure reasons
          reason         | sessions | percent_of_failed
 setup_error             |      342 |              38.9
 no_video                |      267 |              30.4
 video_connection_failed |      155 |              17.6
 someone_never_joined    |      110 |              12.5
 error_while_connecting  |        5 |               0.6
```
The others: **2** the same summary per day, **4** failure reasons per day, **5** the app's own error code and text behind failed sessions, **6** client connection summary, **7** the same per day, **8** why connections failed, including those inside sessions that still connected. Days are UTC.

**7. Look at the saved rows**
```
just tables
```
```
 session_id |    tag    |        reason        |          started_at           | run_id
 SESSION_01 | connected | NULL                 | 2026-10-17 08:27:25.968597+00 | RUN_01
 ...
 SESSION_10 | failed    | someone_never_joined | 2026-10-17 07:28:04.750341+00 | RUN_01
```
It prints the newest 10 rows of each of the three tables.

## Other commands
| Command | What it does |
|---|---|
| `just live` | keeps running, tags new sessions every 30 s; Ctrl+C stops it |
| `just failures` | the newest 20 client connections that didn't connect, with their session |
| `just report-file` | saves the reports to `Documents\gamearena-report.txt` |
| `just explore` | shows the raw telemetry tables, columns and event names |
| `just sql` | opens the SQL shell for your own queries (`\q` to leave) |
| `just reset` | deletes all rows in the three tables (asks first); then `just run` rebuilds them |

Stopping with Ctrl+C is safe: saved batches stay, and the next `just run` continues where it stopped.

## What the tags mean
Only events up to the session's first `session_ended` count.

| Tag | Session | Client connection |
|---|---|---|
| `connected` | recorded `pipeline.connect.success` | this connection recorded a success |
| `failed` / `not_connected` | tried (`pipeline.connect.attempt`), no success | the app sent events on it, no success |
| `no_attempt` / `unknown` | never tried | the app sent no events on it |

**Reasons** (for failed / not_connected), the first match wins:
| Reason | Means |
|---|---|
| `setup_error` | the last recorded failure was in the setup phase (`pre-connect`) |
| `error_while_connecting` | the last recorded failure was in the `connecting` phase |
| `error_other` | the last recorded failure was in another phase |
| `video_connection_failed` | the video connection reached state `failed` |
| `someone_never_joined` | sessions only: no `host_connected` or no `client_connected` |
| `no_video` | none of the above |

A reason says what was recorded, not the root cause; report 5 shows the app's own error. Most failure events carry no connection ID, so setup errors mostly show up only on sessions.

## Your own queries
Open the shell with `just sql`, then paste a query. Replace the ID with one from `just tables` or `just failures`.
```sql
-- all connections of one session
SELECT connection_id, tag, reason, started_at FROM connection_tags
WHERE session_id = 'SESSION_ID' ORDER BY started_at;

-- one connection's events
SELECT recorded_at, coalesce(payload->>'event', event_type::STRING) AS event, payload
FROM session_telemetry_events WHERE connection_id = 'CONNECTION_ID' ORDER BY recorded_at, id;
```

## If something goes wrong
| Problem | Fix |
|---|---|
| connection timeout | start Docker and check `docker ps` lists `cockroachdb` |
| `relation "session_telemetry_events" does not exist` | the telemetry isn't imported yet |
| `just` is not recognised | install it (see Before you start) and open a new terminal |
| a run failed | `just status` shows the error; fix it and `just run` again |
| `just check` shows a `*_wrong` above 0 | a tag rule and the check disagree; compare `pipeline/tags.py` with `sql/check.sql` |
| `no_end_event` above 0 | those sessions have no `session_ended` event yet, so they can't be tagged |

## Settings
Python reads these environment variables (defaults are for this local setup): `DB_HOST` (127.0.0.1), `DB_PORT` (26257), `DB_NAME` (gamearena_analytics), `DB_USER` (root), `DB_PASSWORD`, `DB_SSLMODE` (disable), `BATCH_SIZE` (200), `WAIT_SECONDS` (30). The justfile's SQL commands always use the local `cockroachdb` container.
