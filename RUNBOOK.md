# GameArena pipeline: runbook

## 1. What it does
It reads every **ended** session from `session_telemetry_events`. The raw tables are only read, never changed. It saves:
- **`session_tags`**: one row per session: did the player get in (`connected` / `failed` / `no_attempt`), and why not.
- **`connection_tags`**: one row per **client connection** of those sessions. A session can have several (retries, reconnects after a drop), so one can work while another doesn't.
- **`pipeline_runs`**: one row per run: when it ran, ok or failed, how many sessions.

It works in batches of `BATCH_SIZE` sessions. A session and its connections are saved in the same commit. Only events up to the moment a session ended count; anything later is app retries. A session already in `session_tags` is skipped, so re-running never repeats work.

## 2. Prerequisites
- **Docker Desktop** running, with the `cockroachdb` container (`docker ps` lists it). To start it: `& "D:\DockerDesktop\app\Docker Desktop.exe"`, then wait about a minute.
- **Python 3** with psycopg: `pip install -r requirements.txt`
- **just**: `winget install --id Casey.Just`, then open a new PowerShell window. Run every command from the project folder.
- **Settings** come from environment variables, with laptop defaults (`pipeline/config.py`): `DB_HOST` 127.0.0.1, `DB_PORT` 26257, `DB_NAME` gamearena_analytics, `DB_USER` root, `DB_PASSWORD` none, `DB_SSLMODE` disable (`require` on a real server), `BATCH_SIZE` 200, `WAIT_SECONDS` 30. The SQL recipes use the local `cockroachdb` container.

## 3. Commands
| Command | What it does |
|---|---|
| `just` | lists the commands |
| `just setup` | creates `session_tags`, `connection_tags` and `pipeline_runs` if missing (safe to repeat) |
| `just run` | tags everything waiting, then stops |
| `just run 20` | tags only 20 sessions (and their connections), then stops |
| `just live` | tags new sessions every `WAIT_SECONDS`; **Ctrl+C stops it** |
| `just status` | totals for sessions and client connections, sessions waiting, last 5 runs with how long they took |
| `just check` | two rows (sessions, then client connections): every `*_wrong` must be 0; `not_tagged_yet` is 0 after a full run |
| `just report` | the 6 reports (section 5) |
| `just report-file` | saves the reports to `Documents\gamearena-notes\report.txt` (they contain error texts, so not in the repo) |
| `just explore` | the raw data's tables, columns, event names and payload fields |
| `just reset` | empties our 3 tables (asks first; raw data untouched) |

There's no date-range option: a run always takes the next ended, untagged sessions.

**Typical use:** `just setup`, `just run 20`, `just check`, `just run`, `just report`. Day to day: leave `just live` running, or use `just run` whenever you want fresh numbers.

**Stopping:** Ctrl+C. Saved batches stay saved, the unfinished batch is thrown away, and the run is recorded as `failed (KeyboardInterrupt)`. The next run continues where it stopped.

**One copy only:** run one pipeline at a time. Saving is an UPSERT, so a duplicate never creates a second row, but two copies would do the same work twice.

## 4. What the tags and reasons mean
**Sessions** (`session_tags`), from all the session's events before it ended:
| Tag | Meaning |
|---|---|
| `connected` | has `pipeline.connect.success` |
| `failed` | has `pipeline.connect.attempt`, but no success |
| `no_attempt` | has neither |

**Client connections** (`connection_tags`), from that connection's own events (the ones with its `connection_id`) before the session ended:
| Tag | Meaning |
|---|---|
| `connected` | this connection has `pipeline.connect.success` |
| `not_connected` | the app sent events on it, but there's no success |
| `unknown` | only system events: the app sent nothing on it. **Not counted as a failure** |

**Reasons**, checked in this order (first match wins):
| Reason | Evidence |
|---|---|
| `setup_error` | the last `pipeline.connect.failure` has phase `pre-connect` |
| `error_while_connecting` | the last failure has phase `connecting` |
| `error_other` | the last failure has some other phase |
| `video_connection_failed` | no failure logged, but `webrtc.connection.state` = `failed` |
| `someone_never_joined` | (sessions only) no `host_connected` or no `client_connected` |
| `no_video` | none of the above |

Things to know:
- **Setup errors happen before any connection exists**: the app's connect attempt and almost all failures carry no `connection_id`. So they show only in `session_tags`, and connection reasons are mostly `no_video` or `video_connection_failed`.
- **Never add session and connection numbers together.** A `connected` session can still contain `not_connected` connections (a drop).
- **Host connections aren't tagged**: the data only has `host_connected`, `ws_error` and `host_disconnected` for them, so there's no ok or failed evidence.

The rules are in `pipeline/tags.py`; `sql/check.sql` re-checks them in plain SQL.

## 5. Reading the reports (`just report`)
1. **Overall**: sessions, connected, failed, no_attempt, % connected.
2. **Per day** (session start day, UTC): the same, per day. Look for low % connected.
3. **Failure reasons**: what to fix first, with % of failed sessions.
4. **Reasons per day**: which reason caused a bad day.
5. **Exact app errors**: the last error behind each failed session (code, phase, stage, error text), with a short `error_id`, sessions affected and first/last seen. The rows add up to report 3's error reasons.
6. **Client connections that didn't connect**: one row per kind, split by reason. The 5 rows add up to `not_connected`:
   - `in_session_never_connected`: the player never got in at all.
   - `retried_before_success`: it failed, but the player got in later.
   - `reconnect_after_link_lost`: the player was in, the earlier connection's video or network link was lost, and this reconnect failed. **These are the real mid-game drops.**
   - `reconnect_after_clean_end`: the earlier connection ended without a lost-link signal (e.g. a reload). Not a proven drop.
   - `opened_while_still_connected`: the earlier connection was still working. Not a drop.

   Limit: "link lost" means it happened at some point on the earlier connection before the session ended, not necessarily right before the reconnect.

## 6. Useful queries
SQL shell: `docker exec -it cockroachdb ./cockroach sql --insecure -d gamearena_analytics` (leave with `\q`).
```sql
-- one session's events in order
SELECT recorded_at, coalesce(payload->>'event', event_type::STRING) AS event, connection_id, payload->>'phase' AS phase,
       payload->>'state' AS state, payload->>'code' AS code, payload->>'reason' AS error_text
FROM session_telemetry_events WHERE session_id = 'PASTE-ID' ORDER BY recorded_at, id;

-- one session's client connections
SELECT connection_id, started_at, tag, reason FROM connection_tags WHERE session_id = 'PASTE-ID' ORDER BY started_at;

-- the sessions with one reason
SELECT session_id, started_at FROM session_tags WHERE reason = 'setup_error' ORDER BY started_at DESC LIMIT 20;

-- one day's results
SELECT tag, reason, count(*) FROM session_tags WHERE started_at::DATE = '2026-10-13' GROUP BY tag, reason ORDER BY 3 DESC;

-- the run history
SELECT * FROM pipeline_runs ORDER BY started_at DESC;
```

## 7. Troubleshooting
| Problem | What to do |
|---|---|
| `connection timeout` / `failed to connect to the docker API` | Docker is closed: start Docker Desktop, wait, check `docker ps` |
| a run shows `failed` in `just status` | the error is shown next to it; fix the cause and run again (saved batches are kept) |
| a run shows `still running` but nothing is happening | the database went away mid-run, so the run couldn't record its end. Harmless: the next run continues |
| `waiting` is above 0 | new sessions have ended: `just run` |
| `no_end_event` (in `just check`) is above 0 | those sessions never sent `session_ended`, so they're never tagged (a known limit) |
| connection `not_tagged_yet` stays above 0 after a full run | the sessions were tagged before `connection_tags` existed: `just reset`, then `just run` |
| a `*_wrong` in `just check` isn't 0 | the saved results differ from the rules: `just reset`, `just run`, `just check` |
| `just` is not recognised | install it (section 2) and open a new PowerShell window |
