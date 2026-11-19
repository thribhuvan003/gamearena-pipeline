# GameArena session pipeline: runbook

## 1. What it does
It reads every **ended** session from `session_telemetry_events` and decides whether the player **connected**, **failed** (tried but never connected) or **never tried** (`no_attempt`). For failed sessions it also records **why**. It saves one row per session in `session_tags` and one row per run in `pipeline_runs`. The raw telemetry tables are only read, never changed.

It works in batches of 200 sessions, with one commit per batch. Only events up to the moment a session ended count; anything later is app retries. A session that already has a row in `session_tags` is skipped, so re-running never repeats work.

## 2. Prerequisites
- **Docker Desktop** running, with the `cockroachdb` container (`docker ps` lists it). To start it: `& "D:\DockerDesktop\app\Docker Desktop.exe"`, then wait about a minute.
- **Python 3** with psycopg: `pip install -r requirements.txt`
- **Database settings** come from environment variables, with defaults for this laptop (`pipeline/config.py`):

| Variable | Default | Meaning |
|---|---|---|
| `DB_HOST` | `127.0.0.1` | database address |
| `DB_PORT` | `26257` | database port |
| `DB_NAME` | `gamearena_analytics` | database name |
| `DB_USER` | `root` | user |
| `DB_PASSWORD` | (none) | password |
| `DB_SSLMODE` | `disable` | `require` on a real server |
| `BATCH_SIZE` | `200` | sessions per batch |
| `WAIT_SECONDS` | `30` | wait between rounds in `just live` |

The `just` recipes that run SQL files use the local `cockroachdb` container. On another server, run the same `.sql` files with that server's SQL client.

## 3. Install `just`
```
winget install --id Casey.Just
```
Open a **new** PowerShell window, then run every command from the project folder. `just` on its own lists the commands.

## 4. Commands
| Command | What it does |
|---|---|
| `just setup` | creates `session_tags` and `pipeline_runs` if they don't exist (safe to repeat) |
| `just run` | tags everything waiting, then stops |
| `just run 20` | tags only 20 sessions, then stops (test on a small piece first) |
| `just live` | tags new sessions, waits 30 s, repeats; **Ctrl+C stops it** |
| `just status` | totals per tag, how many are waiting, the last 5 runs |
| `just check` | recomputes every tag, reason and date from the raw events; every `*_wrong` column must be 0 (`not_tagged_yet` is 0 after a full run) |
| `just report` | the 6 reports (see section 7) |
| `just report-file` | saves the reports to `Documents\gamearena-notes\report.txt` |
| `just explore` | the raw data's tables, columns, event names and payload fields |
| `just reset` | empties `session_tags` and `pipeline_runs` (asks first; raw data untouched) |

There's no date-range option: a run always takes the next ended, untagged sessions.

## 5. Typical use
First time on a database:
```
just setup
just run 20
just check
just run
just report
```
Try 20 first, check them, then run the rest.
Day to day: `just live` (leave it running), or `just run` whenever you want fresh numbers.
Start from zero: `just reset`, then `just run`.

**Stopping:** press Ctrl+C. Batches that were already saved stay saved. The unfinished batch is thrown away, and that run is recorded as `failed (KeyboardInterrupt)`. The next run picks up where it stopped.

**One copy only:** run a single pipeline at a time. Saving uses UPSERT, so a session tagged twice still has one row, but two copies would waste work on the same batch.

## 6. What the tags and reasons mean
| Tag | Meaning (from the session's events before it ended) |
|---|---|
| `connected` | has `pipeline.connect.success` |
| `failed` | has `pipeline.connect.attempt`, but no success |
| `no_attempt` | has neither |

Failed sessions get **one reason**, checked in this order (first match wins):
| Reason | Evidence |
|---|---|
| `setup_error` | the last `pipeline.connect.failure` has phase `pre-connect` |
| `error_while_connecting` | the last failure has phase `connecting` |
| `error_other` | the last failure has some other phase |
| `video_connection_failed` | no failure logged, but `webrtc.connection.state` = `failed` |
| `someone_never_joined` | no `host_connected` or no `client_connected` event |
| `no_video` | none of the above: both sides joined, no error, no video |

The rules are in `pipeline/tags.py` (`tag_session`, `failure_reason`).

## 7. Reading the reports (`just report`)
1. **Overall:** sessions, connected, failed, no_attempt, % connected.
2. **Per day** (the session's start day, UTC): the same columns per day. Look for days with a low % connected.
3. **Failure reasons:** each reason and its % of failed sessions. This tells you what to fix first.
4. **Reasons per day:** which reason caused a bad day.
5. **Exact app errors:** for each reason, the app's code, phase, stage and error text, with sessions affected and first/last seen. Only errors before the session ended count.
6. **Pipeline health:** all sessions, `no_end_event` (never sent `session_ended`, so they can't be tagged), tagged, waiting, and the last run's status, time and sessions per second.

## 8. Useful queries
Open the SQL shell with `docker exec -it cockroachdb ./cockroach sql --insecure -d gamearena_analytics` (leave with `\q`).
```sql
-- one session's events in order
SELECT recorded_at, coalesce(payload->>'event', event_type::STRING) AS event, payload->>'phase' AS phase,
       payload->>'state' AS state, payload->>'code' AS code, payload->>'reason' AS error_text
FROM session_telemetry_events WHERE session_id = 'PASTE-ID' ORDER BY recorded_at;

-- the sessions with one reason
SELECT session_id, started_at FROM session_tags WHERE reason = 'setup_error' ORDER BY started_at DESC LIMIT 20;

-- one day's results
SELECT tag, reason, count(*) FROM session_tags WHERE started_at::DATE = '2026-10-13' GROUP BY tag, reason ORDER BY 3 DESC;

-- the run history
SELECT * FROM pipeline_runs ORDER BY started_at DESC;
```

## 9. Troubleshooting
| Problem | What to do |
|---|---|
| `connection timeout` or `failed to connect to the docker API` | Docker is closed: start Docker Desktop, wait, check `docker ps` |
| a run shows `failed` in `just status` | the error text is shown next to it. Fix the cause and run again; saved batches are kept |
| a run stays `running` but nothing is happening | the database went away mid-run, so the run couldn't record itself. Harmless: the next run continues |
| `waiting` is above 0 | new sessions have ended: `just run` |
| `no_end_event` is above 0 | those sessions never sent `session_ended`, so they're never tagged (a known limit) |
| a `*_wrong` column in `just check` isn't 0 | the saved results differ from the rules: `just reset`, then `just run`, then `just check` again |
| `just` is not recognised | install it (section 3) and open a new PowerShell window |
