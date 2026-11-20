# Commands

Every `just` command, what it does, and what it prints. Run them in a terminal (Linux or Windows) from the project folder.

The outputs come from a local run. Long tables are cut (`... N more rows ...`), IDs are replaced (`SESSION_01`, `CONNECTION_01`, `RUN_01`) and error texts are hidden. Numbers change as new telemetry arrives.

## `just`
Lists all the commands with a one-line description.

## `just setup`
Creates `session_tags`, `connection_tags` and `pipeline_runs` if they don't exist. Existing tables are left as they are.
```
CREATE TABLE
CREATE TABLE
CREATE TABLE
```
Run again, it also prints `NOTICE: relation "session_tags" already exists, skipping` (and the same for the other two).

## `just run 20`
Tags up to 20 waiting sessions and their client connections, then stops.
```
Pipeline started: database gamearena_analytics on 127.0.0.1:26257, batch size 200
Saved 20 sessions and 31 client connections (total 20 sessions)
Done. 20 sessions tagged this round
Pipeline stopped
```

## `just run`
Tags every waiting session, 200 at a time, then stops.
```
Pipeline started: database gamearena_analytics on 127.0.0.1:26257, batch size 200
Saved 200 sessions and 287 client connections (total 200 sessions)
Saved 200 sessions and 267 client connections (total 400 sessions)
... 30 more 'Saved' lines ...
Saved 81 sessions and 126 client connections (total 6481 sessions)
Done. 6481 sessions tagged this round
Pipeline stopped
```
With nothing waiting, it prints `Done. 0 sessions tagged this round`.

## `just live`
Keeps running: tags new sessions, waits 30 s, repeats. Ctrl+C stops it.
```
Pipeline started: database gamearena_analytics on 127.0.0.1:26257, batch size 200
Done. 0 sessions tagged this round
Waiting 30 s for new sessions (Ctrl+C to stop)
Stopped with Ctrl+C. Saved batches are kept; an unfinished batch was not saved.
Pipeline stopped
```

## `just status`
How many sessions and connections have each tag, how many are waiting, and the last runs with how long they took.
```
Tagged sessions: 6,501   (connected 5,614, failed 879, no_attempt 8)
Tagged client connections: 9,829   (connected 7,533, not_connected 2,109, unknown 187)
Sessions waiting to be tagged: 0
Last runs:
  2026-11-19 11:36  ok      6,481 sessions in 15.0 s
  2026-11-19 11:36  ok      20 sessions in 2.0 s
```

## `just check`
Works out every tag again from the raw events and compares it with what was saved. Every `*_wrong` must be 0. The first table is sessions, the second client connections.

After `just run 20`:
```
  ended_sessions | no_end_event | tagged | not_tagged_yet | tags_wrong | reasons_wrong | dates_wrong
-----------------+--------------+--------+----------------+------------+---------------+--------------
            6501 |           45 |     20 |           6481 |          0 |             0 |           0
(1 row)

  client_connections | tagged | not_tagged_yet | sessions_wrong | tags_wrong | reasons_wrong | dates_wrong
---------------------+--------+----------------+----------------+------------+---------------+--------------
                9829 |     31 |           9798 |              0 |          0 |             0 |           0
(1 row)
```
After `just run`:
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

## `just report`
Prints 8 reports, one after another. Days are UTC.

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

**5. Application errors** (error texts hidden)
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

## `just tables`
Shows 10 rows of each generated table, latest start time first.
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
  RUN_02 | 2026-11-19 11:44:02.8046+00   | 2026-11-19 11:44:02.816029+00 | ok     |               0 | NULL
  RUN_03 | 2026-11-19 11:43:59.750471+00 | 2026-11-19 11:43:59.874403+00 | ok     |               0 | NULL
  RUN_01 | 2026-11-19 11:36:56.028936+00 | 2026-11-19 11:37:11.042448+00 | ok     |            6481 | NULL
  RUN_04 | 2026-11-19 11:36:47.508384+00 | 2026-11-19 11:36:49.479084+00 | ok     |              20 | NULL
(4 rows)
```
Runs with 0 sessions are rounds that found nothing waiting.

## `just explore`
Shows what is in the raw telemetry: its tables, their columns, the allowed values, every event name, every payload field and every stats measure. Part of it:
```
              step
------------------------------
  ice.candidate.error
  ice.connection.state
  ice.gathering.complete
  ... 15 more rows ...
(18 rows)

      field
-----------------
  attempt
  auth_type
  candidateCount
  ... 17 more rows ...
(20 rows)
```

## `just sql`
Opens the SQL shell. Type a query ending in `;` and press Enter; `\q` leaves. Example queries are in [RUNBOOK.md](RUNBOOK.md#your-own-queries).

## `just reset`
Deletes every row in the three generated tables, including the run history. It asks for confirmation first. The raw telemetry is not touched. `just run` rebuilds everything.
```
DELETE 6501
DELETE 9829
DELETE 4
```
