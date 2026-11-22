# GameArena pipeline — runbook

## Purpose

The pipeline reads GameArena telemetry and classifies ended sessions and their client connections. It stores the results for investigation and analytics. It does not modify source telemetry.

**Three stored tables** (not three competing reports):

| Table | One row represents | Why it exists |
|---|---|---|
| `session_tags` | One ended session | Overall session outcome and reason |
| `connection_tags` | One client connection | Individual connection outcome, linked to its session |
| `pipeline_runs` | One processing round | When the pipeline ran and whether it succeeded |

One session can contain multiple client connections. The counts must not be added together.

## Local development: WSL/Linux (recommended) or Windows

These `just` recipes work in Linux/WSL shells and in native Windows terminals. On Windows, **WSL Ubuntu is recommended** because the deployment environment is mainly Linux. The SQL commands use a local Docker CockroachDB container named `cockroachdb`. Production database access is configured separately.

1. Install Python 3, a virtual environment, `just` (version 1.23+), and Docker CLI access. On Ubuntu 24.04 or later: `sudo apt update && sudo apt install python3-venv python3-pip just`. For native Windows, install Python and `just` (`winget install --id Casey.Just`).
2. In WSL, enable Docker Desktop WSL integration. On Linux or native Windows, start the local container. Verify that `docker ps` lists `cockroachdb`.
3. Import the telemetry backup first. `just setup` creates only the three *derived* tables; it does not import source telemetry.
4. From the repository root, on Linux/WSL run:

```bash
python3 -m venv .venv
source .venv/bin/activate
python3 -m pip install -r requirements.txt
just setup
just run 20
just check
just run
just check
just report
```

On native Windows, activate the environment with `.venv\\Scripts\\activate` (PowerShell: `.venv\\Scripts\\Activate.ps1`) and use `python -m pip install -r requirements.txt` before the same `just` commands.

All SQL recipes target the local Docker database `gamearena_analytics`. The Python process uses the `DB_*` environment variables in `pipeline/config.py`; ensure they point to the **same** database. Never use `--insecure` for a production database.

## Commands

| Command | Result |
|---|---|
| `just` | List all commands |
| `just setup` | Create missing derived tables |
| `just run 20` | Process up to 20 pending ended sessions and their connections |
| `just run` | Process every pending ended session in batches |
| `just live` | Check for new ended sessions every `WAIT_SECONDS` until Ctrl+C |
| `just status` | Show tags, pending sessions, and recent processing rounds |
| `just check` | Compare stored tags against raw events |
| `just report` | Show the four main analytics summaries |
| `just trends` | Show daily session and connection outcomes |
| `just errors` | Show recorded errors for failed sessions that have explicit error events |
| `just tables` | Show up to ten records from each derived table |
| `just explore` | Show source tables, columns, event names and fields |
| `just sql` | Open the local SQL shell; exit with `\q` |
| `just dashboard` | Start the dashboard at http://localhost:3000 (needs Node.js 20+); Ctrl+C stops it. See [dashboard/README.md](dashboard/README.md) |
| `just reset` | Delete generated rows and run history; **disposable local databases only** |

See [COMMANDS.md](COMMANDS.md) for **sample terminal outputs**. The runbook does not duplicate them.

## Understanding the analytics

`just report` has four summaries, each answering a different question:

| Report | Unit | Question answered |
|---|---|---|
| 1. Session outcomes | Sessions | Did the ended session ever record connection success? |
| 2. Client connection outcomes | Client connections | Did each individual connection record success? |
| 3. Failed session reasons | Failed sessions | What classification was assigned to an unsuccessful session? |
| 4. Unsuccessful connection reasons | Connections without success | Which classifications appeared on individual unsuccessful connections, including within successful sessions? |

`just trends` contains the two *daily versions* of the outcome summaries. `just errors` drills into **actual recorded application error details** for the subset of failed sessions with a `pipeline.connect.failure` event. It is not another independent set of failures. `just tables` previews **stored records**, not aggregated statistics.

### Classification definitions

| Level | Tag | Exact meaning |
|---|---|---|
| Session | `connected` | At least one `pipeline.connect.success` recorded in that session |
| Session | `failed` | Attempt recorded, no success recorded |
| Session | `no_attempt` | No attempt and no success recorded |
| Connection | `connected` | Success recorded for that connection ID |
| Connection | `not_connected` | Application events recorded for that ID, but no success event |
| Connection | `unknown` | Only system events recorded for that ID |

The failure reason rules are prioritized: last `pipeline.connect.failure` phase (`pre-connect`, `connecting`, other non-null phase), then `webrtc.connection.state = failed`, then missing host/client join event (sessions only), otherwise `no_video` as a fallback. See `pipeline/tags.py` for exact rules.

**Do not interpret** `not_connected` as proof of a dropped connection, `no_video` as proof of a particular root cause, or `unknown` as proof of a user failure. Many failure events have no connection ID and therefore appear only at session level.

## Investigate one connection

Use `just tables` to find an ID, then `just sql` and query:

```sql
SELECT session_id, connection_id, tag, reason, started_at
FROM connection_tags
WHERE tag = 'not_connected'
ORDER BY started_at DESC LIMIT 20;

SELECT connection_id, tag, reason, started_at
FROM connection_tags
WHERE session_id = 'REPLACE_WITH_REAL_SESSION_UUID'
ORDER BY started_at;

SELECT recorded_at, event_type, payload
FROM session_telemetry_events
WHERE connection_id = 'REPLACE_WITH_REAL_CONNECTION_UUID'
ORDER BY recorded_at, id;
```

Only events up to a session’s first `session_ended` are classified. Host connections and events without connection IDs are not connection-tagged.

## Troubleshooting

| Symptom | Check |
|---|---|
| `just` or `python3` missing | Install it in the terminal environment actually running `just` |
| `docker` not found or container unavailable | Check Docker Desktop WSL integration (or Linux Docker), then `docker ps` |
| Source table missing | Ensure the backup is imported into `gamearena_analytics` |
| `just check` shows `*_wrong > 0` | Compare affected raw events and saved tags; do not blindly reset |
| `not_tagged_yet > 0` after a limited run | Expected; use `just run` to process the remaining ended sessions |
| `no_end_event > 0` | No end event was found for those sessions; they are not eligible for this pipeline |
| Run fails | Inspect `just status`, credentials and database reachability |

Saved batches survive Ctrl+C. This implementation is intended to run as one pipeline instance at a time. Do not run `just reset` against a shared or production database.

## Deployment boundary

On Linux servers, run `python3 -m pipeline run` using secured database settings and a supervised process. The local Docker `just` SQL commands are developer tooling, **not** a production deployment configuration. Dashboard/admin services and access controls are separate future work.
