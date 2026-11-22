# Command output examples

These are **anonymized examples based on local test output**, not live results. Values change as new telemetry is processed. Long outputs are shortened here; the actual SQL client prints its full query results.

## Setup and processing

`just setup` creates missing derived tables. It does not import GameArena telemetry.

```text
$ just run 20
Pipeline started: database gamearena_analytics on 127.0.0.1:26257, batch size 200
Saved 20 sessions and 31 client connections (total 20 sessions)
Done. 20 sessions tagged this round
Pipeline stopped
```

`just run` processes the rest. `just live` polls for new ended sessions; Ctrl+C stops it. `just status` reports progress:

```text
Tagged sessions: 6,501 (connected 5,614, failed 879, no_attempt 8)
Tagged client connections: 9,829 (connected 7,533, not_connected 2,109, unknown 187)
Sessions waiting to be tagged: 0
```

## Validation: `just check`

The first result checks sessions; the second checks client connections. A fully processed *unchanged* dataset should have zero pending eligible records and zero mismatches. `no_end_event` is not a mismatch.

```text
ended_sessions | no_end_event | tagged | not_tagged_yet | tags_wrong | reasons_wrong | dates_wrong
          6501 |           45 |   6501 |              0 |          0 |             0 |           0

client_connections | tagged | not_tagged_yet | sessions_wrong | tags_wrong | reasons_wrong | dates_wrong
              9829 |   9829 |              0 |              0 |          0 |             0 |           0
```

## Main analytics: `just report`

**1. Session outcomes** — one session counts once, even if it had several client connections.

```text
sessions | connected | failed | no_attempt | connected_percent
    6501 |      5614 |    879 |          8 |              86.4
```

**2. Client connection outcomes** — one connection ID counts once; unsuccessful connections can belong to sessions that ultimately connected.

```text
client_connections | connected | not_connected | unknown | connected_percent
              9829 |      7533 |          2109 |     187 |              76.6
```

**3. Failed session reasons** — our classification for each unsuccessful session, not an application error log.

```text
reason                  | failed_sessions | percent_of_failed
setup_error             |             342 |              38.9
no_video                |             267 |              30.4
video_connection_failed |             155 |              17.6
someone_never_joined    |             110 |              12.5
error_while_connecting  |               5 |               0.6
```

**4. Unsuccessful client connection reasons** — counts individual connection IDs, not failed sessions. A successful session can appear here.

```text
reason                  | not_connected_connections | affected_sessions | in_connected_sessions
no_video                |                      1279 |               793 |                   713
video_connection_failed |                       791 |               271 |                   230
error_while_connecting  |                        39 |                19 |                    32
```

`in_connected_sessions` counts **connections belonging to successful sessions**, not distinct successful sessions. The displayed sample abbreviates the actual output columns; the full query also prints `percent_of_not_connected`.

## Daily trends: `just trends`

These are the two daily versions of the outcome summaries. Dates use UTC. Rows are omitted below for readability; the real command prints all dates.

```text
day        | sessions | connected | failed | no_attempt | connected_percent
2026-10-15 |      345 |       309 |     36 |          0 |              89.6
2026-10-16 |      325 |       290 |     35 |          0 |              89.2
... other dates omitted ...
(63 rows in the referenced local dataset)

day        | client_connections | connected | not_connected | unknown | connected_percent
2026-10-15 |                571 |       429 |           138 |       4 |              75.1
2026-10-16 |                472 |       356 |           113 |       3 |              75.4
... other dates omitted ...
(61 rows in the referenced local dataset)
```

## Diagnostic application errors: `just errors`

This shows the **last explicit** `pipeline.connect.failure` for each failed session with an error event. These are a subset of the failed sessions already counted in report 3. Actual messages are omitted from this public example.

```text
session_reason         | error_code | phase       | stage     | error_text    | affected_sessions
setup_error            | 500        | pre-connect | Session   | <hidden>      | 324
error_while_connecting | 500        | connecting  | Websocket | <hidden>      |   3
```

## Raw generated records: `just tables`

Shows up to **10 rows each** from `session_tags`, `connection_tags`, and `pipeline_runs`. These are database rows, not new analytics reports.

```text
session_id | tag       | reason       | started_at   | run_id
SESSION_01 | connected | NULL         | <timestamp>  | RUN_01
SESSION_02 | failed    | setup_error  | <timestamp>  | RUN_01
... remaining preview rows omitted ...

connection_id | session_id | tag           | reason    | started_at   | run_id
CONNECTION_01 | SESSION_01 | connected     | NULL      | <timestamp>  | RUN_01
CONNECTION_02 | SESSION_01 | not_connected | no_video  | <timestamp>  | RUN_01
... remaining preview rows omitted ...

run_id | started_at  | finished_at | status | sessions_tagged | error
RUN_01 | <timestamp> | <timestamp> | ok     |            6501 | NULL
```

## Other commands

`just explore` displays the source schema and available event names. `just sql` opens an interactive SQL shell; exit with `\q`. `just dashboard` starts the dashboard at http://localhost:3000 (Ctrl+C stops it); it shows the same numbers as `just report`, plus the sessions behind each failure reason. `just reset` deletes derived records only and is for **disposable local databases**, never shared environments. See [RUNBOOK.md](RUNBOOK.md) for installation and troubleshooting.
