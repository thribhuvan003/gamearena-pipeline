# Sample output

What each command prints, copied from a real local run. Long tables are cut to their first and last rows, as marked. Error texts are hidden; no session or connection IDs appear in these outputs. Numbers change as new telemetry arrives.

## `just run 20`
```
Pipeline started: database gamearena_analytics on 127.0.0.1:26257, batch size 200
Saved 20 sessions and 31 client connections (total 20 sessions)
Done. 20 sessions tagged this round
Pipeline stopped
```

## `just run`
```
Pipeline started: database gamearena_analytics on 127.0.0.1:26257, batch size 200
Saved 200 sessions and 287 client connections (total 200 sessions)
Saved 200 sessions and 267 client connections (total 400 sessions)
... 30 more 'Saved' lines ...
Saved 81 sessions and 126 client connections (total 6481 sessions)
Done. 6481 sessions tagged this round
Pipeline stopped
```

## `just status`
```
Tagged sessions: 6,501   (connected 5,614, failed 879, no_attempt 8)
Tagged client connections: 9,829   (connected 7,533, not_connected 2,109, unknown 187)
Sessions waiting to be tagged: 0
Last runs:
  2026-11-19 07:07  ok      6,481 sessions in 7.1 s
  2026-11-19 07:07  ok      20 sessions in 0.3 s
```

## `just check`
Every `*_wrong` must be 0. The first table is sessions, the second client connections.
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
### 1. Session summary
Overall session outcomes.
```
  sessions | connected | failed | no_attempt | connected_percent
-----------+-----------+--------+------------+--------------------
      6501 |      5614 |    879 |          8 |              86.4
(1 row)
```

### 2. Daily session summary
Session outcomes per day (UTC).
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

### 3. Session failure reasons
The most common reasons, with their share of failed sessions.
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

### 4. Daily session failures
Failure reasons per day.
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

### 5. Application errors
The app's own last recorded error behind each failed session (error texts hidden here).
```
          reason         | error_id | code |    phase    |   stage   |                                            error_text                                            | sessions | first_seen | last_seen
-------------------------+----------+------+-------------+-----------+--------------------------------------------------------------------------------------------------+----------+------------+-------------
  setup_error            | 3e6a7d   | 500  | pre-connect | Session   | <error text>                                                                                     |      324 | 2026-08-17 | 2026-10-16
  setup_error            | b6a5fc   | 500  | pre-connect | Session   | <error text>                                                                                     |       13 | 2026-09-30 | 2026-10-16
  setup_error            | dee75e   | 500  | pre-connect | Session   | <error text>                                                                                     |        5 | 2026-09-30 | 2026-10-16
  error_while_connecting | 828f01   | 500  | connecting  | Websocket | <error text>                                                                                     |        3 | 2026-09-30 | 2026-10-15
  error_while_connecting | e9721a   | 500  | connecting  | Session   | <error text>                                                                                     |        1 | 2026-10-01 | 2026-10-01
  error_while_connecting | 01cc46   | 500  | connecting  | Session   | <error text>                                                                                     |        1 | 2026-08-29 | 2026-08-29
(6 rows)
```

### 6. Connection summary
Client connection outcomes.
```
  client_connections | connected | not_connected | unknown | connected_percent
---------------------+-----------+---------------+---------+--------------------
                9829 |      7533 |          2109 |     187 |              76.6
(1 row)
```

### 7. Daily connection summary
Client connection outcomes per day.
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

### 8. Connection failure reasons
Why client connections had no success, and how many were in sessions that still connected.
```
          reason          | connections | sessions | in_connected_sessions | percent_of_not_connected
--------------------------+-------------+----------+-----------------------+---------------------------
  no_video                |        1279 |      793 |                   713 |                     60.6
  video_connection_failed |         791 |      271 |                   230 |                     37.5
  error_while_connecting  |          39 |       19 |                    32 |                      1.8
(3 rows)
```
