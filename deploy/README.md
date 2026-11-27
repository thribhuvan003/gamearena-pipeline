# Deploying the pipeline

The pipeline runs as **one pod** in the existing cluster. It reads the app's tables, writes only its own 5 tables, and checks for new events every 30 seconds. The dashboard is deployed separately, later.

## What it touches

| | Tables | Access |
|---|---|---|
| Reads | `session_telemetry_events`, `session_client_connections` (`EVENTS_TABLE`, `CLIENTS_TABLE`) | `SELECT` only |
| Writes | `session_facts`, `error_events`, `session_tags`, `connection_tags`, `pipeline_runs` | rows only, no schema changes |

Every write is an `UPSERT` by key or a `DELETE` of its own rows, so a restart or a repeated run never duplicates anything.

## Steps

1. **Tables** (admin, once): run `database/setup.sql` in the database that will hold the pipeline's tables. Best is a database of its own: `setup.sql` creates the 5 tables if they're missing and alters them, so it must not meet an existing table with the same name (`session_tags`, `connection_tags`, `session_facts`, `error_events`, `pipeline_runs`). It's safe to run again.
2. **User** (admin, once): edit the database names in `database/grants.sql`, run it, then set the password with `ALTER USER gamearena_pipeline WITH PASSWORD '...'`. The last line, `SHOW GRANTS FOR gamearena_pipeline`, lists what it can do, including grants it gets through roles. It changes no shared permissions.
3. **Image**: `docker build -t <registry>/gamearena-pipeline:<tag> .` from the repo root, then push it.
4. **Secret**: `kubectl -n <namespace> create secret generic gamearena-pipeline-db --from-literal=DB_PASSWORD='...' --from-file=ca.crt=<cluster CA>`
5. **Deploy**: edit the lines marked `CHANGE` in `deploy/pipeline.yaml`, then `kubectl apply -f deploy/pipeline.yaml`.
6. **Watch**: `kubectl -n <namespace> logs -f deploy/gamearena-pipeline`. The first round processes every session (a full build); after that each round says `No new events` or `Done: N sessions ...`.

## How it behaves

- **One copy only:** `replicas: 1` and `strategy: Recreate`, so an update stops the old pod before starting the new one.
- **Stopping:** on SIGTERM it stops like Ctrl+C. An unfinished batch is rolled back, finished batches are kept, and the run is marked failed in `pipeline_runs`. If it's killed before that, the next run marks the leftover `running` row as failed.
- **Database down:** it logs `Database not reachable, will try again` and retries every 30 s. Any other error exits, and Kubernetes restarts it.
- **Late events:** each round counts the events of the last 60 minutes (`LATE_EVENTS_MINUTES`). If that count changes, the sessions in that window are processed again, even when no newer timestamp arrived. Anything older is caught by the full rebuild, which the same process runs once a day (`REBUILD_HOURS`). Its last run is stored in `pipeline_runs`, so a restart doesn't reset the schedule. No separate CronJob is needed.
- **Deleted telemetry:** a full rebuild removes rows of all four result tables whose raw events are gone, so the results follow whatever the app keeps.
- **Clock errors:** events dated in the future can't push the pipeline's "newest processed" mark ahead.
- **Stuck queries** are cancelled after 10 minutes (`STATEMENT_TIMEOUT_SECONDS`), and the round is retried.

## Checking it

`database/check.sql` works out every result again in plain SQL. Every `*_wrong` and `stale_*` must be 0. It names this laptop's tables; replace them with `EVENTS_TABLE` and `CLIENTS_TABLE` before running it elsewhere. `just integration` tests late events, restarts, rebuilds, deleted telemetry and the restricted user in a throwaway database.

## Questions for the cluster owner

- Which database holds `session_telemetry_events` and `session_client_connections`, and where should the pipeline's 5 tables live?
- The internal service name for CockroachDB (`DB_HOST`), the namespace, and the image registry.
- Is `recorded_at` set by the server or by the client's clock?
- Does `session_telemetry_events` have indexes on `recorded_at` and on `session_id`? Each round reads by both.
- Is there an insert-time column or other ingestion cursor on the events? It would replace the 60-minute window and the daily rebuild.
- Does the app delete old telemetry? If so, should the pipeline's results follow it (today they do, after each full rebuild)?
- CockroachDB lets every user create tables in a `public` schema by default. `grants.sql` leaves that alone. Does the database owner want it changed?
