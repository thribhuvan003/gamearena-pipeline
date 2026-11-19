# GameArena pipeline: runbook

The pipeline reads GameArena telemetry, classifies ended sessions and their client connections, and records a failure reason where one applies. The source telemetry tables are never modified.

| Table | Purpose |
|---|---|
| `session_tags` | one row per processed session: tag, reason, start time |
| `connection_tags` | one row per processed client connection: its session, tag, reason, start time |
| `pipeline_runs` | processing history: one row per run, with status, sessions processed and any error |

## Before you start
- Python 3 installed.
- Docker Desktop running, with the `cockroachdb` container started (`docker ps` lists it).
- The telemetry already imported into the database `gamearena_analytics`.
- Python packages: `pip install -r requirements.txt`
- just: `winget install --id Casey.Just`, then open a new terminal.

**Run every command in PowerShell, from this project folder** (the one with `justfile`). Type `just` to list them all.

## Start here
The outputs below come from a local run. Long outputs are shortened and IDs are replaced (`SESSION_01`, ...).

**1. Create the tables** (only needed once; repeating it changes nothing)
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

**3. Check those 20**: every `*_wrong` must be 0. `not_tagged_yet` counts what is still waiting.
```
just check
```
```
 ended_sessions | no_end_event | tagged | not_tagged_yet | tags_wrong | reasons_wrong | dates_wrong
           6501 |           45 |     20 |           6481 |          0 |             0 |           0

 client_connections | tagged | not_tagged_yet | sessions_wrong | tags_wrong | reasons_wrong | dates_wrong
               9829 |     31 |           9798 |              0 |          0 |             0 |           0
```
The first table is sessions, the second client connections.

**4. Tag everything that is waiting**
```
just run
```
```
Saved 200 sessions and 287 client connections (total 200 sessions)
... more 'Saved' lines ...
Done. 6481 sessions tagged this round
```

**5. Check everything**: now `not_tagged_yet` is 0 too.
```
just check
```
```
 ended_sessions | no_end_event | tagged | not_tagged_yet | tags_wrong | reasons_wrong | dates_wrong
           6501 |           45 |   6501 |              0 |          0 |             0 |           0

 client_connections | tagged | not_tagged_yet | sessions_wrong | tags_wrong | reasons_wrong | dates_wrong
               9829 |   9829 |              0 |              0 |          0 |             0 |           0
```

**6. See the progress**
```
just status
```
```
Tagged sessions: 6,501   (connected 5,614, failed 879, no_attempt 8)
Tagged client connections: 9,829   (connected 7,533, not_connected 2,109, unknown 187)
Sessions waiting to be tagged: 0
Last runs:
  2026-11-19 11:36  ok      6,481 sessions in 15.0 s
  2026-11-19 11:36  ok      20 sessions in 2.0 s
```

**7. Read the reports**
```
just report
```
| Report | What it shows |
|---|---|
| 1. Session summary | sessions by outcome: connected, failed, no_attempt, % connected |
| 2. Daily session summary | the same, per day |
| 3. Session failure reasons | failed sessions grouped by reason |
| 4. Daily session failures | failure reasons per day |
| 5. Application errors | failed sessions grouped by their last recorded app error (code, phase, stage, text) |
| 6. Connection summary | client connections by outcome: connected, not_connected, unknown, % connected |
| 7. Daily connection summary | the same, per day |
| 8. Connection failure reasons | not_connected connections by reason, the sessions affected, and how many were in sessions that still connected |

- Report 5 only includes failed sessions that recorded a `pipeline.connect.failure` event.
- Don't add session and connection numbers together: one session can have several connections.
- Days are UTC. The connection % counts `unknown` connections in the total.

Example, report 1:
```
 sessions | connected | failed | no_attempt | connected_percent
     6501 |      5614 |    879 |          8 |              86.4
```

**8. Look at the saved rows**
```
just tables
```
It prints three tables:
| Table | Rows shown |
|---|---|
| `session_tags` | 10 sessions with the latest start time |
| `connection_tags` | 10 client connections with the latest start time |
| `pipeline_runs` | the 10 latest runs |

```
 session_id |    tag    |        reason        |          started_at           | run_id
 SESSION_01 | connected | NULL                 | 2026-10-17 08:27:25.968597+00 | RUN_01
 ...
 SESSION_10 | failed    | someone_never_joined | 2026-10-17 07:28:04.750341+00 | RUN_01
```

## Other commands
| Command | What it does |
|---|---|
| `just live` | keeps running and tags new sessions every `WAIT_SECONDS` (30); Ctrl+C stops it |
| `just failures` | 20 not_connected client connections with the latest start time, with their session |
| `just report-file` | saves the reports to `Documents\gamearena-report.txt` |
| `just explore` | shows the raw telemetry tables, columns and event names |
| `just sql` | opens the SQL shell for your own queries (`\q` to leave) |

Stopping with Ctrl+C is safe: saved batches stay, and the next `just run` continues where it stopped.

**Local maintenance only:** `just reset` deletes every row in all three tables, including the run history (it asks first). `just run` then rebuilds the tags. Don't use it on a shared database.

## What the tags mean
Only events up to the session's first `session_ended` count. Tags describe what was recorded, not what the player did.

**Session tags**
| Tag | Meaning |
|---|---|
| `connected` | a `pipeline.connect.success` event was recorded |
| `failed` | a `pipeline.connect.attempt` was recorded, but no success |
| `no_attempt` | neither an attempt nor a success was recorded |

**Client connection tags**
| Tag | Meaning |
|---|---|
| `connected` | a success was recorded for this connection |
| `not_connected` | the app recorded events on this connection, but no success |
| `unknown` | no app events were recorded on this connection (system events only) |

Host connections and events without a connection ID aren't tagged at connection level.

**Failure reasons** (for `failed` and `not_connected`). The rules are checked in this order; the first match wins:
| Reason | Rule |
|---|---|
| `setup_error` | the last `pipeline.connect.failure` has phase `pre-connect` |
| `error_while_connecting` | the last failure has phase `connecting` |
| `error_other` | the last failure has another phase |
| `video_connection_failed` | `webrtc.connection.state` reached `failed` |
| `someone_never_joined` | sessions only: no `host_connected` or no `client_connected` |
| `no_video` | no rule above matched |

A reason is what was recorded, not a confirmed root cause; report 5 shows the app's own error. Most failure events carry no connection ID, so setup errors mostly appear only on sessions.

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
| connection timeout | start Docker, check `docker ps` lists `cockroachdb`, and check the settings below |
| `relation "session_telemetry_events" does not exist` | check you're on the right database and the telemetry is imported |
| `just` is not recognised | install it (see Before you start) and open a new terminal |
| a run failed | `just status` shows the error; fix it and `just run` again |
| `not_tagged_yet` above 0 | sessions are still waiting: `just run` |
| a `*_wrong` above 0 | look at the affected rows (`just sql`) and compare them with the rules above; the saved rows may be outdated, or a rule in `pipeline/tags.py` and `sql/check.sql` may differ |
| `no_end_event` above 0 | no `session_ended` event was found for those sessions, so they aren't tagged |

## Settings
Python reads these environment variables; the defaults are for this local setup.

| Variable | Local default |
|---|---|
| `DB_HOST` | `127.0.0.1` |
| `DB_PORT` | `26257` |
| `DB_NAME` | `gamearena_analytics` |
| `DB_USER` | `root` |
| `DB_PASSWORD` | not set |
| `DB_SSLMODE` | `disable` |
| `BATCH_SIZE` | `200` |
| `WAIT_SECONDS` | `30` |

The justfile's SQL commands (`setup`, `check`, `report`, `tables`, ...) always use the local `cockroachdb` container, whatever these variables say. Keep Python on the same local database.
