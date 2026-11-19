# GameArena pipeline: runbook

## 1. Overview
The pipeline reads GameArena telemetry and classifies sessions and client connections. Results are stored in three tables. The source tables are not modified.

| Table | Description |
|---|---|
| `session_tags` | one row per session: tag, failure reason, start time |
| `connection_tags` | one row per client connection: its session, tag, reason, start time |
| `pipeline_runs` | one row per run: start, finish, status, sessions processed, error |

## 2. Prerequisites
- Docker Desktop running, with the CockroachDB container `cockroachdb` started (`docker ps` lists it).
- The telemetry backup already imported into the database `gamearena_analytics` (tables `session_telemetry_events` and `session_telemetry_stats`). `just setup` creates only the three generated tables, not the database or the telemetry tables.
- Python 3 with the dependencies: `pip install -r requirements.txt`
- just: `winget install --id Casey.Just` (then open a new terminal)

**Where to run commands:** every `just` command runs in **PowerShell, from the project folder** (the folder that contains `justfile`). The SQL queries in section 9 run **inside the SQL shell** opened with `just sql`.

The `justfile` is written for the local setup: the SQL files run through the `cockroachdb` container, while Python uses the `DB_*` settings below. On a server, run `python -m pipeline ...` directly and run the `.sql` files with that server's SQL client.

## 3. Configuration
Settings are read from environment variables in `pipeline/config.py`. The defaults are for the local setup.

| Setting | Local default | Purpose | On a server |
|---|---|---|---|
| `DB_HOST` | `127.0.0.1` | database host | the server's address |
| `DB_PORT` | `26257` | database port | as provided |
| `DB_NAME` | `gamearena_analytics` | database name | as provided |
| `DB_USER` | `root` | database user | the configured database user |
| `DB_PASSWORD` | none | database password | set it (never put it in the code) |
| `DB_SSLMODE` | `disable` | encryption | `require` |
| `BATCH_SIZE` | `200` | sessions per batch (1 or more) | as needed |
| `WAIT_SECONDS` | `30` | interval between rounds in `just live` (1 or more) | as needed |

## 4. Commands
| Command | Description | What it runs |
|---|---|---|
| `just` | list the commands | |
| `just setup` | create the three generated tables if missing (existing tables are not changed) | `sql/setup.sql` |
| `just run` | process all pending sessions, then stop | `python -m pipeline run --once` |
| `just run 20` | process up to 20 pending sessions and their connections, then stop | `python -m pipeline run --once --limit 20` |
| `just live` | process new sessions every `WAIT_SECONDS` until Ctrl+C | `python -m pipeline run` |
| `just status` | tag totals, sessions waiting, the last 5 runs and their duration | `python -m pipeline status` |
| `just check` | validate the saved results against the raw events | `sql/check.sql` |
| `just report` | generate the analytics reports | `sql/report.sql` |
| `just report-file` | save the reports to `Documents\gamearena-report.txt` | `sql/report.sql` |
| `just tables` | preview the newest 10 rows of each generated table | SQL in the justfile |
| `just failures` | the newest 20 unsuccessful client connections | SQL in the justfile |
| `just explore` | inspect the raw data's tables, columns and event names | `sql/explore.sql` |
| `just sql` | open the SQL shell for your own queries (`\q` to leave) | `cockroach sql` in the container |
| `just reset` | clear the three generated tables (asks first; raw data untouched) | SQL in the justfile |

There is no date-range option: a run always processes the next ended sessions that aren't tagged yet.

## 5. Running the pipeline
All commands: PowerShell, project folder. The outputs below come from a local run; long tables are shortened, IDs are replaced (`SESSION_01`, ...) and error texts are hidden. Numbers change as new telemetry arrives.

**Initial setup:** creates the tables. A second run only prints the `NOTICE ... already exists` lines.
```
just setup
```
```
CREATE TABLE
CREATE TABLE
CREATE TABLE
```

**Test with a limited number of sessions:** processes up to 20 pending sessions.
```
just run 20
```
```
Pipeline started: database gamearena_analytics on 127.0.0.1:26257, batch size 200
Saved 20 sessions and 31 client connections (total 20 sessions)
Done. 20 sessions tagged this round
Pipeline stopped
```

**Validate the results:** every `*_wrong` must be 0. The first table is sessions, the second client connections. After `just run 20`, `not_tagged_yet` is above 0; after a full `just run` it is 0.
```
just check
```
```
  ended_sessions | no_end_event | tagged | not_tagged_yet | tags_wrong | reasons_wrong | dates_wrong
-----------------+--------------+--------+----------------+------------+---------------+--------------
            6501 |           45 |   6501 |              0 |          0 |             0 |           0
(1 row)

  client_connections | tagged | not_tagged_yet | sessions_wrong | tags_wrong | reasons_wrong | dates_wrong
---------------------+--------+----------------+----------------+------------+---------------+--------------
                9829 |   9829 |              0 |              0 |          0 |             0 |           0
(1 row)
```

**Process all pending sessions:** works in batches of `BATCH_SIZE`, saving each session together with its connections in one commit.
```
just run
```
```
Pipeline started: database gamearena_analytics on 127.0.0.1:26257, batch size 200
Saved 200 sessions and 287 client connections (total 200 sessions)
Saved 200 sessions and 267 client connections (total 400 sessions)
... 30 more 'Saved' lines ...
Saved 81 sessions and 126 client connections (total 6481 sessions)
Done. 6481 sessions tagged this round
Pipeline stopped
```

**Run continuously:** checks for newly ended sessions every `WAIT_SECONDS`.
```
just live
```
```
Pipeline started: database gamearena_analytics on 127.0.0.1:26257, batch size 200
Done. 0 sessions tagged this round
Waiting 30 s for new sessions (Ctrl+C to stop)
```

**Stop the pipeline:** press Ctrl+C. If a round is in progress, its saved batches are kept, the unfinished batch is discarded, and the run is recorded as `failed (KeyboardInterrupt)`. If `just live` is only waiting between rounds, no run is open, so nothing is recorded.
```
Stopped with Ctrl+C. Saved batches are kept; an unfinished batch was not saved.
Pipeline stopped
```

**Resume processing:** already-tagged sessions are skipped, so `just run` continues where it stopped.

**Check processing status:** `Last runs` lists runs that tagged something or failed; empty rounds are skipped.
```
just status
```
```
Tagged sessions: 6,501   (connected 5,614, failed 879, no_attempt 8)
Tagged client connections: 9,829   (connected 7,533, not_connected 2,109, unknown 187)
Sessions waiting to be tagged: 0
Last runs:
  2026-11-19 07:07  ok      6,481 sessions in 7.1 s
  2026-11-19 07:07  ok      20 sessions in 0.3 s
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
- The connect attempt never carries a `connection_id`, and most `pipeline.connect.failure` events don't either. So most setup errors appear only in `session_tags`, and connection reasons are mostly `no_video` or `video_connection_failed`.
- In the current data each `connection_id` belongs to one session. `just check` re-checks this (`sessions_wrong`).
- Don't add session and connection numbers together. A `connected` session can contain `not_connected` connections.

## 7. Reports
`just report` (PowerShell, project folder) prints these, in this order. Days are UTC.

| # | Report | Purpose |
|---|---|---|
| 1 | Session summary | sessions, connected, failed, no_attempt, % connected |
| 2 | Daily session summary | the same, per day |
| 3 | Session failure reasons | the most common reasons, with % of failed sessions |
| 4 | Daily session failures | failure reasons per day |
| 5 | Application errors | the app's last recorded error (code, phase, stage, text) for failed sessions that have a `pipeline.connect.failure` event, with `error_id`, sessions affected, first and last seen |
| 6 | Connection summary | client connections: connected, not_connected, unknown, % connected (`unknown` counts in the total) |
| 7 | Daily connection summary | the same, per day |
| 8 | Connection failure reasons | not_connected connections by reason, with sessions affected and how many were in sessions that still connected |

Output (error texts hidden):

**1. Session summary**
```
  sessions | connected | failed | no_attempt | connected_percent
-----------+-----------+--------+------------+--------------------
      6501 |      5614 |    879 |          8 |              86.4
(1 row)
```

**2. Daily session summary**
```
     day     | sessions | connected | failed | no_attempt | connected_percent
-------------+----------+-----------+--------+------------+--------------------
  2026-08-03 |        2 |         2 |      0 |          0 |             100.0
  2026-08-05 |        2 |         2 |      0 |          0 |             100.0
  2026-08-06 |        5 |         4 |      1 |          0 |              80.0
  ... 57 more rows ...
  2026-10-15 |      345 |       309 |     36 |          0 |              89.6
  2026-10-16 |      325 |       290 |     35 |          0 |              89.2
  2026-10-17 |       85 |        81 |      4 |          0 |              95.3
(63 rows)
```

**3. Session failure reasons**
```
          reason          | sessions | percent_of_failed
--------------------------+----------+--------------------
  setup_error             |      342 |              38.9
  no_video                |      267 |              30.4
  video_connection_failed |      155 |              17.6
  someone_never_joined    |      110 |              12.5
  error_while_connecting  |        5 |               0.6
(5 rows)
```

**4. Daily session failures**
```
     day     | setup_error | no_video | video_connection_failed | someone_never_joined | error_while_connecting | error_other
-------------+-------------+----------+-------------------------+----------------------+------------------------+--------------
  2026-08-06 |           0 |        1 |                       0 |                    0 |                      0 |           0
  2026-08-08 |           0 |        1 |                       0 |                    1 |                      0 |           0
  2026-08-09 |           0 |        1 |                       0 |                    0 |                      0 |           0
  ... 33 more rows ...
  2026-10-15 |           1 |       24 |                       7 |                    3 |                      1 |           0
  2026-10-16 |           4 |       22 |                       6 |                    3 |                      0 |           0
  2026-10-17 |           0 |        3 |                       0 |                    1 |                      0 |           0
(39 rows)
```

**5. Application errors**
```
          reason         | error_id | code |    phase    |   stage   |  error_text  | sessions | first_seen | last_seen
-------------------------+----------+------+-------------+-----------+--------------+----------+------------+-------------
  setup_error            | 3e6a7d   | 500  | pre-connect | Session   | <error text> |      324 | 2026-08-17 | 2026-10-16
  setup_error            | b6a5fc   | 500  | pre-connect | Session   | <error text> |       13 | 2026-09-30 | 2026-10-16
  setup_error            | dee75e   | 500  | pre-connect | Session   | <error text> |        5 | 2026-09-30 | 2026-10-16
  error_while_connecting | 828f01   | 500  | connecting  | Websocket | <error text> |        3 | 2026-09-30 | 2026-10-15
  error_while_connecting | e9721a   | 500  | connecting  | Session   | <error text> |        1 | 2026-10-01 | 2026-10-01
  error_while_connecting | 01cc46   | 500  | connecting  | Session   | <error text> |        1 | 2026-08-29 | 2026-08-29
(6 rows)
```

**6. Connection summary**
```
  client_connections | connected | not_connected | unknown | connected_percent
---------------------+-----------+---------------+---------+--------------------
                9829 |      7533 |          2109 |     187 |              76.6
(1 row)
```

**7. Daily connection summary**
```
     day     | client_connections | connected | not_connected | unknown | connected_percent
-------------+--------------------+-----------+---------------+---------+--------------------
  2026-08-03 |                  4 |         3 |             1 |       0 |              75.0
  2026-08-05 |                  3 |         3 |             0 |       0 |             100.0
  2026-08-06 |                 11 |        10 |             1 |       0 |              90.9
  ... 55 more rows ...
  2026-10-15 |                571 |       429 |           138 |       4 |              75.1
  2026-10-16 |                472 |       356 |           113 |       3 |              75.4
  2026-10-17 |                127 |        96 |            31 |       0 |              75.6
(61 rows)
```

**8. Connection failure reasons**
```
          reason          | connections | sessions | in_connected_sessions | percent_of_not_connected
--------------------------+-------------+----------+-----------------------+---------------------------
  no_video                |        1279 |      793 |                   713 |                     60.6
  video_connection_failed |         791 |      271 |                   230 |                     37.5
  error_while_connecting  |          39 |       19 |                    32 |                      1.8
(3 rows)
```

**Save the reports to a file** (kept outside the repository, because it contains error texts):
```
just report-file
```
```
Saved to C:\Users\<you>\Documents\gamearena-report.txt
```

## 8. Inspecting data
All commands: PowerShell, project folder. IDs below are replaced with `SESSION_01`, `CONNECTION_01`, `RUN_01`; the real commands print the full IDs.

**Preview the generated tables:** the newest 10 rows of `session_tags`, `connection_tags` and `pipeline_runs`.
```
just tables
```
```
  session_id |    tag    |        reason        |           started_at          | run_id
-------------+-----------+----------------------+-------------------------------+--------
  SESSION_01 | connected | NULL                 | 2026-10-17 08:27:25.968597+00 | RUN_01
  SESSION_02 | connected | NULL                 | 2026-10-17 08:11:54.495093+00 | RUN_01
  SESSION_03 | connected | NULL                 | 2026-10-17 08:11:40.585931+00 | RUN_01
  ... 7 more rows ...
(10 rows)

  connection_id | session_id |      tag      |  reason  |           started_at          | run_id
----------------+------------+---------------+----------+-------------------------------+--------
  CONNECTION_01 | SESSION_01 | connected     | NULL     | 2026-10-17 08:27:31.747918+00 | RUN_01
  CONNECTION_02 | SESSION_02 | connected     | NULL     | 2026-10-17 08:12:00.047804+00 | RUN_01
  CONNECTION_03 | SESSION_03 | connected     | NULL     | 2026-10-17 08:11:46.774695+00 | RUN_01
  ... 7 more rows ...
(10 rows)

  run_id |           started_at          |          finished_at          | status | sessions_tagged | error
---------+-------------------------------+-------------------------------+--------+-----------------+-------
  RUN_02 | 2026-11-19 11:25:50.106754+00 | 2026-11-19 11:25:50.137195+00 | ok     |               0 | NULL
  RUN_03 | 2026-11-19 11:25:44.683258+00 | 2026-11-19 11:25:44.819237+00 | ok     |               0 | NULL
  RUN_01 | 2026-11-19 07:07:53.201509+00 | 2026-11-19 07:08:00.305868+00 | ok     |            6481 | NULL
  RUN_04 | 2026-11-19 07:07:52.383214+00 | 2026-11-19 07:07:52.72984+00  | ok     |              20 | NULL
(4 rows)
```

**View unsuccessful client connections:** with the session each belongs to, newest first.
```
just failures
```
```
  session_id | connection_id |          reason         |           started_at
-------------+---------------+-------------------------+-------------------------------
  SESSION_01 | CONNECTION_01 | no_video                | 2026-10-17 08:08:43.603179+00
  SESSION_02 | CONNECTION_02 | no_video                | 2026-10-17 08:08:41.321437+00
  SESSION_01 | CONNECTION_03 | no_video                | 2026-10-17 07:47:35.364402+00
  ... 17 more rows ...
(20 rows)
```

**Inspect the source schema:** prints the raw tables, their columns, the event names and the JSON fields.
```
just explore
```

**Run your own SQL queries:** opens the SQL shell; type a query ending in `;`, and `\q` to leave.
```
just sql
```

## 9. Useful SQL queries
Run these inside the SQL shell (`just sql`). Replace `SESSION_ID` / `CONNECTION_ID` with a real ID from `just tables` or `just failures`.
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

-- tagged sessions with client connections missing from connection_tags (events up to the session's end)
SELECT DISTINCT e.session_id
FROM session_telemetry_events e
JOIN session_tags s ON s.session_id = e.session_id
WHERE e.connection_role = 'client' AND e.connection_id IS NOT NULL
  AND e.recorded_at <= (SELECT min(x.recorded_at) FROM session_telemetry_events x
                        WHERE x.session_id = e.session_id AND x.event_type = 'session_ended')
  AND NOT EXISTS (SELECT 1 FROM connection_tags c WHERE c.connection_id = e.connection_id)
LIMIT 20;
```

## 10. Troubleshooting
| Problem | What to do |
|---|---|
| database connection fails (timeout) | check that Docker is running, that `docker ps` lists `cockroachdb`, and the `DB_*` settings |
| `relation "session_telemetry_events" does not exist` | the telemetry backup isn't imported yet (section 2) |
| a run fails | `just status` shows the error next to the run. Fix the cause and `just run` again; saved batches are kept |
| a run shows `still running` but nothing happens | the process ended unexpectedly (crash, killed, machine or database lost), so the run couldn't record its end. The next run continues normally |
| sessions are waiting | `just run` |
| `no_end_event` in `just check` is above 0 | no `session_ended` event was found for those sessions, so they can't be tagged |
| `just check` shows a `*_wrong` above 0 | find the affected rows by comparing the tag tables with the raw events (section 9), and check the rules in `pipeline/tags.py` |
| connection `not_tagged_yet` stays above 0 after `just run` | list the affected sessions with the last query in section 9 (it also finds sessions missing only some connections). If they were tagged before `connection_tags` existed, rebuild with `just reset` then `just run`, on your local copy only; on a shared database, ask the team first |
| `--limit must be 1 or more` | use `just run` for everything, or `just run N` with N of 1 or more |
| the pipeline needs to stop | Ctrl+C |
| `just` is not recognised | install it (section 2) and reopen the terminal |
| a report shows unexpected numbers | check the definitions in section 6, then inspect the affected rows (sections 8 and 9) |
